// lib/credits-data.ts
// Data helper для раздела кредитов (Phase 21)
// Загружает кредиты с агрегатами и именем кредитора (U-03: lender.name)

import { prisma } from "@/lib/prisma"
import { computeLoanAggregates, computeStatus, type LoanStatus } from "@/lib/loan-math"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreditRow {
  id: string
  contractNumber: string
  companyName: string
  lenderName: string                // U-03: имя кредитора (loan.lender.name)
  amount: number
  annualRatePct: number
  termMonths: number | null
  issueDate: Date | null
  effectiveIssueDate: Date | null   // issueDate ?? первая дата платежа (D-07 display-only)
  currentBalance: number
  totalPrincipalPaid: number
  totalInterestPaid: number
  status: LoanStatus
}

export interface LenderOption {
  id: string
  name: string
}

export interface CompanyOption {
  id: string
  name: string
}

// ── loadCredits ────────────────────────────────────────────────────────────────

/**
 * Загружает все активные (не удалённые) кредиты с вычисленными агрегатами.
 * Сортировка: организация → кредитор → дата выдачи (nulls last) → № КД.
 */
export async function loadCredits(): Promise<CreditRow[]> {
  const loans = await prisma.loan.findMany({
    where: { deletedAt: null },
    include: {
      company: true,
      lender: true,
      payments: { orderBy: { date: "asc" } },
    },
  })

  const rows: CreditRow[] = loans.map((loan) => {
    const amount = Number(loan.amount)
    const payments = loan.payments.map((p) => ({
      date: p.date,
      principal: Number(p.principal),
      interest: Number(p.interest),
    }))

    const agg = computeLoanAggregates(amount, payments)
    const status = computeStatus(agg.currentBalance)
    const effectiveIssueDate: Date | null =
      loan.issueDate ?? (loan.payments.length > 0 ? loan.payments[0].date : null)

    return {
      id: loan.id,
      contractNumber: loan.contractNumber,
      companyName: loan.company.name,
      lenderName: loan.lender.name,             // U-03
      amount,
      annualRatePct: Number(loan.annualRatePct),
      termMonths: loan.termMonths ?? null,
      issueDate: loan.issueDate ?? null,
      effectiveIssueDate,
      currentBalance: agg.currentBalance,
      totalPrincipalPaid: agg.totalPrincipalPaid,
      totalInterestPaid: agg.totalInterestPaid,
      status,
    }
  })

  // Сортировка: организация → кредитор → дата выдачи (nulls last) → № КД
  rows.sort((a, b) => {
    const cmp1 = a.companyName.localeCompare(b.companyName, "ru")
    if (cmp1 !== 0) return cmp1

    const cmp2 = a.lenderName.localeCompare(b.lenderName, "ru")
    if (cmp2 !== 0) return cmp2

    // effectiveIssueDate: nulls last
    const da = a.effectiveIssueDate?.getTime() ?? Infinity
    const db = b.effectiveIssueDate?.getTime() ?? Infinity
    if (da !== db) return da - db

    return a.contractNumber.localeCompare(b.contractNumber, "ru")
  })

  return rows
}

// ── loadLendersAndCompanies ────────────────────────────────────────────────────

/**
 * Загружает списки кредиторов и организаций для фильтров и модалки.
 * Кредиторы сортируются по sortOrder, организации — по name.
 */
export async function loadLendersAndCompanies(): Promise<{
  lenders: LenderOption[]
  companies: CompanyOption[]
}> {
  const [lenders, companies] = await Promise.all([
    prisma.lender.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.company.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  return { lenders, companies }
}
