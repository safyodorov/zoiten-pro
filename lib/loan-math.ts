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

// ── computeAccruedInterest ───────────────────────────────────────────────────

/**
 * Начисленные, но ещё не уплаченные проценты по кредиту на дату asOf
 * (quick task 260707-iax). Пропорция «с последнего платежа» до следующего
 * планового платежа графика.
 *
 * ЛОГИКА (LOCKED — см. план 260707-iax):
 * 1. currentBalance = amount − Σ principal(date ≤ asOf). Если ≤ 0 → 0 (погашен).
 * 2. prevDate = последний платёж (date ≤ asOf); если нет — issueDate (если задан),
 *    иначе самый ранний платёж графика; если совсем нет платежей → 0.
 * 3. nextPayment = самый ранний платёж с date > asOf; если нет → 0 (график закончился).
 * 4. periodDays = дни(prevDate → nextPayment.date); если ≤ 0 → 0.
 * 5. elapsedDays = clamp(дни(prevDate → asOf), 0, periodDays).
 * 6. accrued = round2(nextPayment.interest × elapsedDays / periodDays).
 *
 * Все даты — UTC calendar dates (mirror computeLoanAggregates/computeSchedule).
 * НЕ предполагает отсортированный payments[] — сортирует копию (mirror computeSchedule).
 */
export function computeAccruedInterest(
  amount: number,
  payments: PaymentInput[],
  asOf: Date,
  issueDate?: Date | null
): number {
  if (payments.length === 0) return 0

  const asOfMs = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())
  const sorted = [...payments].sort((a, b) => toDate(a.date).getTime() - toDate(b.date).getTime())

  // 1. currentBalance = amount − Σ principal(date ≤ asOf)
  let principalPaid = 0
  for (const p of sorted) {
    const d = toDate(p.date)
    const dMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    if (dMs <= asOfMs) principalPaid += p.principal
  }
  const currentBalance = round2(amount - principalPaid)
  if (currentBalance <= 0) return 0

  // 2. prevDate = последний платёж (date ≤ asOf); fallback issueDate → earliest payment
  let prevMs: number | null = null
  for (const p of sorted) {
    const d = toDate(p.date)
    const dMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    if (dMs <= asOfMs && (prevMs === null || dMs > prevMs)) prevMs = dMs
  }
  if (prevMs === null) {
    if (issueDate != null) {
      const d = toDate(issueDate)
      prevMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    } else {
      const d = toDate(sorted[0].date)
      prevMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    }
  }

  // 3. nextPayment = самый ранний платёж с date > asOf
  let nextPayment: PaymentInput | null = null
  let nextMs: number | null = null
  for (const p of sorted) {
    const d = toDate(p.date)
    const dMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    if (dMs > asOfMs && (nextMs === null || dMs < nextMs)) {
      nextMs = dMs
      nextPayment = p
    }
  }
  if (nextPayment === null || nextMs === null) return 0

  // 4. periodDays
  const periodDays = (nextMs - prevMs) / 86400000
  if (periodDays <= 0) return 0

  // 5. elapsedDays (clamp)
  const elapsedRaw = (asOfMs - prevMs) / 86400000
  const elapsedDays = Math.min(Math.max(elapsedRaw, 0), periodDays)

  // 6. accrued
  return round2((nextPayment.interest * elapsedDays) / periodDays)
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
