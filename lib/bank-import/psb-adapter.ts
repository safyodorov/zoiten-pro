// lib/bank-import/psb-adapter.ts
// Phase 22 (22-03): PSB (Промсвязьбанк) bank statement parser.
// Single sheet. Header at row index 6. Data starts at index 8 (skip row 7 "Входящее сальдо").
// Account number extracted from row 2 header text via regex.
// NO imports of next-auth, next/*, or Prisma — vitest must run this without env.

import * as XLSX from "xlsx"
import { parseDDMMYYYY, parseAmount, buildHeaderMap } from "./normalize"
import type { ParsedTransaction } from "./types"

const ACCOUNT_NUMBER_RE = /(\d{20})/

/**
 * Parses a PSB (Промсвязьбанк) single-sheet workbook.
 * Row 2: "Выписка из лицевого счета 40702..." → extract account number
 * Row 4: company name
 * Row 6: column headers — Дата | РО | Док. | КБ | Внеш.счет | Счет | Дебет | Кредит | Назначение | Контрагент | Контр. ИНН
 * Row 7: "Входящее сальдо" (skip)
 * Rows 8+: transaction data
 */
export function parsePsbStatement(workbook: XLSX.WorkBook): ParsedTransaction[] {
  const sheetName = workbook.SheetNames[0]!
  const sheet = workbook.Sheets[sheetName]!
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
  })

  if (rows.length < 8) return []

  // Извлечь номер счёта из строки 2
  const row2Text = rows[2]?.map((c) => String(c ?? "")).join(" ") ?? ""
  const accountMatch = row2Text.match(ACCOUNT_NUMBER_RE)
  const accountNumber = accountMatch ? accountMatch[1]! : sheetName

  // Компания из строки 4
  const companyName = String(rows[4]?.[0] ?? "").trim() || null

  // Заголовки из строки 6
  const headerRow = rows[6] ?? []
  const hm = buildHeaderMap(headerRow)

  const result: ParsedTransaction[] = []

  // Данные с строки 8 (строка 7 = "Входящее сальдо", пропускаем)
  for (let i = 8; i < rows.length; i++) {
    const row = rows[i]!

    // Пропустить полностью пустые строки
    if (row.every((c) => c == null || String(c).trim() === "")) continue

    // Дата
    const dateVal = hm["Дата"] !== undefined ? row[hm["Дата"]!] : null
    const date = parseDDMMYYYY(dateVal as string | number | null)
    if (!date) continue

    const debit = parseAmount(hm["Дебет"] !== undefined ? row[hm["Дебет"]!] as string | number | null : null)
    const credit = parseAmount(hm["Кредит"] !== undefined ? row[hm["Кредит"]!] as string | number | null : null)

    const direction: "DEBIT" | "CREDIT" = (debit ?? 0) > 0 ? "DEBIT" : "CREDIT"
    const amount = (debit ?? 0) > 0 ? debit! : (credit ?? 0)

    if (amount === 0 && debit == null && credit == null) continue

    // КБ = БИК банка контрагента
    const counterpartyBic = hm["КБ"] !== undefined
      ? String(row[hm["КБ"]!] ?? "").trim() || null
      : null

    // Внеш.счет = счёт контрагента
    const counterpartyAccount = hm["Внеш.счет"] !== undefined
      ? String(row[hm["Внеш.счет"]!] ?? "").trim() || null
      : null

    const docNumber = hm["Док."] !== undefined
      ? String(row[hm["Док."]!] ?? "").trim() || null
      : null

    const operationType = hm["РО"] !== undefined
      ? String(row[hm["РО"]!] ?? "").trim() || null
      : null

    const counterpartyName = hm["Контрагент"] !== undefined
      ? String(row[hm["Контрагент"]!] ?? "").trim() || null
      : null

    const counterpartyInn = hm["Контр. ИНН"] !== undefined
      ? String(row[hm["Контр. ИНН"]!] ?? "").trim() || null
      : null

    const purpose = hm["Назначение"] !== undefined
      ? String(row[hm["Назначение"]!] ?? "").trim()
      : ""

    result.push({
      companyName,
      companyInn: null,
      accountNumber,
      currency: "RUR", // ПСБ — только рублёвые счета
      date,
      docNumber,
      operationType,
      debit,
      credit,
      direction,
      amount,
      counterpartyName,
      counterpartyInn,
      counterpartyBic,
      counterpartyAccount,
      purpose,
      sourceBank: "psb",
      rawRow: row,
    })
  }

  return result
}
