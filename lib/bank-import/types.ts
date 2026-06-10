// lib/bank-import/types.ts
// Phase 22 (22-03): Pure type definitions for bank statement parsers.
// NO imports of next-auth, next/*, or Prisma — vitest must run this without env.

export type BankFormat = "vtb" | "psb" | "sber"

export interface ParsedTransaction {
  companyName: string | null
  companyInn: string | null
  accountNumber: string
  currency: string            // "RUR" | "CNY" | ...
  date: Date
  docNumber: string | null
  operationType: string | null
  debit: number | null
  credit: number | null
  direction: "DEBIT" | "CREDIT"
  amount: number              // = debit ?? credit (положительное)
  counterpartyName: string | null
  counterpartyInn: string | null
  counterpartyBic: string | null
  counterpartyAccount: string | null
  purpose: string
  sourceBank: BankFormat
  rawRow: unknown
}

export interface AccountBalance {
  accountNumber: string
  currency: string
  openingBalance: number | null
  closingBalance: number | null
  balanceDate: Date | null   // дата исходящего остатка (конец периода выписки)
}

export interface ParseResult {
  format: BankFormat
  transactions: ParsedTransaction[]
  balances: AccountBalance[]
}
