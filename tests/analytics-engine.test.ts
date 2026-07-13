import { describe, it, expect } from "vitest"
import {
  aggregateFunnel,
  sortSkus,
  evaluateCompleteness,
  averagePositionByQuery,
} from "@/lib/analytics/engine"
import type { FunnelDayRaw, FunnelMonthTotals, PositionDay } from "@/lib/analytics/types"

function day(p: Partial<FunnelDayRaw> & { dt: string }): FunnelDayRaw {
  return {
    nmId: 1,
    viewCount: 0,
    openCard: 0,
    addToCart: 0,
    orders: 0,
    ordersSum: 0,
    buyoutCount: 0,
    medianPrice: 0,
    ...p,
  }
}

describe("aggregateFunnel — объёмы = месяц ÷ 30 (КОНСТАНТА, не n)", () => {
  it("делит месячные тоталы на 30, а не на n=28 (фикстура 28 дней)", () => {
    const days = Array.from({ length: 28 }, (_, i) =>
      day({ dt: `2026-06-${String(i + 1).padStart(2, "0")}`, viewCount: 10, orders: 1, ordersSum: 100 }),
    )
    const monthly: FunnelMonthTotals = { viewCount: 3000, orders: 300, ordersSum: 900000 }
    const agg = aggregateFunnel(days, monthly)
    expect(agg.viewsPerDay).toBeCloseTo(3000 / 30, 9) // = 100
    expect(agg.ordersPerDay).toBeCloseTo(300 / 30, 9)
    expect(agg.ordersSumPerDay).toBeCloseTo(900000 / 30, 9)
    // деление на n=28 дало бы ≈107.14 — фиксируем КОНСТАНТУ 30
    expect(agg.viewsPerDay).not.toBeCloseTo(3000 / 28, 3)
  })

  it("fallback без monthly: Σ(byDay) ÷ 30 (не ÷ n)", () => {
    const days = Array.from({ length: 28 }, (_, i) => day({ dt: `d${i}`, viewCount: 30 })) // Σ = 840
    const agg = aggregateFunnel(days)
    expect(agg.viewsPerDay).toBeCloseTo(840 / 30, 9) // = 28, НЕ 840/28 = 30
    expect(agg.viewsPerDay).not.toBeCloseTo(840 / 28, 3)
  })
})

describe("aggregateFunnel — «от сумм» + клик→заказ = произведение + цена ×0.97", () => {
  // Разные объёмы по дням: «от сумм» ≠ среднему дневных процентов.
  const days: FunnelDayRaw[] = [
    day({ dt: "a", viewCount: 1000, openCard: 100, addToCart: 20, orders: 10, buyoutCount: 8, medianPrice: 100 }),
    day({ dt: "b", viewCount: 100, openCard: 50, addToCart: 40, orders: 30, buyoutCount: 27, medianPrice: 200 }),
  ]
  const agg = aggregateFunnel(days)

  it("CTR «от сумм» (Σпереходов/Σпоказов) ≠ среднему дневных %", () => {
    expect(agg.ctr).toBeCloseTo(150 / 1100, 9)
    expect(agg.ctr).not.toBeCloseTo((0.1 + 0.5) / 2, 3) // не 0.30
  })

  it("клик→заказ «от сумм» == клик→корзина × корзина→заказ", () => {
    expect(agg.clickToOrder).toBeCloseTo(agg.clickToCart * agg.cartToOrder, 9)
    expect(agg.clickToOrder).toBeCloseTo(40 / 150, 9)
  })

  it("выкуп = Σвыкупов/Σзаказов", () => {
    expect(agg.buyoutPct).toBeCloseTo(35 / 40, 9)
  })

  it("медианная цена = средняя за период × 0.97", () => {
    expect(agg.medianPriceWallet).toBeCloseTo(150 * 0.97, 9) // avg(100,200)=150
  })

  it("защита от деления на 0 (пустая воронка)", () => {
    const z = aggregateFunnel([day({ dt: "z" })])
    expect(z.ctr).toBe(0)
    expect(z.clickToOrder).toBe(0)
    expect(z.buyoutPct).toBe(0)
    expect(z.medianPriceWallet).toBe(0)
  })
})

describe("sortSkus — единый порядок (ANL-06)", () => {
  const mk = (nmId: number, revenue: number, clickToOrder: number) => ({
    nmId,
    revenue,
    funnel: { clickToOrder },
  })
  const skus = [mk(1, 100, 0.5), mk(2, 300, 0.1), mk(3, 200, 0.9)]

  it("по выручке (desc)", () => {
    expect(sortSkus(skus, "revenue").map((s) => s.nmId)).toEqual([2, 3, 1])
  })

  it("по конверсии клик→заказ (desc)", () => {
    expect(sortSkus(skus, "clickToOrder").map((s) => s.nmId)).toEqual([3, 1, 2])
  })
})

describe("evaluateCompleteness — полнота по рангу выручки (ANL-07)", () => {
  // nmId i+1 → revenue (30-i)*1000 : nmId=1 самый дорогой (ранг 1), nmId=30 дешёвый (ранг 30)
  const base = Array.from({ length: 30 }, (_, i) => ({ nmId: i + 1, revenue: (30 - i) * 1000, complete: true }))

  it("всё собрано → OK", () => {
    expect(evaluateCompleteness(base).status).toBe("OK")
  })

  it("сбой в топ-10 по выручке → FAILED", () => {
    const skus = base.map((s) => (s.nmId === 3 ? { ...s, complete: false } : s)) // ранг 3
    const r = evaluateCompleteness(skus)
    expect(r.status).toBe("FAILED")
    expect(r.failedInTop10).toContain(3)
  })

  it("сбой в рангах 11–30 → PARTIAL", () => {
    const skus = base.map((s) => (s.nmId === 20 ? { ...s, complete: false } : s)) // ранг 20
    const r = evaluateCompleteness(skus)
    expect(r.status).toBe("PARTIAL")
    expect(r.failedIn11to30).toContain(20)
    expect(r.failedInTop10).toHaveLength(0)
  })
})

describe("averagePositionByQuery — игнор дней-прочерков (ANL-10)", () => {
  it("среднее только по дням присутствия", () => {
    const days: PositionDay[] = [
      { dt: "a", organic: 5, ad: null },
      { dt: "b", organic: null, ad: null },
      { dt: "c", organic: 3, ad: null },
    ]
    expect(averagePositionByQuery(days)).toBeCloseTo(4, 9) // (5+3)/2, не /3
  })

  it("все прочерки → null (без штрафа)", () => {
    const days: PositionDay[] = [{ dt: "a", organic: null, ad: null }]
    expect(averagePositionByQuery(days)).toBeNull()
  })
})
