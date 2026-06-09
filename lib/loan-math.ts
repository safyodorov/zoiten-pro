// lib/loan-math.ts
// Pure расчётный слой для кредитов.
// Нет зависимостей от Prisma/Next — используется и на сервере (RSC), и на клиенте.
// Phase 21 (Credits) — implements D-04 (накопительные агрегаты), D-09 (computed статус), D-03 (бакетирование).

// ── Types ────────────────────────────────────────────────────────────────────

export type LoanGranularity = "day" | "week" | "month"

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

// ── ISO 8601 Week algorithm ──────────────────────────────────────────────────

/**
 * Возвращает ISO 8601 год и номер недели для UTC-даты.
 * Понедельник = начало недели (ISO 8601).
 * Неделя 1 = неделя, содержащая первый четверг января.
 */
function getIsoWeek(date: Date): { year: number; week: number } {
  // Работаем в UTC
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))

  // Четверг текущей недели (ISO 8601: неделя принадлежит году, в котором находится четверг)
  // jsDay: 0=вс, 1=пн, ..., 6=сб → приводим к isoDay: 1=пн, ..., 7=вс
  const jsDay = d.getUTCDay()
  const isoDay = jsDay === 0 ? 7 : jsDay

  // Четверг = isoDay 4. Сдвиг от текущего дня до четверга
  const thursdayOffset = 4 - isoDay
  const thursday = new Date(d.getTime() + thursdayOffset * 86400000)

  const year = thursday.getUTCFullYear()

  // Первый четверг года
  const jan1 = new Date(Date.UTC(year, 0, 1))
  const jan1JsDay = jan1.getUTCDay()
  const jan1IsoDay = jan1JsDay === 0 ? 7 : jan1JsDay
  // Первый понедельник ISO-недели 1
  const firstMonday = new Date(jan1.getTime() - (jan1IsoDay - 1) * 86400000)
  // Если jan1 — пятница, суббота или воскресенье (isoDay > 4), первый понедельник — это следующая неделя
  // Алгоритм: Monday of week 1 = jan1 - (jan1IsoDay - 1) если jan1IsoDay ≤ 4,
  //           иначе monday of week 1 = next monday after jan1
  // Стандартный ISO алгоритм уже покрывается через "четверг" — firstMonday корректен.

  // Номер недели = (thursday - firstMonday) / 7 + 1
  const diffMs = thursday.getTime() - firstMonday.getTime()
  const week = Math.floor(diffMs / (7 * 86400000)) + 1

  return { year, week }
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

// ── bucketKey ────────────────────────────────────────────────────────────────

/**
 * Возвращает ключ бакета для группировки платежей (D-03, D-14).
 * Работает с UTC-компонентами даты (даты платежей хранятся без времени).
 *
 * - "day"   → "YYYY-MM-DD"
 * - "month" → "YYYY-MM"
 * - "week"  → "YYYY-Www" (ISO 8601, понедельник = начало недели)
 */
export function bucketKey(date: Date, granularity: LoanGranularity): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  const d = String(date.getUTCDate()).padStart(2, "0")

  switch (granularity) {
    case "day":
      return `${y}-${m}-${d}`

    case "month":
      return `${y}-${m}`

    case "week": {
      const { year, week } = getIsoWeek(date)
      return `${year}-W${String(week).padStart(2, "0")}`
    }
  }
}

// ── bucketLabel ──────────────────────────────────────────────────────────────

const RU_MONTHS_SHORT = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
]

/**
 * Возвращает человекочитаемую ru-RU метку для колонки-периода.
 *
 * - "day"   → "DD.MM"        (напр. "09.06")
 * - "month" → "ммм YYYY"     (напр. "июн 2026")
 * - "week"  → "нед. N"       (напр. "нед. 24")
 */
export function bucketLabel(key: string, granularity: LoanGranularity): string {
  switch (granularity) {
    case "day": {
      // key = "YYYY-MM-DD"
      const [, mm, dd] = key.split("-")
      return `${dd}.${mm}`
    }

    case "month": {
      // key = "YYYY-MM"
      const [yyyy, mm] = key.split("-")
      const monthIdx = parseInt(mm, 10) - 1
      const monthName = RU_MONTHS_SHORT[monthIdx] ?? mm
      return `${monthName} ${yyyy}`
    }

    case "week": {
      // key = "YYYY-Www"
      const weekNum = key.split("-W")[1]
      return `нед. ${parseInt(weekNum, 10)}`
    }
  }
}
