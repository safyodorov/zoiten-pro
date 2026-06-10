// lib/bank-import/psb-adapter.ts
// Phase 22 (22-03): PSB (Промсвязьбанк) bank statement parser.
// Single sheet. Header at row index 6. Data starts at index 8 (skip row 7 "Входящее сальдо").
// Account number extracted from row 2 header text via regex.
// Phase 22 (22-06): extracts opening/closing balances from saldo rows.
// NO imports of next-auth, next/*, or Prisma — vitest must run this without env.

import * as XLSX from "xlsx"
import { parseDateCell, parseAmount, parseBalanceAmount, parseDDMMYYYY, buildHeaderMap } from "./normalize"
import type { ParsedTransaction, AccountBalance } from "./types"

const ACCOUNT_NUMBER_RE = /(\d{20})/

/**
 * Parse PSB balance from a saldo row cell text.
 * Format: "  30.12.2025 Входящее сальдо кредит: 217 568,45"
 *     or: "10.06.2026 Исходящее сальдо дебет: 0 кредит: 159 576,11"
 * Balance = кредит - дебет (кредит is positive balance; дебет is negative / overdraft).
 * Returns { balance, date } — either may be null.
 */
function parsePsbSaldoCell(text: string): { balance: number | null; date: Date | null } {
  // Extract leading date: DD.MM.YYYY
  const dateMatch = text.match(/(\d{2}\.\d{2}\.\d{4})/)
  const date = dateMatch ? parseDDMMYYYY(dateMatch[1]!) : null

  // Extract дебет amount (may be "0")
  const debitMatch = text.match(/дебет:\s*([\d\s .,]+)/i)
  const debitAmt = debitMatch ? parseBalanceAmount(debitMatch[1]!.trim()) : null

  // Extract кредит amount
  const creditMatch = text.match(/кредит:\s*([\d\s .,]+)/i)
  const creditAmt = creditMatch ? parseBalanceAmount(creditMatch[1]!.trim()) : null

  if (creditAmt == null && debitAmt == null) return { balance: null, date }
  const balance = (creditAmt ?? 0) - (debitAmt ?? 0)
  return { balance, date }
}

/**
 * Parses a PSB (Промсвязьбанк) single-sheet workbook.
 * Row 2: "Выписка из лицевого счета 40702..." → extract account number
 * Row 4: company name
 * Row 6: column headers — Дата | РО | Док. | КБ | Внеш.счет | Счет | Дебет | Кредит | Назначение | Контрагент | Контр. ИНН
 * Row 7: "Входящее сальдо" (skip, but extract opening balance)
 * Near the end: "Исходящее сальдо" row (extract closing balance + date)
 * Rows 8+: transaction data
 * Returns { transactions, balances } per Phase 22 (22-06).
 */
export function parsePsbStatement(workbook: XLSX.WorkBook): { transactions: ParsedTransaction[]; balances: AccountBalance[] } {
  const sheetName = workbook.SheetNames[0]!
  const sheet = workbook.Sheets[sheetName]!
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
  })

  if (rows.length < 8) return { transactions: [], balances: [] }

  // Извлечь номер счёта из строки 2
  const row2Text = rows[2]?.map((c) => String(c ?? "")).join(" ") ?? ""
  const accountMatch = row2Text.match(ACCOUNT_NUMBER_RE)
  const accountNumber = accountMatch ? accountMatch[1]! : sheetName

  // Компания из строки 4
  const companyName = String(rows[4]?.[0] ?? "").trim() || null

  // Заголовки из строки 6
  const headerRow = rows[6] ?? []
  const hm = buildHeaderMap(headerRow)

  // ── Балансы: извлечь из строки 7 (Входящее сальдо) и из всех строк (Исходящее сальдо) ──
  let openingBalance: number | null = null
  let closingBalance: number | null = null
  let balanceDate: Date | null = null

  // Строка 7 — "Входящее сальдо"
  const saldoRow7Text = rows[7]?.map((c) => String(c ?? "")).join(" ") ?? ""
  if (/входящее сальдо/i.test(saldoRow7Text)) {
    const { balance } = parsePsbSaldoCell(saldoRow7Text)
    openingBalance = balance
  }

  // Scan all rows for "Исходящее сальдо"
  for (let i = 8; i < rows.length; i++) {
    const cellText = rows[i]?.map((c) => String(c ?? "")).join(" ") ?? ""
    if (/исходящее сальдо/i.test(cellText)) {
      const { balance, date } = parsePsbSaldoCell(cellText)
      closingBalance = balance
      balanceDate = date
      break
    }
  }

  const balances: AccountBalance[] = [{
    accountNumber,
    currency: "RUR",
    openingBalance,
    closingBalance,
    balanceDate,
  }]

  const transactions: ParsedTransaction[] = []

  // Данные с строки 8 (строка 7 = "Входящее сальдо", пропускаем)
  for (let i = 8; i < rows.length; i++) {
    const row = rows[i]!

    // Пропустить полностью пустые строки
    if (row.every((c) => c == null || String(c).trim() === "")) continue

    // Дата
    const dateVal = hm["Дата"] !== undefined ? row[hm["Дата"]!] : null
    const date = parseDateCell(dateVal as string | number | null)
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

    transactions.push({
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
      counterpartyBankName: null, // PSB не содержит наименование банка контрагента
      counterpartyAccount,
      purpose,
      sourceBank: "psb",
      rawRow: row,
    })
  }

  return { transactions, balances }
}
