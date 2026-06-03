// tests/wb-funnel-merge.test.ts
// Quick 260519-funnel: unit-тесты на mergeOrdersAndFunnel.

import { describe, it, expect } from "vitest"
import { mergeOrdersAndFunnel } from "@/lib/wb-funnel-merge"

const d = (s: string) => new Date(s)

describe("mergeOrdersAndFunnel", () => {
  it("returns empty Map for empty inputs", () => {
    expect(mergeOrdersAndFunnel([], []).size).toBe(0)
  })

  it("uses orders.qty when funnel has no row for that (nmId, date)", () => {
    const orders = [
      { nmId: 100, date: d("2026-05-18"), qty: 5, sellerPrice: 1000, buyerPrice: 800 },
    ]
    const m = mergeOrdersAndFunnel(orders, [])
    expect(m.get(100)).toEqual([
      { date: d("2026-05-18"), qty: 5, sellerPrice: 1000, buyerPrice: 800, discountWb: null },
    ])
  })

  it("overrides qty from funnel.ordersCount when both sources have same (nmId, date)", () => {
    const orders = [
      { nmId: 100, date: d("2026-05-18"), qty: 95, sellerPrice: 5000, buyerPrice: 4000 },
    ]
    const funnel = [{ nmId: 100, date: d("2026-05-18"), ordersCount: 128 }]
    const m = mergeOrdersAndFunnel(orders, funnel)
    expect(m.get(100)?.[0].qty).toBe(128) // cabinet-matched
    expect(m.get(100)?.[0].sellerPrice).toBe(5000) // preserved from Orders
    expect(m.get(100)?.[0].buyerPrice).toBe(4000)
  })

  it("includes funnel-only days (no Orders snapshot)", () => {
    const funnel = [{ nmId: 200, date: d("2026-05-19"), ordersCount: 10 }]
    const m = mergeOrdersAndFunnel([], funnel)
    expect(m.get(200)).toEqual([
      { date: d("2026-05-19"), qty: 10, sellerPrice: null, buyerPrice: null, discountWb: null },
    ])
  })

  it("handles multiple nmIds with mixed sources", () => {
    const orders = [
      { nmId: 1, date: d("2026-05-17"), qty: 3, sellerPrice: 100, buyerPrice: 80 },
      { nmId: 1, date: d("2026-05-18"), qty: 5, sellerPrice: 100, buyerPrice: 80 },
      { nmId: 2, date: d("2026-05-18"), qty: 7, sellerPrice: 200, buyerPrice: 150 },
    ]
    const funnel = [
      { nmId: 1, date: d("2026-05-18"), ordersCount: 9 }, // override
      { nmId: 3, date: d("2026-05-18"), ordersCount: 1 }, // funnel-only
    ]
    const m = mergeOrdersAndFunnel(orders, funnel)
    expect(m.get(1)?.length).toBe(2)
    expect(m.get(1)?.find(r => r.date.toISOString().startsWith("2026-05-17"))?.qty).toBe(3)
    expect(m.get(1)?.find(r => r.date.toISOString().startsWith("2026-05-18"))?.qty).toBe(9)
    expect(m.get(2)?.[0].qty).toBe(7) // no funnel — orders.qty stays
    expect(m.get(3)?.[0].qty).toBe(1) // funnel-only
    expect(m.get(3)?.[0].sellerPrice).toBe(null)
  })
})
