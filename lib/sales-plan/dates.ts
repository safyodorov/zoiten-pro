// lib/sales-plan/dates.ts
//
// Хелперы дат (UTC) для движка плана продаж.
// Перенесены из lib/sales-forecast.ts.
// Pure — ноль импортов Prisma / React / Next.
//
// Phase 25 (План продаж v2, 2026-07)

/** Парсит ISO-дату в UTC Date (midnight UTC). */
export function parseIsoUtc(s: string): Date {
  return new Date(s + "T00:00:00Z")
}

/** Форматирует Date в ISO-строку "YYYY-MM-DD". */
function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Добавляет n дней к ISO-дате. */
export function addDays(iso: string, n: number): string {
  const d = parseIsoUtc(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return toIso(d)
}

/** Разница в днях между двумя ISO-датами (a - b). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseIsoUtc(a).getTime() - parseIsoUtc(b).getTime()) / 86_400_000)
}

/**
 * Возвращает массив ISO-дат [from…to] включительно.
 * Если from > to — возвращает пустой массив.
 */
export function eachDayIso(from: string, to: string): string[] {
  const out: string[] = []
  let cur = from
  while (cur <= to) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

/**
 * Возвращает текущую дату по Москве (UTC+3) как ISO-строку "YYYY-MM-DD".
 */
export function getMskTodayIso(): string {
  const now = new Date()
  const msk = new Date(now.getTime() + 3 * 60 * 60 * 1000)
  return msk.toISOString().slice(0, 10)
}
