// lib/bank-import/sber-adapter.ts
// Phase 22 (22-03): СберБизнес bank statement parser.
// Single sheet. Merged cells → read raw:false. Headers at rows 9-10, data from row 11.
// Account number: sheet name OR row 4 ~col 11 regex.
// "Счет" column: счёт\nИНН split by \n.
// "Банк" column: extractBic via /БИК\s+(\d{9})/.
// NO imports of next-auth, next/*, or Prisma — vitest must run this without env.

import * as XLSX from "xlsx"
import { parseDDMMYYYY, parseAmount, extractBic, buildHeaderMap } from "./normalize"
import type { ParsedTransaction } from "./types"

const ACCOUNT_NUMBER_RE = /(\d{20})/
const INN_RE = /^\d{7,12}$/

/**
 * Parses a СберБизнес single-sheet workbook.
 * Note: The workbook should be read with raw:false for merged cells.
 * Row 4: account number (~col 11)
 * Row 5: company name (col 0)
 * Row 9: primary headers
 * Row 10: sub-headers (ignored)
 * Rows 11+: transaction data
 *
 * First data column = composite serial id (e.g. "46024.18197") — IGNORED for date.
 * Date is parsed from "Дата проводки" column.
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

  const result: ParsedTransaction[] = []

  // Данные с строки 11
  for (let i = 11; i < rows.length; i++) {
    const row = rows[i]!

    // Пропустить полностью пустые строки
    if (row.every((c) => c == null || String(c).trim() === "")) continue

    // Дата — из колонки "Дата проводки", НЕ из первой ячейки (служебный id)
    const dateVal = hm["Дата проводки"] !== undefined
      ? row[hm["Дата проводки"]!]
      : null
    const date = parseDDMMYYYY(dateVal as string | null)
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

    // Колонка "Счет": счёт контрагента + ИНН через \n
    let counterpartyAccount: string | null = null
    let counterpartyInn: string | null = null
    if (hm["Счет"] !== undefined) {
      const accountCell = String(row[hm["Счет"]!] ?? "").trim()
      const parts = accountCell.split("\n").map((p) => p.trim()).filter(Boolean)
      if (parts.length >= 1) counterpartyAccount = parts[0]!
      if (parts.length >= 2 && INN_RE.test(parts[1]!)) counterpartyInn = parts[1]!
    }

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
      companyInn: null,
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
