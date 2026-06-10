// lib/cash-import/types.ts
// Phase 23 (23-03): Type definitions for cash budget parsing.
// Pure — no next-auth, next/*, or Prisma singleton imports.

export type CashDir = "INCOME" | "EXPENSE"

export interface ParsedCashEntry {
  sheet: "yulya" | "pavel"
  date: Date
  direction: CashDir
  amount: number
  department: string | null
  purpose: string
  responsibleNameRaw: string    // нормализованная фамилия (пусто→"Иванова")
  categoryName: string          // одно из 24 имён категорий (или "Прочее")
  source: "budget-yulya" | "budget-pavel"
}
