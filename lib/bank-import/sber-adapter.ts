// lib/bank-import/sber-adapter.ts
// Phase 22 (22-03): СберБизнес bank statement parser.
// Single sheet. Merged cells → read raw:false. Headers at rows 9-10, data from row 11.
// Account number: sheet name OR row 4 ~col 11 regex.
// "Счет" column: DOUBLE-ENTRY — col 4 = debit-side acct, col 8 = credit-side acct.
//   Sub-header row 10 has "Дебет" at the debit-side index, "Кредит" at the credit-side index.
//   For DEBIT (outgoing): our acct = debit side, counterparty = credit side.
//   For CREDIT (incoming): our acct = credit side, counterparty = debit side.
// "Дата проводки": Excel serial-date (e.g. "46024.18197") — parsed via parseDateCell.
// "Банк" column: extractBic via /БИК\s+(\d{9})/.
// Phase 22 (22-06): extracts opening/closing balances from trailing summary rows.
// NO imports of next-auth, next/*, or Prisma — vitest must run this without env.

import * as XLSX from "xlsx"
import { parseDateCell, parseAmount, parseBalanceAmount, parseRussianDate, extractBic, buildHeaderMap } from "./normalize"
import type { ParsedTransaction, AccountBalance } from "./types"

const ACCOUNT_NUMBER_RE = /(\d{20})/
const INN_RE = /^\d{7,12}$/

/**
 * Splits a Sber "Счет" cell into its parts. Реальный формат — ТРИ строки:
 *   "40802810600008277746\n381255446410\nТОКТОНОВ ..." → account\nINN\nИмя(ФИО для ИП).
 * ИНН может отсутствовать (тогда 2-я строка — имя), имя может отсутствовать
 * (служебные счета банка, напр. "70601...\n7707083" → только счёт+ИНН).
 * Returns { account, inn, name } — любой может быть null.
 */
function splitAccountCell(cell: string | null | undefined): {
  account: string | null
  inn: string | null
  name: string | null
} {
  if (!cell) return { account: null, inn: null, name: null }
  const parts = String(cell).trim().split("\n").map((p) => p.trim()).filter(Boolean)
  const account = parts[0] ?? null
  let inn: string | null = null
  let nameStart = 1
  if (parts[1] && INN_RE.test(parts[1])) {
    inn = parts[1]
    nameStart = 2
  }
  const name = parts.slice(nameStart).join(" ").trim() || null
  return { account, inn, name }
}

/**
 * Parses a СберБизнес single-sheet workbook.
 * Note: The workbook should be read with raw:false for merged cells.
 * Row 4: account number (~col 11)
 * Row 5: company name (col 0)
 * Row 9: primary headers
 * Row 10: sub-headers — "Дебет" and "Кредит" mark the two account sub-columns
 * Rows 11+: transaction data
 * Trailing summary rows contain "Входящий остаток" and "Исходящий остаток":
 *   ["","Входящий остаток","","","","","","0,00","","","","62,066.92","","","","","","(П)","","01 января 2026 г.","","",""]
 *   The balance is the value with the largest absolute value (the "0,00" is the zero side).
 *   The date cell matches /\d{1,2}\s+[а-яё]+\s+\d{4}/i (Russian written date).
 *
 * The "Счет" merged header spans two sub-columns:
 *   debitAcctCol  (row10 index of "Дебет",  fallback 4) = debit-side account (our account on outgoing)
 *   creditAcctCol (row10 index "Кредит", fallback 8) = credit-side account (counterparty on outgoing)
 * Direction logic:
 *   "Сумма по дебету" set  → DEBIT,  counterparty = creditAcctCol
 *   "Сумма по кредиту" set → CREDIT, counterparty = debitAcctCol
 * Returns { transactions, balances } per Phase 22 (22-06).
 */
export function parseSberStatement(workbook: XLSX.WorkBook): { transactions: ParsedTransaction[]; balances: AccountBalance[] } {
  const sheetName = workbook.SheetNames[0]!
  const sheet = workbook.Sheets[sheetName]!

  // raw:false для корректного чтения merged cells (строки слились в одну ячейку)
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
  })

  if (rows.length < 12) return { transactions: [], balances: [] }

  // Попытаться найти номер счёта из строки 4 (~колонка 11)
  let accountNumber = sheetName
  if (rows[4]) {
    for (const cell of rows[4]) {
      const s = String(cell ?? "").trim()
      const m = s.match(ACCOUNT_NUMBER_RE)
      if (m) {
        accountNumber = m[1]!
        break
      }
    }
  }

  // Компания из строки 5 (первый непустой элемент)
  let companyName: string | null = null
  if (rows[5]) {
    for (const cell of rows[5]) {
      const s = String(cell ?? "").trim()
      if (s) { companyName = s; break }
    }
  }

  // Заголовки из строки 9 — buildHeaderMap по непустым ячейкам
  const headerRow9 = rows[9] ?? []
  const hm = buildHeaderMap(headerRow9)

  // Sub-header row 10: find debit-side and credit-side account column indices.
  // "Дебет" marks our-acct column for outgoing; "Кредит" marks counterparty column for outgoing.
  const subHeaderRow10 = rows[10] ?? []
  let debitAcctCol = 4  // fallback
  let creditAcctCol = 8 // fallback
  for (let idx = 0; idx < subHeaderRow10.length; idx++) {
    const cell = String(subHeaderRow10[idx] ?? "").trim()
    if (/^дебет$/i.test(cell)) debitAcctCol = idx
    else if (/^кредит$/i.test(cell)) creditAcctCol = idx
  }

  // ── Балансы: сканируем все строки для "Входящий остаток" / "Исходящий остаток" ──
  // Real structure:
  // ["","Входящий остаток","","","","","","0,00","","","","62,066.92","","","","","","(П)","","01 января 2026 г.","","",""]
  // ["","Исходящий остаток","","","","","","0,00","","","","107,489.58","","","","","","(П)","","10 июня 2026 г.","","",""]
  // Strategy: for each остаток row, collect all numeric cell values; use the largest absolute value as balance.
  // Date: find cell matching /\d{1,2}\s+[а-яё]+\s+\d{4}/i
  let openingBalance: number | null = null
  let closingBalance: number | null = null
  let balanceDate: Date | null = null

  for (const row of rows) {
    // Find the label cell
    let labelIdx = -1
    let labelKind: "opening" | "closing" | null = null
    for (let ci = 0; ci < row.length; ci++) {
      const cell = String(row[ci] ?? "").trim()
      if (/^входящий остаток$/i.test(cell)) { labelIdx = ci; labelKind = "opening"; break }
      if (/^исходящий остаток$/i.test(cell)) { labelIdx = ci; labelKind = "closing"; break }
    }
    if (labelIdx === -1 || labelKind === null) continue

    // Collect numeric cells in this row (exclude the label cell itself)
    let maxAbs = 0
    let dominantBalance: number | null = null
    let rowDate: Date | null = null

    for (let ci = 0; ci < row.length; ci++) {
      if (ci === labelIdx) continue
      const cell = row[ci]
      if (cell == null) continue
      const cellStr = String(cell).trim()
      if (cellStr === "") continue

      // Try to parse as Russian date
      const ruDate = parseRussianDate(cellStr)
      if (ruDate) { rowDate = ruDate; continue }

      // Try to parse as amount
      const amt = parseBalanceAmount(cellStr)
      if (amt !== null && Math.abs(amt) > maxAbs) {
        maxAbs = Math.abs(amt)
        dominantBalance = amt
      }
    }

    if (labelKind === "opening") openingBalance = dominantBalance
    if (labelKind === "closing") { closingBalance = dominantBalance; balanceDate = rowDate }
  }

  const balances: AccountBalance[] = [{
    accountNumber,
    currency: "RUR",
    openingBalance,
    closingBalance,
    balanceDate,
  }]

  const transactions: ParsedTransaction[] = []

  // Данные с строки 11
  for (let i = 11; i < rows.length; i++) {
    const row = rows[i]!

    // Пропустить полностью пустые строки
    if (row.every((c) => c == null || String(c).trim() === "")) continue

    // Дата — из колонки "Дата проводки".
    // Value is an Excel serial like "46024.1819675928" (General format, raw:false gives it as string).
    const dateVal = hm["Дата проводки"] !== undefined
      ? row[hm["Дата проводки"]!]
      : null
    const date = parseDateCell(dateVal as string | number | null)
    if (!date) continue

    const debit = parseAmount(
      hm["Сумма по дебету"] !== undefined ? row[hm["Сумма по дебету"]!] as string | null : null
    )
    const credit = parseAmount(
      hm["Сумма по кредиту"] !== undefined ? row[hm["Сумма по кредиту"]!] as string | null : null
    )

    const direction: "DEBIT" | "CREDIT" = (debit ?? 0) > 0 ? "DEBIT" : "CREDIT"
    const amount = (debit ?? 0) > 0 ? debit! : (credit ?? 0)

    if (amount === 0 && debit == null && credit == null) continue

    // Double-entry counterparty logic:
    //   DEBIT (outgoing): our acct = debitAcctCol, counterparty acct = creditAcctCol
    //   CREDIT (incoming): our acct = creditAcctCol, counterparty acct = debitAcctCol
    const debitCell = String(row[debitAcctCol] ?? "").trim()
    const creditCell = String(row[creditAcctCol] ?? "").trim()

    let counterpartyCell: string
    let companyInn: string | null = null

    if (direction === "DEBIT") {
      counterpartyCell = creditCell
      const { inn } = splitAccountCell(debitCell) // our side INN
      companyInn = inn
    } else {
      counterpartyCell = debitCell
      const { inn } = splitAccountCell(creditCell) // our side INN
      companyInn = inn
    }

    const { account: counterpartyAccount, inn: counterpartyInn, name: counterpartyName } =
      splitAccountCell(counterpartyCell)

    // Колонка "Банк (БИК и наименование)": извлечь БИК regex
    const bankCell = hm["Банк (БИК и наименование)"] !== undefined
      ? String(row[hm["Банк (БИК и наименование)"]!] ?? "")
      : null
    const counterpartyBic = extractBic(bankCell)

    const docNumber = hm["№ документа"] !== undefined
      ? String(row[hm["№ документа"]!] ?? "").trim() || null
      : null

    const operationType = hm["ВО"] !== undefined
      ? String(row[hm["ВО"]!] ?? "").trim() || null
      : null

    const purpose = hm["Назначение платежа"] !== undefined
      ? String(row[hm["Назначение платежа"]!] ?? "").trim()
      : ""

    transactions.push({
      companyName,
      companyInn,
      accountNumber,
      currency: "RUR", // СберБизнес — рублёвые счета
      date,
      docNumber,
      operationType,
      debit,
      credit,
      direction,
      amount,
      counterpartyName, // 3-я строка ячейки "Счет" (ФИО для ИП / наименование)
      counterpartyInn,
      counterpartyBic,
      counterpartyAccount,
      purpose,
      sourceBank: "sber",
      rawRow: row,
    })
  }

  return { transactions, balances }
}
