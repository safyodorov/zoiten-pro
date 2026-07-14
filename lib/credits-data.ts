// lib/credits-data.ts
// Data helper для раздела кредитов (Phase 21)
// Загружает кредиты с агрегатами и именем кредитора (U-03: lender.name)

import { prisma } from "@/lib/prisma"
import {
  computeLoanAggregates,
  computeStatus,
  computeAccruedInterest,
  round2,
  type LoanStatus,
} from "@/lib/loan-math"

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
  monthlyCommissionRub: number | null // quick 260714-ij9: амортизация комиссии JetLend, ₽/мес
  monthlyNdflRub: number | null       // quick 260714-ij9: НДФЛ инвесторам, ₽/мес
  effectiveIssueDate: Date | null   // issueDate ?? первая дата платежа (D-07 display-only)
  currentBalance: number
  totalPrincipalPaid: number
  totalInterestPaid: number
  accruedInterest: number          // quick 260707-iax: начисленные, но не уплаченные проценты на сегодня
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

  const asOf = new Date() // «сегодня» — платежи в будущем = плановые, не оплаченные

  const rows: CreditRow[] = loans.map((loan) => {
    const amount = Number(loan.amount)
    const payments = loan.payments.map((p) => ({
      date: p.date,
      principal: Number(p.principal),
      interest: Number(p.interest),
    }))

    const agg = computeLoanAggregates(amount, payments, asOf)
    const status = computeStatus(agg.currentBalance)
    const effectiveIssueDate: Date | null =
      loan.issueDate ?? (loan.payments.length > 0 ? loan.payments[0].date : null)
    const accruedInterest = computeAccruedInterest(amount, payments, asOf, loan.issueDate ?? null)

    return {
      id: loan.id,
      contractNumber: loan.contractNumber,
      companyName: loan.company.name,
      lenderName: loan.lender.name,             // U-03
      amount,
      annualRatePct: Number(loan.annualRatePct),
      termMonths: loan.termMonths ?? null,
      issueDate: loan.issueDate ?? null,
      monthlyCommissionRub: loan.monthlyCommissionRub != null ? Number(loan.monthlyCommissionRub) : null,
      monthlyNdflRub: loan.monthlyNdflRub != null ? Number(loan.monthlyNdflRub) : null,
      effectiveIssueDate,
      currentBalance: agg.currentBalance,
      totalPrincipalPaid: agg.totalPrincipalPaid,
      totalInterestPaid: agg.totalInterestPaid,
      accruedInterest,
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

// ── loadCreditsDashboard ────────────────────────────────────────────────────────

export interface YearPayment {
  year: number
  principal: number
  interest: number
}

export interface CreditsDashboard {
  /** Σ текущего остатка основного долга по всем активным кредитам */
  totalDebt: number
  /** Средневзвешенная годовая ставка, взвешенная по текущему остатку долга (%) */
  weightedRatePct: number
  /** Σ начисленных, но не уплаченных процентов по кредитам с currentBalance > 0 (quick 260707-iax) */
  totalAccruedInterest: number
  /** Текущий год (для лейбла «Осталось выплатить в N») */
  currentYear: number
  /**
   * Будущие выплаты по годам (тело + проценты). Текущий год = только платежи
   * с сегодняшней даты и далее («осталось выплатить»); будущие годы — все платежи года.
   * Только годы с ненулевыми будущими выплатами, по возрастанию.
   */
  byYear: YearPayment[]
}

/**
 * Агрегаты для дашборда раздела «Кредиты» (D-04-производное).
 * - totalDebt / weightedRatePct — по текущему остатку основного долга (балансу)
 * - byYear — будущие платежи (date >= сегодня) сгруппированные по году
 */
export async function loadCreditsDashboard(): Promise<CreditsDashboard> {
  const loans = await prisma.loan.findMany({
    where: { deletedAt: null },
    include: { payments: { orderBy: { date: "asc" } } },
  })

  const now = new Date()
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const currentYear = now.getUTCFullYear()

  let totalDebt = 0
  let weightedNum = 0
  let totalAccruedInterest = 0
  const yearMap = new Map<number, { principal: number; interest: number }>()

  for (const loan of loans) {
    const amount = Number(loan.amount)
    const payments = loan.payments.map((p) => ({
      date: p.date,
      principal: Number(p.principal),
      interest: Number(p.interest),
    }))

    const { currentBalance } = computeLoanAggregates(amount, payments, now)
    if (currentBalance > 0) {
      totalDebt += currentBalance
      weightedNum += currentBalance * Number(loan.annualRatePct)
      totalAccruedInterest += computeAccruedInterest(amount, payments, now, loan.issueDate ?? null)
    }

    // Будущие платежи (с сегодня и далее) по годам
    for (const p of payments) {
      const d = p.date instanceof Date ? p.date : new Date(p.date)
      const dMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      if (dMs < todayMs) continue
      const y = d.getUTCFullYear()
      const e = yearMap.get(y) ?? { principal: 0, interest: 0 }
      e.principal += p.principal
      e.interest += p.interest
      yearMap.set(y, e)
    }
  }

  const byYear: YearPayment[] = [...yearMap.entries()]
    .map(([year, v]) => ({ year, principal: round2(v.principal), interest: round2(v.interest) }))
    .filter((y) => y.principal > 0.005 || y.interest > 0.005)
    .sort((a, b) => a.year - b.year)

  return {
    totalDebt: round2(totalDebt),
    weightedRatePct: totalDebt > 0 ? round2(weightedNum / totalDebt) : 0,
    totalAccruedInterest: round2(totalAccruedInterest),
    currentYear,
    byYear,
  }
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
