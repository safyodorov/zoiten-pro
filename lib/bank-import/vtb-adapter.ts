// lib/bank-import/vtb-adapter.ts
// Phase 22 (22-03): VTB bank statement parser.
// Multi-sheet: each sheet = one account. Header-driven column mapping (NOT positional).
// RUB-only sheets have 10 columns; CNY sheets have 12.
// Real VTB headers use commas: "Дебет, RUR" / "Кредит, RUR" — fuzzy-matched.
// Phase 22 (22-06): extracts opening/closing balances from header rows 2-3.
// NO imports of next-auth, next/*, or Prisma — vitest must run this without env.

import * as XLSX from "xlsx"
import { parseDateCell, parseAmount, parseBalanceAmount, buildHeaderMap } from "./normalize"
import type { ParsedTransaction, AccountBalance } from "./types"

/**
 * Determines currency from the header rows (rows 0-5).
 * "Валюта 156" / "юань" / "CNY" → "CNY"; otherwise → "RUR".
 */
function detectSheetCurrency(rows: (string | number | null)[][]): string {
  const headerText = rows
    .slice(0, 6)
    .flat()
    .map((c) => String(c ?? "").toLowerCase())
    .join(" ")
  if (headerText.includes("юань") || headerText.includes("156") || headerText.includes("cny")) {
    return "CNY"
  }
  return "RUR"
}

/**
 * Extracts companyName from header rows (looks for "Владелец счёта" label).
 */
function extractCompanyName(rows: (string | number | null)[][]): string | null {
  for (const row of rows.slice(0, 6)) {
    for (let i = 0; i < row.length - 1; i++) {
      const cell = String(row[i] ?? "").trim()
      if (cell.toLowerCase().includes("владелец")) {
        const val = String(row[i + 1] ?? "").trim()
        return val || null
      }
    }
  }
  return null
}

/**
 * Fuzzy-matches a debit or credit column index from the header map.
 * Real VTB files use "Дебет, RUR" / "Кредит, RUR" (with comma + space).
 * We match /дебет.*CUR/i and /кредит.*CUR/i, falling back to plain /дебет/i or /кредит/i.
 */
function findAmountColIdx(
  hm: Record<string, number>,
  kind: "дебет" | "кредит",
  currency: string
): number | undefined {
  const currencyPat = new RegExp(`${kind}.*${currency}`, "i")
  const anyPat = new RegExp(kind, "i")
  // Prefer currency-specific match
  for (const key of Object.keys(hm)) {
    if (currencyPat.test(key)) return hm[key]
  }
  // Fallback: any column with the right word
  for (const key of Object.keys(hm)) {
    if (anyPat.test(key)) return hm[key]
  }
  return undefined
}

/**
 * Extracts the balance date (closing / "Конечная дата") from header rows 0-5.
 * Row 2 structure: ["Начальная дата: ", "01.01.2026", "Конечная дата: ", "09.06.2026", ...]
 * Returns null if not found.
 */
function extractVtbBalanceDate(rows: (string | number | null)[][]): Date | null {
  for (const row of rows.slice(0, 6)) {
    for (let i = 0; i < row.length - 1; i++) {
      const cell = String(row[i] ?? "").trim()
      if (/конечная дата/i.test(cell)) {
        // Next non-null cell is the date value
        for (let j = i + 1; j < row.length; j++) {
          if (row[j] != null && String(row[j]).trim() !== "") {
            return parseDateCell(row[j] as string | number | null)
          }
        }
      }
    }
  }
  return null
}

/**
 * Extracts opening and closing balances from VTB header rows 0-5.
 * Row 3 structure (RUB): ["Входящий остаток RUB:", "33,201.97", "Исходящий остаток RUB:", "20,000.00"]
 * Row 3 structure (CNY): ["Входящий остаток CNY:", "0.00", "Исходящий остаток CNY:", "0.00"]
 * Returns { opening, closing } — either may be null.
 */
function extractVtbBalances(rows: (string | number | null)[][]): { opening: number | null; closing: number | null } {
  let opening: number | null = null
  let closing: number | null = null
  for (const row of rows.slice(0, 6)) {
    for (let i = 0; i < row.length; i++) {
      const cell = String(row[i] ?? "").trim()
      if (/входящий остаток/i.test(cell)) {
        // Next non-null cell to the right
        for (let j = i + 1; j < row.length; j++) {
          if (row[j] != null && String(row[j]).trim() !== "") {
            opening = parseBalanceAmount(row[j] as string | number | null)
            break
          }
        }
      }
      if (/исходящий остаток/i.test(cell)) {
        // Next non-null cell to the right
        for (let j = i + 1; j < row.length; j++) {
          if (row[j] != null && String(row[j]).trim() !== "") {
            closing = parseBalanceAmount(row[j] as string | number | null)
            break
          }
        }
      }
    }
  }
  return { opening, closing }
}

/**
 * Parses all sheets of a VTB multi-sheet workbook.
 * Sheet name = account number.
 * Header row at index 6 → header-driven column mapping.
 * Data rows start at index 7; stops/skips "ИТОГО:" rows.
 * Returns { transactions, balances } per Phase 22 (22-06).
 */
export function parseVtbStatement(workbook: XLSX.WorkBook): { transactions: ParsedTransaction[]; balances: AccountBalance[] } {
  const transactions: ParsedTransaction[] = []
  const balances: AccountBalance[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]!
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: null,
      raw: false,
    })

    if (rows.length < 7) continue // нет заголовков — пустой лист

    const accountNumber = sheetName
    const currency = detectSheetCurrency(rows)
    const companyName = extractCompanyName(rows)

    // Extract balances from header area
    const { opening, closing } = extractVtbBalances(rows)
    const balanceDate = extractVtbBalanceDate(rows)
    balances.push({
      accountNumber,
      currency,
      openingBalance: opening,
      closingBalance: closing,
      balanceDate,
    })

    // Строка 6 — заголовки
    const headerRow = rows[6] ?? []
    const hm = buildHeaderMap(headerRow)

    // Fuzzy-match debit/credit columns by currency.
    // Real VTB headers: "Дебет, RUR" / "Кредит, RUR" (or "Дебет, CNY" / "Кредит, CNY").
    const debitColIdx = findAmountColIdx(hm, "дебет", currency)
    const creditColIdx = findAmountColIdx(hm, "кредит", currency)

    for (let i = 7; i < rows.length; i++) {
      const row = rows[i]!

      // Первая ячейка строки
      const firstCell = String(row[0] ?? "").trim()

      // Пропустить строку «ИТОГО:»
      if (firstCell.startsWith("ИТОГО")) continue

      // Пропустить полностью пустые строки
      if (row.every((c) => c == null || String(c).trim() === "")) continue

      // Дата
      const dateVal = hm["Дата"] !== undefined ? row[hm["Дата"]!] : null
      const date = parseDateCell(dateVal as string | number | null)
      if (!date) continue // нет даты — пропустить

      const debit = parseAmount(debitColIdx !== undefined ? row[debitColIdx] as string | number | null : null)
      const credit = parseAmount(creditColIdx !== undefined ? row[creditColIdx] as string | number | null : null)

      // Направление: дебет (расход) > 0 → DEBIT, иначе → CREDIT
      const direction: "DEBIT" | "CREDIT" = (debit ?? 0) > 0 ? "DEBIT" : "CREDIT"
      const amount = (debit ?? 0) > 0 ? debit! : (credit ?? 0)

      if (amount === 0 && debit == null && credit == null) continue // нет суммы — пропустить

      const docNumber = hm["Номер"] !== undefined
        ? String(row[hm["Номер"]!] ?? "").trim() || null
        : null

      const operationType = hm["Вид операции"] !== undefined
        ? String(row[hm["Вид операции"]!] ?? "").trim() || null
        : null

      const counterpartyName = hm["Контрагент"] !== undefined
        ? String(row[hm["Контрагент"]!] ?? "").trim() || null
        : null

      const counterpartyInn = hm["ИНН контрагента"] !== undefined
        ? String(row[hm["ИНН контрагента"]!] ?? "").trim() || null
        : null

      const counterpartyBic = hm["БИК банка контрагента"] !== undefined
        ? String(row[hm["БИК банка контрагента"]!] ?? "").trim() || null
        : null

      const counterpartyAccount = hm["Счет контрагента"] !== undefined
        ? String(row[hm["Счет контрагента"]!] ?? "").trim() || null
        : null

      const purpose = hm["Назначение"] !== undefined
        ? String(row[hm["Назначение"]!] ?? "").trim()
        : ""

      transactions.push({
        companyName,
        companyInn: null, // ВТБ-шапка не содержит ИНН нашей компании
        accountNumber,
        currency,
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
        counterpartyBankName: null, // VTB не содержит наименование банка контрагента
        counterpartyAccount,
        purpose,
        sourceBank: "vtb",
        rawRow: row,
      })
    }
  }

  return { transactions, balances }
}
