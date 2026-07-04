// lib/sales-plan/iu.ts
//
// Расчёт ИУ (индивидуальных условий) по дневной ставке.
// Pure — ноль импортов Prisma / React / Next.
//
// Golden test: iuTotalForRange("2026-07-01","2026-12-31", [{from:"2026-07-01",to:"2026-12-31",dailyRub:2_380_805}])
//              === 438_068_120 (184 дня × 2 380 805 ₽/день)
//
// Phase 25 (План продаж v2, 2026-07)

import type { IuTarget } from "./types"
import { eachDayIso } from "./dates"

/**
 * Возвращает суммарное ИУ за диапазон [from..to] по массиву периодов-таргетов.
 *
 * Для каждого дня диапазона ищется первый target, чей период [t.from; t.to]
 * содержит этот день. Если target найден — добавляется его dailyRub.
 * Если несколько target'ов перекрываются, используется первый в массиве (детерминизм).
 *
 * Golden: 184 дня × 2_380_805 = 438_068_120
 */
export function iuTotalForRange(from: string, to: string, targets: IuTarget[]): number {
  if (targets.length === 0) return 0
  const days = eachDayIso(from, to)
  let total = 0
  for (const day of days) {
    const target = targets.find((t) => t.from <= day && day <= t.to)
    if (target) {
      total += target.dailyRub
    }
  }
  return total
}

/**
 * Возвращает накопительный ряд ИУ по дням диапазона [from..to].
 * Каждый элемент: { date: string; cumulative: number }.
 *
 * Ряд монотонно возрастает (шаг = dailyRub того дня или 0).
 */
export function iuSeriesForRange(
  from: string,
  to: string,
  targets: IuTarget[],
): Array<{ date: string; cumulative: number }> {
  const days = eachDayIso(from, to)
  let cumulative = 0
  return days.map((day) => {
    const target = targets.find((t) => t.from <= day && day <= t.to)
    if (target) {
      cumulative += target.dailyRub
    }
    return { date: day, cumulative }
  })
}
