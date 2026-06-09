// lib/credits-schedule-data.ts
// Phase 21-07: Бакетирование LoanPayment по периодам + группировка по орг + итоги.
// Реализует D-03 (бакетирование на лету), D-14 (день/неделя/месяц),
// D-15 (тело + проценты раздельно), D-16 (группировка по орг + подытоги + итого),
// D-17 (поля левого sticky-блока включая lenderName — U-03).

import { prisma } from "@/lib/prisma"
import {
  bucketKey,
  bucketLabel,
  computeLoanAggregates,
  round2,
  type LoanGranularity,
} from "@/lib/loan-math"

// ── Типы ─────────────────────────────────────────────────────────────────────

export type { LoanGranularity }

export interface PeriodColumn {
  key: string
  label: string
}

export interface LoanScheduleRow {
  loanId: string
  contractNumber: string
  companyName: string
  /** U-03: имя кредитора из loan.lender.name (НЕ bank) */
  lenderName: string
  amount: number
  annualRatePct: number
  currentBalance: number
  /** Σ principal платежей, попавших в каждый бакет */
  principalByPeriod: Record<string, number>
  /** Σ interest платежей, попавших в каждый бакет */
  interestByPeriod: Record<string, number>
}

export interface OrgGroup {
  companyName: string
  loans: LoanScheduleRow[]
  subtotalPrincipalByPeriod: Record<string, number>
  subtotalInterestByPeriod: Record<string, number>
}

export interface SummarySchedule {
  columns: PeriodColumn[]
  groups: OrgGroup[]
  grandTotalPrincipalByPeriod: Record<string, number>
  grandTotalInterestByPeriod: Record<string, number>
  /** Суммарный остаток основного долга по всем кредитам на начало каждого периода */
  balanceStartByPeriod: Record<string, number>
  /** Суммарный остаток основного долга по всем кредитам на конец каждого периода */
  balanceEndByPeriod: Record<string, number>
}

// ── Порядок организаций (D-16) ────────────────────────────────────────────────

const ORG_ORDER = [
  "ПЕЛИКАН ХЭППИ ТОЙС",
  "ЗОЙТЕН",
  "СИКРЕТ ВЭЙ",
  "ДРИМ ЛАЙН",
]

function orgSortIndex(companyName: string): number {
  const idx = ORG_ORDER.indexOf(companyName.toUpperCase())
  return idx >= 0 ? idx : ORG_ORDER.length
}

// ── Генератор последовательности бакетов ─────────────────────────────────────

/**
 * Перечисляет все бакеты в окне [from, to] для указанной гранулярности.
 * Возвращает Set ключей без дублей в порядке возрастания.
 */
function generateBucketSequence(
  from: Date,
  to: Date,
  granularity: LoanGranularity
): PeriodColumn[] {
  const result: PeriodColumn[] = []
  const seen = new Set<string>()

  let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  const endMs = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())

  while (cursor.getTime() <= endMs) {
    const key = bucketKey(cursor, granularity)
    if (!seen.has(key)) {
      seen.add(key)
      result.push({ key, label: bucketLabel(key, granularity) })
    }
    // Advance cursor
    switch (granularity) {
      case "day":
        cursor = new Date(cursor.getTime() + 86400000)
        break
      case "week":
        cursor = new Date(cursor.getTime() + 7 * 86400000)
        break
      case "month": {
        // Первый день следующего месяца
        const y = cursor.getUTCFullYear()
        const m = cursor.getUTCMonth() + 1
        if (m === 12) {
          cursor = new Date(Date.UTC(y + 1, 0, 1))
        } else {
          cursor = new Date(Date.UTC(y, m, 1))
        }
        break
      }
    }
  }

  return result
}

// ── Аккумулятор периодов ──────────────────────────────────────────────────────

function addToPeriodMap(map: Record<string, number>, key: string, value: number): void {
  map[key] = round2((map[key] ?? 0) + value)
}

function mergeIntoPeriodMap(target: Record<string, number>, source: Record<string, number>): void {
  for (const [k, v] of Object.entries(source)) {
    addToPeriodMap(target, k, v)
  }
}

// ── Основная функция ─────────────────────────────────────────────────────────

/**
 * Загружает все активные кредиты, бакетирует платежи по периодам,
 * группирует по организации, считает подытоги per-org и grand total.
 *
 * - currentBalance считается по ВСЕМ платежам (не только в окне)
 * - principalByPeriod / interestByPeriod — только платежи в [from, to]
 * - порядок орг: Пеликан, Зойтен, Сикрет Вэй, Дрим Лайн; прочие алфавитно
 * - внутри группы: по lenderName → contractNumber
 */
export async function loadSummarySchedule(
  granularity: LoanGranularity,
  from: Date,
  to: Date
): Promise<SummarySchedule> {
  // 1. Загрузка кредитов с платежами и связанными записями
  const loans = await prisma.loan.findMany({
    where: { deletedAt: null },
    include: {
      company: true,
      lender: true,
      payments: { orderBy: { date: "asc" } },
    },
  })

  // 2. Колонки — все бакеты в окне [from, to]
  const columns = generateBucketSequence(from, to, granularity)

  const fromMs = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  const toMs = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())

  // 3. Строки для каждого кредита
  const rows: LoanScheduleRow[] = loans.map((loan) => {
    const allPayments = loan.payments.map((p) => ({
      date: p.date,
      principal: Number(p.principal),
      interest: Number(p.interest),
    }))

    // currentBalance по ВСЕМ платежам (D-04)
    const { currentBalance } = computeLoanAggregates(Number(loan.amount), allPayments)

    // Бакетирование только платежей в окне
    const principalByPeriod: Record<string, number> = {}
    const interestByPeriod: Record<string, number> = {}

    for (const p of loan.payments) {
      const dateMs = p.date instanceof Date
        ? Date.UTC(p.date.getUTCFullYear(), p.date.getUTCMonth(), p.date.getUTCDate())
        : new Date(p.date).getTime()

      if (dateMs >= fromMs && dateMs <= toMs) {
        const k = bucketKey(p.date instanceof Date ? p.date : new Date(p.date), granularity)
        addToPeriodMap(principalByPeriod, k, Number(p.principal))
        addToPeriodMap(interestByPeriod, k, Number(p.interest))
      }
    }

    return {
      loanId: loan.id,
      contractNumber: loan.contractNumber,
      companyName: loan.company.name,
      lenderName: loan.lender.name, // U-03: кредитор (не bank)
      amount: Number(loan.amount),
      annualRatePct: Number(loan.annualRatePct),
      currentBalance,
      principalByPeriod,
      interestByPeriod,
    }
  })

  // 4. Группировка по организации
  const groupMap = new Map<string, LoanScheduleRow[]>()
  for (const row of rows) {
    const existing = groupMap.get(row.companyName) ?? []
    existing.push(row)
    groupMap.set(row.companyName, existing)
  }

  // 5. Сортировка организаций и строк внутри группы
  const sortedCompanies = [...groupMap.keys()].sort((a, b) => {
    const ia = orgSortIndex(a)
    const ib = orgSortIndex(b)
    if (ia !== ib) return ia - ib
    return a.localeCompare(b, "ru")
  })

  // 6. Построение групп с подытогами
  const grandTotalPrincipalByPeriod: Record<string, number> = {}
  const grandTotalInterestByPeriod: Record<string, number> = {}

  const groups: OrgGroup[] = sortedCompanies.map((companyName) => {
    const loanRows = (groupMap.get(companyName) ?? []).sort((a, b) => {
      const lenderCmp = a.lenderName.localeCompare(b.lenderName, "ru")
      if (lenderCmp !== 0) return lenderCmp
      return a.contractNumber.localeCompare(b.contractNumber, "ru")
    })

    // Подытоги per-org
    const subtotalPrincipalByPeriod: Record<string, number> = {}
    const subtotalInterestByPeriod: Record<string, number> = {}

    for (const row of loanRows) {
      mergeIntoPeriodMap(subtotalPrincipalByPeriod, row.principalByPeriod)
      mergeIntoPeriodMap(subtotalInterestByPeriod, row.interestByPeriod)
    }

    // Накапливаем в grand total
    mergeIntoPeriodMap(grandTotalPrincipalByPeriod, subtotalPrincipalByPeriod)
    mergeIntoPeriodMap(grandTotalInterestByPeriod, subtotalInterestByPeriod)

    return {
      companyName,
      loans: loanRows,
      subtotalPrincipalByPeriod,
      subtotalInterestByPeriod,
    }
  })

  // 7. Running balance: суммарный остаток основного долга по всем кредитам по периодам.
  //    Остаток на начало периода = остаток на конец предыдущего.
  //    Старт окна = Σ (amount − principal, оплаченный ДО окна) по кредитам, выданным до окна.
  //    Кредиты, выданные ВНУТРИ окна, добавляют amount в свой период выдачи.
  const disbursedInPeriod: Record<string, number> = {}
  let initialOutstanding = 0

  for (const loan of loans) {
    const amount = Number(loan.amount)
    const effIssue: Date | null =
      loan.issueDate ?? (loan.payments.length > 0 ? loan.payments[0].date : null)
    const effIssueMs = effIssue
      ? Date.UTC(effIssue.getUTCFullYear(), effIssue.getUTCMonth(), effIssue.getUTCDate())
      : Number.NEGATIVE_INFINITY

    // Principal, оплаченный строго до начала окна
    let paidBefore = 0
    for (const p of loan.payments) {
      const pMs = Date.UTC(p.date.getUTCFullYear(), p.date.getUTCMonth(), p.date.getUTCDate())
      if (pMs < fromMs) paidBefore += Number(p.principal)
    }

    if (effIssueMs < fromMs) {
      // Выдан до окна → вносит остаток на начало окна
      initialOutstanding += amount - paidBefore
    } else if (effIssueMs <= toMs && effIssue) {
      // Выдан внутри окна → amount добавляется в период выдачи
      addToPeriodMap(disbursedInPeriod, bucketKey(effIssue, granularity), amount)
    }
    // Выдан после окна → не отображается
  }

  const balanceStartByPeriod: Record<string, number> = {}
  const balanceEndByPeriod: Record<string, number> = {}
  let running = round2(initialOutstanding)
  for (const col of columns) {
    balanceStartByPeriod[col.key] = Math.max(0, running)
    const disb = disbursedInPeriod[col.key] ?? 0
    const princ = grandTotalPrincipalByPeriod[col.key] ?? 0
    running = round2(running + disb - princ)
    balanceEndByPeriod[col.key] = Math.max(0, running)
  }

  return {
    columns,
    groups,
    grandTotalPrincipalByPeriod,
    grandTotalInterestByPeriod,
    balanceStartByPeriod,
    balanceEndByPeriod,
  }
}

// ── Дефолтное окно ─────────────────────────────────────────────────────────

/**
 * Возвращает дефолтное окно и гранулярность для сводного графика.
 * from = первый день прошлого месяца (UTC);
 * to = последний день месяца через +6 от текущего (7 месячных бакетов).
 * Все расчёты в UTC (даты хранятся без времени).
 */
export function defaultScheduleWindow(): { from: Date; to: Date; granularity: LoanGranularity } {
  const now = new Date()
  const currentYear = now.getUTCFullYear()
  const currentMonth = now.getUTCMonth() // 0-indexed

  // from = первый день прошлого месяца
  let fromYear = currentYear
  let fromMonth = currentMonth - 1
  if (fromMonth < 0) {
    fromMonth = 11
    fromYear -= 1
  }
  const from = new Date(Date.UTC(fromYear, fromMonth, 1))

  // to = последний день месяца (currentMonth + 6)
  let toMonth = currentMonth + 6
  let toYear = currentYear
  if (toMonth > 11) {
    toYear += Math.floor(toMonth / 12)
    toMonth = toMonth % 12
  }
  // Последний день: первый день следующего месяца минус 1 день
  const firstOfNext = new Date(Date.UTC(toYear, toMonth + 1, 1))
  const to = new Date(firstOfNext.getTime() - 86400000)

  return { from, to, granularity: "month" }
}
