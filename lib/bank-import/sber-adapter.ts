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
// NO imports of next-auth, next/*, or Prisma — vitest must run this without env.

import * as XLSX from "xlsx"
import { parseDateCell, parseAmount, extractBic, buildHeaderMap } from "./normalize"
import type { ParsedTransaction } from "./types"

const ACCOUNT_NUMBER_RE = /(\d{20})/
const INN_RE = /^\d{7,12}$/

/**
 * Splits a "account\nINN" cell into its parts.
 * Returns { account, inn } — either may be null.
 */
function splitAccountCell(cell: string | null | undefined): { account: string | null; inn: string | null } {
  if (!cell) return { account: null, inn: null }
  const parts = String(cell).trim().split("\n").map((p) => p.trim()).filter(Boolean)
  const account = parts[0] ?? null
  const inn = parts[1] && INN_RE.test(parts[1]) ? parts[1] : null
  return { account, inn }
}

/**
 * Parses a СберБизнес single-sheet workbook.
 * Note: The workbook should be read with raw:false for merged cells.
 * Row 4: account number (~col 11)
 * Row 5: company name (col 0)
 * Row 9: primary headers
 * Row 10: sub-headers — "Дебет" and "Кредит" mark the two account sub-columns
 * Rows 11+: transaction data
 *
 * The "Счет" merged header spans two sub-columns:
 *   debitAcctCol  (row10 index of "Дебет",  fallback 4) = debit-side account (our account on outgoing)
 *   creditAcctCol (row10 index "Кредит", fallback 8) = credit-side account (counterparty on outgoing)
 * Direction logic:
 *   "Сумма по дебету" set  → DEBIT,  counterparty = creditAcctCol
 *   "Сумма по кредиту" set → CREDIT, counterparty = debitAcctCol
 */
export function parseSberStatement(workbook: XLSX.WorkBook): ParsedTransaction[] {
  const sheetName = workbook.SheetNames[0]!
  const sheet = workbook.Sheets[sheetName]!

  // raw:false для корректного чтения merged cells (строки слились в одну ячейку)
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
  })

  if (rows.length < 12) return []

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

  const result: ParsedTransaction[] = []

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

    const { account: counterpartyAccount, inn: counterpartyInn } = splitAccountCell(counterpartyCell)

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

    result.push({
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
      counterpartyName: null, // Сбер-формат не содержит отдельного поля "Контрагент"
      counterpartyInn,
      counterpartyBic,
      counterpartyAccount,
      purpose,
      sourceBank: "sber",
      rawRow: row,
    })
  }

  return result
}
