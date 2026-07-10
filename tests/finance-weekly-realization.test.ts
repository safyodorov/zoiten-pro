// tests/finance-weekly-realization.test.ts
// W1 (quick 260710-jgs): unit-тесты pure-хелперов wiring реализации в
// /finance/weekly (lib/finance-weekly/realization.ts). Импорт ТОЛЬКО pure-модуля —
// ноль Prisma/Next зависимостей.

import { describe, it, expect } from "vitest"
import {
  splitRealizationRows,
  distributeByRevenue,
  buildRealizationPools,
  reviewWriteoffFor,
  logisticsIuPerUnit,
  type RealizationBuckets,
  type RealizationRow,
} from "@/lib/finance-weekly/realization"

function mkBuckets(overrides: Partial<RealizationBuckets> = {}): RealizationBuckets {
  return {
    forPayRub: 0,
    deliveryRub: 0,
    storageRub: 0,
    acceptanceRub: 0,
    penaltyRub: 0,
    reviewPointsRub: 0,
    promotionRub: 0,
    deductionOtherRub: 0,
    ...overrides,
  }
}

function mkRow(nmId: number, overrides: Partial<RealizationBuckets> = {}): RealizationRow {
  return { nmId, ...mkBuckets(overrides) }
}

// ── splitRealizationRows ───────────────────────────────────────────────────────

describe("splitRealizationRows", () => {
  it("строка nmId=0 уходит в accountLevel, остальные — в byNmId", () => {
    const rows: RealizationRow[] = [
      mkRow(1, { deliveryRub: 30, forPayRub: 100 }),
      mkRow(2, { storageRub: 10 }),
      mkRow(0, { reviewPointsRub: 300, storageRub: 50 }),
    ]
    const { byNmId, accountLevel } = splitRealizationRows(rows)
    expect(byNmId.size).toBe(2)
    expect(byNmId.get(1)?.deliveryRub).toBe(30)
    expect(byNmId.get(1)?.forPayRub).toBe(100)
    expect(byNmId.get(2)?.storageRub).toBe(10)
    expect(accountLevel.reviewPointsRub).toBe(300)
    expect(accountLevel.storageRub).toBe(50)
  })
})

// ── distributeByRevenue ────────────────────────────────────────────────────────

describe("distributeByRevenue", () => {
  it("распределяет пропорционально выручке; Σ долей = total (±0.01)", () => {
    const shares = distributeByRevenue(
      100,
      new Map([
        [1, 300],
        [2, 100],
      ]),
    )
    expect(shares.get(1)).toBeCloseTo(75, 2)
    expect(shares.get(2)).toBeCloseTo(25, 2)
    const sum = Array.from(shares.values()).reduce((s, v) => s + v, 0)
    expect(Math.abs(sum - 100)).toBeLessThan(0.01)
  })

  it("нулевая база → все доли 0 (guard, не NaN)", () => {
    const shares = distributeByRevenue(
      100,
      new Map([
        [1, 0],
        [2, 0],
      ]),
    )
    expect(shares.get(1)).toBe(0)
    expect(shares.get(2)).toBe(0)
  })

  it("пустая карта → пустой результат без NaN", () => {
    const shares = distributeByRevenue(100, new Map())
    expect(shares.size).toBe(0)
  })
})

// ── buildRealizationPools ──────────────────────────────────────────────────────

describe("buildRealizationPools", () => {
  it("storage/acceptance per universe = Σ своих nmId + пропорц. доля account-level; unresolved nmId → к account-level (не теряется)", () => {
    const byNmId = new Map<number, RealizationBuckets>([
      // appliances
      [1, mkBuckets({ storageRub: 100, acceptanceRub: 40, penaltyRub: 10 })],
      // clothing
      [2, mkBuckets({ storageRub: 200, acceptanceRub: 20 })],
      // nmId ВНЕ universeByNmId (непривязанный) → присоединяется к account-level
      [555, mkBuckets({ storageRub: 50, acceptanceRub: 30, penaltyRub: 5 })],
    ])
    const accountLevel = mkBuckets({ storageRub: 100, acceptanceRub: 60, penaltyRub: 40 })
    const universeByNmId = new Map<number, "appliances" | "clothing">([
      [1, "appliances"],
      [2, "clothing"],
    ])
    const pools = buildRealizationPools(byNmId, accountLevel, universeByNmId, 750, 250)

    // account-level storage = 100 + unresolved 50 = 150 → appl 112.5 / cloth 37.5
    expect(pools.storageAppl).toBeCloseTo(100 + 112.5, 2)
    expect(pools.storageCloth).toBeCloseTo(200 + 37.5, 2)
    // acceptance = acceptanceRub + penaltyRub;
    // account-level = (60+40) + unresolved (30+5) = 135 → appl 101.25 / cloth 33.75
    expect(pools.acceptanceAppl).toBeCloseTo(50 + 101.25, 2)
    expect(pools.acceptanceCloth).toBeCloseTo(20 + 33.75, 2)
  })

  it("товар без продаж недели, но с universe — попадает в пул своей вселенной (не в account-level)", () => {
    // nmId 3 есть в universeByNmId (привязан к товару), но его выручки нет в базах —
    // его хранение обязано остаться в appliances-пуле целиком.
    const byNmId = new Map<number, RealizationBuckets>([
      [3, mkBuckets({ storageRub: 77 })],
    ])
    const universeByNmId = new Map<number, "appliances" | "clothing">([[3, "appliances"]])
    const pools = buildRealizationPools(byNmId, mkBuckets(), universeByNmId, 100, 100)
    expect(pools.storageAppl).toBe(77)
    expect(pools.storageCloth).toBe(0)
  })

  it("combinedBase=0 → account-level доля 0 (не NaN)", () => {
    const byNmId = new Map<number, RealizationBuckets>([
      [1, mkBuckets({ storageRub: 100 })],
    ])
    const accountLevel = mkBuckets({ storageRub: 500 })
    const universeByNmId = new Map<number, "appliances" | "clothing">([[1, "appliances"]])
    const pools = buildRealizationPools(byNmId, accountLevel, universeByNmId, 0, 0)
    expect(pools.storageAppl).toBe(100)
    expect(pools.storageCloth).toBe(0)
    expect(Number.isFinite(pools.acceptanceAppl)).toBe(true)
  })
})

// ── reviewWriteoffFor ──────────────────────────────────────────────────────────

describe("reviewWriteoffFor", () => {
  it("reviewPointsRub[nmId] + доля account-level reviewPoints по выручке", () => {
    const byNmId = new Map<number, RealizationBuckets>([
      [7, mkBuckets({ reviewPointsRub: 120 })],
    ])
    const accountShare = distributeByRevenue(
      300,
      new Map([
        [7, 7500],
        [8, 2500],
      ]),
    )
    expect(reviewWriteoffFor(7, byNmId, accountShare)).toBeCloseTo(120 + 225, 2)
    // nmId 8 без собственных строк — только доля account-level
    expect(reviewWriteoffFor(8, byNmId, accountShare)).toBeCloseTo(75, 2)
    // nmId без строк и без доли → 0
    expect(reviewWriteoffFor(9, byNmId, accountShare)).toBe(0)
  })
})

// ── logisticsIuPerUnit ─────────────────────────────────────────────────────────

describe("logisticsIuPerUnit", () => {
  it("deliveryRub / qty", () => {
    expect(logisticsIuPerUnit(150, 3)).toBe(50)
  })

  it("qty=0 → 0 (guard, не Infinity)", () => {
    expect(logisticsIuPerUnit(150, 0)).toBe(0)
  })
})
