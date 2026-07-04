// lib/date-buckets.ts
//
// Общий модуль бакетирования дат.
// Вынесен из lib/loan-math.ts (day|week|month) + добавлены quarter|halfyear|year
// для плана продаж v2 (Phase 25).
//
// Pure, без зависимостей от Prisma / React / Next — используется и на сервере, и на клиенте.

// ── Types ────────────────────────────────────────────────────────────────────

export type Granularity = "day" | "week" | "month" | "quarter" | "halfyear" | "year"

// ── ISO 8601 Week algorithm ──────────────────────────────────────────────────

/**
 * Возвращает ISO 8601 год и номер недели для UTC-даты.
 * Понедельник = начало недели (ISO 8601).
 * Неделя 1 = неделя, содержащая первый четверг января.
 */
export function getIsoWeek(date: Date): { year: number; week: number } {
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

  // Номер недели = (thursday - firstMonday) / 7 + 1
  const diffMs = thursday.getTime() - firstMonday.getTime()
  const week = Math.floor(diffMs / (7 * 86400000)) + 1

  return { year, week }
}

// ── bucketKey ────────────────────────────────────────────────────────────────

/**
 * Возвращает ключ бакета для группировки по периоду.
 * Работает с UTC-компонентами даты.
 *
 * - "day"      → "YYYY-MM-DD"
 * - "week"     → "YYYY-Www" (ISO 8601, понедельник = начало недели)
 * - "month"    → "YYYY-MM"
 * - "quarter"  → "YYYY-Q1".."YYYY-Q4"
 * - "halfyear" → "YYYY-H1".."YYYY-H2"
 * - "year"     → "YYYY"
 */
export function bucketKey(date: Date, granularity: Granularity): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  const d = String(date.getUTCDate()).padStart(2, "0")

  switch (granularity) {
    case "day":
      return `${y}-${m}-${d}`

    case "week": {
      const { year, week } = getIsoWeek(date)
      return `${year}-W${String(week).padStart(2, "0")}`
    }

    case "month":
      return `${y}-${m}`

    case "quarter": {
      const q = Math.ceil((date.getUTCMonth() + 1) / 3)
      return `${y}-Q${q}`
    }

    case "halfyear": {
      const h = date.getUTCMonth() < 6 ? 1 : 2
      return `${y}-H${h}`
    }

    case "year":
      return `${y}`
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
 * - "day"      → "DD.MM"        (напр. "09.06")
 * - "week"     → "нед. N"       (напр. "нед. 24")
 * - "month"    → "ммм YYYY"     (напр. "июн 2026")
 * - "quarter"  → "Q3 2026"
 * - "halfyear" → "H2 2026"
 * - "year"     → "2026"
 */
export function bucketLabel(key: string, granularity: Granularity): string {
  switch (granularity) {
    case "day": {
      // key = "YYYY-MM-DD"
      const [, mm, dd] = key.split("-")
      return `${dd}.${mm}`
    }

    case "week": {
      // key = "YYYY-Www"
      const weekNum = key.split("-W")[1]
      return `нед. ${parseInt(weekNum, 10)}`
    }

    case "month": {
      // key = "YYYY-MM"
      const [yyyy, mm] = key.split("-")
      const monthIdx = parseInt(mm, 10) - 1
      const monthName = RU_MONTHS_SHORT[monthIdx] ?? mm
      return `${monthName} ${yyyy}`
    }

    case "quarter": {
      // key = "YYYY-Q3"
      const parts = key.split("-Q")
      return `Q${parts[1]} ${parts[0]}`
    }

    case "halfyear": {
      // key = "YYYY-H2"
      const parts = key.split("-H")
      return `H${parts[1]} ${parts[0]}`
    }

    case "year":
      return key
  }
}
