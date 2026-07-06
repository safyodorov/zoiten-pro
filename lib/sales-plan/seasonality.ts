// lib/sales-plan/seasonality.ts
//
// Индекс сезонности — помесячный множитель ставки плана продаж.
// Pure — ноль импортов Prisma / React / Next.
//
// Разрешение scope: SUBCATEGORY → CATEGORY → DIRECTION → GLOBAL (один самый точный
// с непустой кривой). Пере-якорение: эффективный = stored(m)/stored(currentMonth)×100.
//
// Дизайн: docs/superpowers/specs/2026-07-06-sales-plan-seasonality-design.md
// Quick 260706-q5a

export type SeasonalityScopeStr = "GLOBAL" | "DIRECTION" | "CATEGORY" | "SUBCATEGORY"

export interface SeasonalityRow {
  scope: SeasonalityScopeStr
  scopeId: string | null
  month: string // "YYYY-MM-01"
  indexPct: number // хранимое значение кривой
}

/** Ключ группировки scope. */
export function scopeKey(scope: SeasonalityScopeStr, scopeId: string | null): string {
  return `${scope}|${scopeId ?? ""}`
}

/** Группирует строки в Map "scope|scopeId" → Map<monthISO, storedPct>. */
export function groupSeasonality(rows: SeasonalityRow[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>()
  for (const r of rows) {
    const key = scopeKey(r.scope, r.scopeId)
    let inner = out.get(key)
    if (!inner) {
      inner = new Map<string, number>()
      out.set(key, inner)
    }
    inner.set(r.month, r.indexPct)
  }
  return out
}

/**
 * Разрешает эффективную помесячную кривую индекса для товара.
 *
 * Возвращает Record<monthISO, effectivePct> ТОЛЬКО для месяцев, где эффективный ≠ 100
 * (движок трактует отсутствие месяца как 100 — без множителя). Пустой объект = нет сезонности.
 */
export function resolveIndexByMonth(params: {
  grouped: Map<string, Map<string, number>>
  directionId: string | null
  categoryId: string | null
  subcategoryId: string | null
  currentMonth: string // "YYYY-MM-01"
  horizonMonths: string[] // ["2026-07-01", …, "2026-12-01"]
}): Record<string, number> {
  const { grouped, directionId, categoryId, subcategoryId, currentMonth, horizonMonths } = params

  // Кандидаты по убыванию специфичности
  const candidates: Array<[SeasonalityScopeStr, string | null]> = [
    ["SUBCATEGORY", subcategoryId],
    ["CATEGORY", categoryId],
    ["DIRECTION", directionId],
    ["GLOBAL", null],
  ]

  let curve: Map<string, number> | null = null
  for (const [scope, id] of candidates) {
    if (scope !== "GLOBAL" && id == null) continue
    const c = grouped.get(scopeKey(scope, id))
    if (c && c.size > 0) {
      curve = c
      break
    }
  }
  if (!curve) return {}

  const divisor = curve.get(currentMonth) ?? 100
  if (divisor === 0) return {} // защита; трактуем как без множителя

  const out: Record<string, number> = {}
  for (const m of horizonMonths) {
    const stored = curve.get(m) ?? 100
    const eff = (stored / divisor) * 100
    if (Math.abs(eff - 100) > 1e-6) out[m] = eff
  }
  return out
}

/**
 * Обратная нормировка при сохранении: введённый пользователем эффективный %
 * → хранимое значение, чтобы effective(m) === entered в момент ввода.
 * stored = entered × divisor / 100, где divisor = текущее stored(currentMonth) (default 100).
 */
export function storedFromEntered(enteredPct: number, divisor: number): number {
  return (enteredPct * divisor) / 100
}

/** Список первых чисел месяцев в диапазоне [from…to] (ISO "YYYY-MM-01"). */
export function monthsInRange(fromIso: string, toIso: string): string[] {
  const out: string[] = []
  let y = Number(fromIso.slice(0, 4))
  let m = Number(fromIso.slice(5, 7))
  const toKey = toIso.slice(0, 7)
  // guard от бесконечного цикла
  for (let i = 0; i < 240; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`
    out.push(`${key}-01`)
    if (key >= toKey) break
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}
