// lib/cash-import/parse.ts
// Phase 23 (23-03): XLSX sheet parsers for «Офис Бюджет.xlsx».
// Pure — no next-auth, next/*, or Prisma singleton imports.

import * as XLSX from "xlsx"
import {
  parseDateCell,
  parseBalanceAmount,
  normalizeDepartment,
  normalizeResponsibleSurname,
} from "./normalize"
import { categorize } from "./categorize"
import type { ParsedCashEntry } from "./types"

const MIN_YEAR = 2024
const MAX_YEAR = 2026

function rowsOf(wb: XLSX.WorkBook, sheetName: string): (string | number | null)[][] {
  const sheet = wb.Sheets[sheetName]
  if (!sheet) return []
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as (
    | string
    | number
    | null
  )[][]
}

/**
 * Parses sheet «Юля».
 * Columns (header row 0, data from row 1):
 *   Дата=0 | Приходы=1 | Расходы=2 | Подразделение=3 | (пусто)=4 | Назначение=5 | Ответственный=6
 * Direction: EXPENSE if Расходы>0, INCOME if Приходы>0.
 * Filters to years 2024-2026; skips rows with no valid date or no amount.
 */
export function parseYulyaSheet(wb: XLSX.WorkBook): ParsedCashEntry[] {
  const rows = rowsOf(wb, "Юля")
  const out: ParsedCashEntry[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!
    const date = parseDateCell(r[0] as never)
    if (!date) continue // битые даты — пропуск
    const y = date.getUTCFullYear()
    if (y < MIN_YEAR || y > MAX_YEAR) continue

    const income = parseBalanceAmount(r[1] as never)
    const expense = parseBalanceAmount(r[2] as never)

    let direction: "INCOME" | "EXPENSE"
    let amount: number
    if (expense && expense > 0) {
      direction = "EXPENSE"
      amount = expense
    } else if (income && income > 0) {
      direction = "INCOME"
      amount = income
    } else {
      continue // нет суммы — пропуск
    }

    const purpose = String(r[5] ?? "").trim()
    const department = normalizeDepartment(r[3] as never)
    const responsibleNameRaw = normalizeResponsibleSurname(r[6] as never)

    out.push({
      sheet: "yulya",
      date,
      direction,
      amount,
      department,
      purpose,
      responsibleNameRaw,
      categoryName: categorize(purpose),
      source: "budget-yulya",
    })
  }
  return out
}

/**
 * Parses sheet «Павел».
 * Columns (header row 0, data from row 1):
 *   Дата=0 | Назначение=1 | Сумма=2
 * All entries = EXPENSE. Default responsible = Иванова (normalizeResponsibleSurname(null)).
 * Filters to years 2024-2026; skips rows with no valid date or no amount.
 *
 * Фонд Павла: в файле только расходы, пополнений нет. По решению пользователя
 * (2026-06-10) «расходы Павла = пополнения Павла» — на каждый расход добавляем
 * зеркальное ПОПОЛНЕНИЕ (INCOME) той же суммы/даты, чтобы фонд нетил в ~0
 * (пока не появятся реальные пополнения). Назначение пополнения ссылается на
 * исходное → уникальный fingerprint (INCOME+EXPENSE и так различаются direction'ом).
 */
export function parsePavelSheet(wb: XLSX.WorkBook): ParsedCashEntry[] {
  const rows = rowsOf(wb, "Павел")
  const out: ParsedCashEntry[] = []
  const defaultResp = normalizeResponsibleSurname(null) // пусто → "Иванова"
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!
    const date = parseDateCell(r[0] as never)
    if (!date) continue
    const y = date.getUTCFullYear()
    if (y < MIN_YEAR || y > MAX_YEAR) continue

    const amount = parseBalanceAmount(r[2] as never)
    if (!amount || amount <= 0) continue

    const purpose = String(r[1] ?? "").trim()

    out.push({
      sheet: "pavel",
      date,
      direction: "EXPENSE",
      amount,
      department: null,
      purpose,
      responsibleNameRaw: defaultResp,
      categoryName: categorize(purpose),
      source: "budget-pavel",
    })
    // Зеркальное пополнение фонда (приход = расход)
    out.push({
      sheet: "pavel",
      date,
      direction: "INCOME",
      amount,
      department: null,
      purpose: `Пополнение фонда (Павел): ${purpose}`,
      responsibleNameRaw: defaultResp,
      categoryName: "Пополнение кассы",
      source: "budget-pavel",
    })
  }
  return out
}

/**
 * Parses both «Юля» and «Павел» sheets.
 * Sheet «Микроволновка на склад» is intentionally ignored.
 */
export function parseBudget(wb: XLSX.WorkBook): ParsedCashEntry[] {
  return [...parseYulyaSheet(wb), ...parsePavelSheet(wb)]
}
