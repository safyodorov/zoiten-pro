import { describe, it, expect } from "vitest"
import {
  groupSeasonality,
  resolveIndexByMonth,
  storedFromEntered,
  monthsInRange,
  type SeasonalityRow,
} from "@/lib/sales-plan/seasonality"

// Индекс сезонности — quick 260706-q5a
// Дизайн: docs/superpowers/specs/2026-07-06-sales-plan-seasonality-design.md

const HORIZON = monthsInRange("2026-07-01", "2026-12-01")

function global(month: string, pct: number): SeasonalityRow {
  return { scope: "GLOBAL", scopeId: null, month, indexPct: pct }
}

describe("monthsInRange", () => {
  it("H2-2026 = 6 месяцев июль…декабрь", () => {
    expect(HORIZON).toEqual([
      "2026-07-01", "2026-08-01", "2026-09-01",
      "2026-10-01", "2026-11-01", "2026-12-01",
    ])
  })
})

describe("resolveIndexByMonth — нормировка на текущий месяц", () => {
  const grouped = groupSeasonality([global("2026-08-01", 120), global("2026-09-01", 150)])
  const base = {
    grouped,
    directionId: null,
    categoryId: null,
    subcategoryId: null,
    horizonMonths: HORIZON,
  }

  it("текущий июль: авг ×1.20, сен ×1.50 (остальные = 100 → опущены)", () => {
    const out = resolveIndexByMonth({ ...base, currentMonth: "2026-07-01" })
    expect(out["2026-08-01"]).toBeCloseTo(120, 6)
    expect(out["2026-09-01"]).toBeCloseTo(150, 6)
    expect(out["2026-07-01"]).toBeUndefined() // eff 100 → опущен
    expect(out["2026-10-01"]).toBeUndefined()
  })

  it("пере-якорение: текущий август → авг=100 (опущен), сен=125", () => {
    const out = resolveIndexByMonth({ ...base, currentMonth: "2026-08-01" })
    expect(out["2026-08-01"]).toBeUndefined() // 120/120 = 100
    expect(out["2026-09-01"]).toBeCloseTo(125, 6) // 150/120×100
  })

  it("нет сезонности → пустой объект (без множителя)", () => {
    const out = resolveIndexByMonth({
      ...base,
      grouped: groupSeasonality([]),
      currentMonth: "2026-07-01",
    })
    expect(out).toEqual({})
  })
})

describe("resolveIndexByMonth — приоритет scope (один самый точный)", () => {
  const rows: SeasonalityRow[] = [
    { scope: "SUBCATEGORY", scopeId: "sub1", month: "2026-08-01", indexPct: 200 },
    { scope: "CATEGORY", scopeId: "cat1", month: "2026-08-01", indexPct: 120 },
    global("2026-08-01", 110),
  ]
  const grouped = groupSeasonality(rows)

  it("товар с подкатегорией sub1 → берётся подкатегория (200), не категория", () => {
    const out = resolveIndexByMonth({
      grouped, directionId: null, categoryId: "cat1", subcategoryId: "sub1",
      currentMonth: "2026-07-01", horizonMonths: HORIZON,
    })
    expect(out["2026-08-01"]).toBeCloseTo(200, 6)
  })

  it("товар без подкатегории, категория cat1 → берётся категория (120)", () => {
    const out = resolveIndexByMonth({
      grouped, directionId: null, categoryId: "cat1", subcategoryId: null,
      currentMonth: "2026-07-01", horizonMonths: HORIZON,
    })
    expect(out["2026-08-01"]).toBeCloseTo(120, 6)
  })

  it("товар без под/категории → глобальный (110)", () => {
    const out = resolveIndexByMonth({
      grouped, directionId: null, categoryId: null, subcategoryId: null,
      currentMonth: "2026-07-01", horizonMonths: HORIZON,
    })
    expect(out["2026-08-01"]).toBeCloseTo(110, 6)
  })
})

describe("storedFromEntered — обратная нормировка сохранения", () => {
  it("divisor 100 (первый ввод) → stored = entered", () => {
    expect(storedFromEntered(120, 100)).toBeCloseTo(120, 6)
  })
  it("divisor 120 (правка в августе) → entered 130 сен → stored 156", () => {
    expect(storedFromEntered(130, 120)).toBeCloseTo(156, 6)
  })
})
