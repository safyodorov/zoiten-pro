// Phase 19 / Plan 19-05 / Task 2: unit-тесты для pure helpers агрегации WB Advert stats.
// 9 тестов покрывают 5 dimensions + period range + zero-guards.

import { describe, it, expect } from "vitest"
import {
  aggregateStats,
  groupByCampaign,
  groupByProduct,
  groupByNmId,
  groupByImtId,
  groupByType,
  getPeriodRange,
  type StatRow,
} from "@/lib/wb-advert-aggregations"

// Factory с дефолтами для нулевых полей — DRY между тестами
const row = (overrides: Partial<StatRow> = {}): StatRow => ({
  advertId: 1,
  nmId: 100,
  appType: 0,
  date: "2026-05-15",
  views: 0,
  clicks: 0,
  sum: 0,
  atbs: 0,
  orders: 0,
  shks: 0,
  sumPrice: 0,
  ...overrides,
})

describe("aggregateStats", () => {
  it("Test 1: суммирует поля + считает derived ratios", () => {
    const result = aggregateStats([
      row({ views: 100, clicks: 5, sum: 50, orders: 1, sumPrice: 1000 }),
      row({ views: 200, clicks: 10, sum: 100, orders: 2, sumPrice: 2000 }),
    ])
    expect(result.totalSpent).toBe(150)
    expect(result.totalOrders).toBe(3)
    expect(result.totalRevenue).toBe(3000)
    expect(result.totalViews).toBe(300)
    expect(result.totalClicks).toBe(15)
    // ДРР = 150 / 3000 * 100 = 5%
    expect(result.drr).toBeCloseTo(5, 5)
    // CPC = 150 / 15 = 10₽
    expect(result.cpc).toBeCloseTo(10, 5)
    // CTR = 15 / 300 * 100 = 5%
    expect(result.ctr).toBeCloseTo(5, 5)
    // CR = 3 / 15 * 100 = 20%
    expect(result.cr).toBeCloseTo(20, 5)
  })

  it("Test 2: пустой массив → нули + ratios = null (no NaN/Infinity)", () => {
    const result = aggregateStats([])
    expect(result.totalSpent).toBe(0)
    expect(result.totalOrders).toBe(0)
    expect(result.totalRevenue).toBe(0)
    expect(result.totalViews).toBe(0)
    expect(result.totalClicks).toBe(0)
    expect(result.drr).toBeNull()
    expect(result.cpc).toBeNull()
    expect(result.ctr).toBeNull()
    expect(result.cr).toBeNull()
  })

  it("Test 3: views > 0 и clicks = 0 → cpc/cr null, ctr = 0, drr null", () => {
    const result = aggregateStats([row({ views: 100, clicks: 0, sum: 50 })])
    expect(result.cpc).toBeNull() // делим на clicks=0
    expect(result.cr).toBeNull() // делим на clicks=0
    expect(result.ctr).toBe(0) // 0 / 100 * 100 = 0 (views > 0 — ratio определён)
    expect(result.drr).toBeNull() // revenue = 0
  })
})

describe("groupByCampaign", () => {
  it("Test 4: 2 разных advertId → Map с 2 ключами", () => {
    const result = groupByCampaign([
      row({ advertId: 1, sum: 10 }),
      row({ advertId: 1, sum: 20 }),
      row({ advertId: 2, sum: 5 }),
    ])
    expect(result.size).toBe(2)
    expect(result.get(1)?.totalSpent).toBe(30)
    expect(result.get(2)?.totalSpent).toBe(5)
  })
})

describe("groupByProduct", () => {
  it("Test 5: rows с nmId не из map → пропускаются", () => {
    const nmIdToProductId = new Map<number, string>([
      [100, "prod-A"],
      [200, "prod-B"],
    ])
    const result = groupByProduct(
      [
        row({ nmId: 100, sum: 10 }),
        row({ nmId: 200, sum: 20 }),
        row({ nmId: 999, sum: 100 }), // не в map → skip
      ],
      nmIdToProductId,
    )
    expect(result.size).toBe(2)
    expect(result.get("prod-A")?.totalSpent).toBe(10)
    expect(result.get("prod-B")?.totalSpent).toBe(20)
  })
})

describe("getPeriodRange", () => {
  it("Test 6: days=7, now=2026-05-15T12:00 MSK → begin=2026-05-08, end=2026-05-14", () => {
    // 12:00 MSK = 09:00 UTC
    const now = new Date("2026-05-15T09:00:00Z")
    const { begin, end } = getPeriodRange(7, now)
    // end = вчера MSK = 2026-05-14
    expect(end).toBe("2026-05-14")
    // begin = end - (7-1) дней = 2026-05-08
    expect(begin).toBe("2026-05-08")
  })
})

describe("groupByNmId", () => {
  it("Test 7: nmIds aggregated в Map<nmId, Aggregated>", () => {
    const result = groupByNmId([
      row({ nmId: 100, sum: 10 }),
      row({ nmId: 100, sum: 20 }),
      row({ nmId: 100, sum: 5 }),
      row({ nmId: 200, sum: 50 }),
    ])
    expect(result.size).toBe(2)
    expect(result.get(100)?.totalSpent).toBe(35)
    expect(result.get(200)?.totalSpent).toBe(50)
  })
})

describe("groupByImtId", () => {
  it("Test 8: nmIds группируются по imtId; null imtId — skip", () => {
    const nmIdToImtId = new Map<number, number | null>([
      [100, 500],
      [101, 500],
      [200, 600],
      [300, null], // не склейка — должен быть пропущен
    ])
    const result = groupByImtId(
      [
        row({ nmId: 100, sum: 10 }),
        row({ nmId: 101, sum: 15 }),
        row({ nmId: 200, sum: 50 }),
        row({ nmId: 300, sum: 100 }), // imt=null → skip
      ],
      nmIdToImtId,
    )
    expect(result.size).toBe(2)
    expect(result.get(500)?.totalSpent).toBe(25) // 10 + 15
    expect(result.get(600)?.totalSpent).toBe(50)
    expect(result.get(null as unknown as number)).toBeUndefined()
  })
})

describe("groupByType", () => {
  it("Test 9: rows aggregated по типу кампании; advertId не в map → skip", () => {
    const advertIdToType = new Map<number, number>([
      [1, 9],
      [2, 9],
      [3, 8],
      // advertId=4 НЕ в map — должен быть пропущен
    ])
    const result = groupByType(
      [
        row({ advertId: 1, sum: 10 }),
        row({ advertId: 2, sum: 20 }),
        row({ advertId: 3, sum: 5 }),
        row({ advertId: 4, sum: 999 }), // skip
      ],
      advertIdToType,
    )
    expect(result.size).toBe(2)
    expect(result.get(9)?.totalSpent).toBe(30)
    expect(result.get(8)?.totalSpent).toBe(5)
  })
})
