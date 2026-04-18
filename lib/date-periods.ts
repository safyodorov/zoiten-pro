// lib/date-periods.ts
// Phase 13 — TZ-safe period хелперы для Europe/Moscow (+03:00 с 2014).
// Используется на /support/stats и в cron upsert ManagerSupportStats.

const MSK_OFFSET = "+03:00"

export const PERIOD_PRESETS = ["7d", "30d", "quarter", "custom"] as const
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]

export interface Period {
  dateFrom: Date
  dateTo: Date
}

export interface CustomPeriodInput {
  from: string // YYYY-MM-DD
  to: string // YYYY-MM-DD
}

function extractMskYmd(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const find = (t: string) => parts.find((p) => p.type === t)!.value
  return {
    year: parseInt(find("year")),
    month: parseInt(find("month")),
    day: parseInt(find("day")),
  }
}

export function startOfMonthMsk(date: Date = new Date()): Date {
  const { year, month } = extractMskYmd(date)
  const mm = String(month).padStart(2, "0")
  return new Date(`${year}-${mm}-01T00:00:00${MSK_OFFSET}`)
}

export function startOfQuarterMsk(date: Date = new Date()): Date {
  const { year, month } = extractMskYmd(date)
  // Q1=Jan(1-3), Q2=Apr(4-6), Q3=Jul(7-9), Q4=Oct(10-12)
  const qStartMonth = Math.floor((month - 1) / 3) * 3 + 1
  const mm = String(qStartMonth).padStart(2, "0")
  return new Date(`${year}-${mm}-01T00:00:00${MSK_OFFSET}`)
}

export function startOfDayMsk(date: Date): Date {
  const { year, month, day } = extractMskYmd(date)
  const mm = String(month).padStart(2, "0")
  const dd = String(day).padStart(2, "0")
  return new Date(`${year}-${mm}-${dd}T00:00:00${MSK_OFFSET}`)
}

export function endOfDayMsk(date: Date): Date {
  const { year, month, day } = extractMskYmd(date)
  const mm = String(month).padStart(2, "0")
  const dd = String(day).padStart(2, "0")
  return new Date(`${year}-${mm}-${dd}T23:59:59.999${MSK_OFFSET}`)
}

export function getPeriod(
  preset: PeriodPreset,
  custom?: CustomPeriodInput
): Period {
  const now = new Date()
  switch (preset) {
    case "7d":
      return { dateFrom: new Date(now.getTime() - 7 * 86_400_000), dateTo: now }
    case "30d":
      return { dateFrom: new Date(now.getTime() - 30 * 86_400_000), dateTo: now }
    case "quarter":
      return { dateFrom: startOfQuarterMsk(now), dateTo: now }
    case "custom": {
      if (!custom) throw new Error("custom preset requires custom arg")
      return {
        dateFrom: new Date(`${custom.from}T00:00:00${MSK_OFFSET}`),
        dateTo: new Date(`${custom.to}T23:59:59.999${MSK_OFFSET}`),
      }
    }
  }
}
