// tests/finance-weekly-attribution.test.ts
// Quick 260710-hkj (W2d, Фикс 3): unit-тесты pure-функции attributeSpendByShares —
// распределение недельного тотала рекламы /adv/v1/upd (ground truth списаний)
// по nmId пропорционально долям fullstats (WbAdvertStatDaily.sum).
//
// Тест-файл pure: ноль импортов Prisma/React (паттерн distributePlanAcrossNmIds).

import { describe, it, expect } from "vitest"

import { attributeSpendByShares } from "@/lib/finance-weekly/attribution"

describe("attributeSpendByShares", () => {
  it("пропорция: updTotal 1000, доли {1→300, 2→100}, знаменатель 400 → {1: 750, 2: 250}", () => {
    const result = attributeSpendByShares(
      1000,
      new Map([
        [1, 300],
        [2, 100],
      ]),
      400,
    )
    expect(result.get(1)).toBeCloseTo(750, 6)
    expect(result.get(2)).toBeCloseTo(250, 6)
    expect(result.size).toBe(2)
  })

  it("инвариант суммы: Σ значений === updTotal × (Σ shares map / totalShares)", () => {
    const shares = new Map([
      [10, 123.45],
      [20, 678.9],
      [30, 0.65],
    ])
    const mapSum = 123.45 + 678.9 + 0.65
    const updTotal = 820_853.17

    // Знаменатель == Σ map → Σ значений === updTotal (точность 1e-6)
    const full = attributeSpendByShares(updTotal, shares, mapSum)
    let fullSum = 0
    for (const v of full.values()) fullSum += v
    expect(fullSum).toBeCloseTo(updTotal, 6)

    // Знаменатель > Σ map → Σ значений === updTotal × (Σ map / totalShares)
    const denominator = mapSum * 2
    const partial = attributeSpendByShares(updTotal, shares, denominator)
    let partialSum = 0
    for (const v of partial.values()) partialSum += v
    expect(partialSum).toBeCloseTo(updTotal * (mapSum / denominator), 6)
  })

  it("zero-guard: totalShares === 0 → все nmId получают 0 (не NaN/Infinity)", () => {
    const result = attributeSpendByShares(
      1000,
      new Map([
        [1, 0],
        [2, 0],
      ]),
      0,
    )
    expect(result.get(1)).toBe(0)
    expect(result.get(2)).toBe(0)
    for (const v of result.values()) {
      expect(Number.isFinite(v)).toBe(true)
    }
  })

  it("updTotal === 0 → все 0", () => {
    const result = attributeSpendByShares(
      0,
      new Map([
        [1, 300],
        [2, 100],
      ]),
      400,
    )
    expect(result.get(1)).toBe(0)
    expect(result.get(2)).toBe(0)
  })

  it("знаменатель больше Σ переданных shares (unlinked nmIds) → Σ attributed < updTotal", () => {
    const result = attributeSpendByShares(
      1000,
      new Map([
        [1, 300],
        [2, 100],
      ]),
      800, // 400 из map + 400 непривязанных nmId
    )
    // Каждое значение = updTotal × share/denominator
    expect(result.get(1)).toBeCloseTo(1000 * (300 / 800), 6) // 375
    expect(result.get(2)).toBeCloseTo(1000 * (100 / 800), 6) // 125
    let sum = 0
    for (const v of result.values()) sum += v
    expect(sum).toBeLessThan(1000) // нераспределённая доля unlinked остаётся вне отчёта (v1)
  })
})
