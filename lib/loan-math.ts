// lib/loan-math.ts
// Pure расчётный слой для кредитов.
// Нет зависимостей от Prisma/Next — используется и на сервере (RSC), и на клиенте.
// Phase 21 (Credits) — implements D-04 (накопительные агрегаты), D-09 (computed статус), D-03 (бакетирование).

// ── Types ────────────────────────────────────────────────────────────────────

// Re-export для обратной совместимости (компоненты credits/ используют LoanGranularity)
export type LoanGranularity = "day" | "week" | "month"
export type { Granularity } from "@/lib/date-buckets"
export { bucketKey, bucketLabel } from "@/lib/date-buckets"

export interface PaymentInput {
  date: Date | string
  principal: number
  interest: number
}

export interface ScheduleRow {
  date: Date
  principal: number
  interest: number
  balance: number
}

export interface LoanAggregates {
  totalPrincipalPaid: number
  totalInterestPaid: number
  currentBalance: number  // amount − Σprincipal (D-04)
  overpayment: number     // = totalInterestPaid (сумма уплаченных процентов)
}

export type LoanStatus = "active" | "paid"

// ── Helper ───────────────────────────────────────────────────────────────────

/**
 * Округление до копеек (2 знака после запятой).
 * Использует "round half away from zero" через Math.round — стандартный бухгалтерский подход.
 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Приводит Date | string к Date объекту. */
function toDate(val: Date | string): Date {
  if (val instanceof Date) return val
  return new Date(val)
}

// ── computeSchedule ──────────────────────────────────────────────────────────

/**
 * Строит таблицу графика погашения с накопительным остатком.
 *
 * balance в каждой строке = amount − Σprincipal (по всем строкам включительно).
 * Строки сортируются по дате ASC.
 */
export function computeSchedule(amount: number, payments: PaymentInput[]): ScheduleRow[] {
  const sorted = [...payments].sort((a, b) => toDate(a.date).getTime() - toDate(b.date).getTime())

  let cumulativePrincipal = 0
  return sorted.map((p) => {
    cumulativePrincipal += p.principal
    const balance = round2(amount - cumulativePrincipal)
    return {
      date: toDate(p.date),
      principal: p.principal,
      interest: p.interest,
      balance,
    }
  })
}

// ── computeLoanAggregates ────────────────────────────────────────────────────

/**
 * Вычисляет накопительные агрегаты кредита (D-04).
 *
 * - totalPrincipalPaid = Σ principal (оплаченных)
 * - totalInterestPaid = Σ interest (оплаченных)
 * - currentBalance = amount − totalPrincipalPaid
 * - overpayment = totalInterestPaid (переплата = сумма уплаченных процентов)
 *
 * `asOf` (опц.): если задан — учитываются только платежи с датой ≤ asOf (фактически
 * оплаченные); будущие ПЛАНОВЫЕ платежи графика игнорируются. Без asOf — учитываются все
 * платежи (полный график). ВАЖНО: LoanPayment хранит ПОЛНЫЙ график амортизации (прошлое +
 * будущее), поэтому для «текущего остатка»/«погашено на сегодня» обязательно передавать asOf,
 * иначе Σprincipal == amount → currentBalance == 0 (кредит выглядит полностью погашенным).
 *
 * Guard: пустой payments[] → currentBalance = amount, totalInterestPaid = 0.
 */
export function computeLoanAggregates(
  amount: number,
  payments: PaymentInput[],
  asOf?: Date
): LoanAggregates {
  const asOfMs =
    asOf != null
      ? Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())
      : null

  let totalPrincipalPaid = 0
  let totalInterestPaid = 0

  for (const p of payments) {
    if (asOfMs !== null) {
      const d = toDate(p.date)
      const dMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      if (dMs > asOfMs) continue // будущий плановый платёж — ещё не оплачен
    }
    totalPrincipalPaid += p.principal
    totalInterestPaid += p.interest
  }

  totalPrincipalPaid = round2(totalPrincipalPaid)
  totalInterestPaid = round2(totalInterestPaid)
  const currentBalance = round2(amount - totalPrincipalPaid)
  const overpayment = totalInterestPaid

  return { totalPrincipalPaid, totalInterestPaid, currentBalance, overpayment }
}

// ── computeStatus ────────────────────────────────────────────────────────────

/**
 * Вычисляет статус кредита по остатку основного долга (D-09).
 * "active" если остаток > 0; "paid" если ≤ 0.
 * Хранить в БД не нужно — вычисляется на лету.
 */
export function computeStatus(currentBalance: number): LoanStatus {
  return currentBalance > 0 ? "active" : "paid"
}

// bucketKey and bucketLabel are now re-exported from @/lib/date-buckets above.
