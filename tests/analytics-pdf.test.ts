import { describe, it, expect } from "vitest"
import { renderNicheRunPdf, orderSkusForPdf } from "@/lib/analytics/pdf"
import { NICHE_RUN_SNAPSHOT_VERSION, type NicheRunPayload, type SkuPayload } from "@/lib/analytics/types"

function sku(nmId: number, revenue: number, clickToOrder: number): SkuPayload {
  return {
    nmId,
    brand: "TestBrand",
    seller: "114151",
    subject: "Кофемашины",
    name: `SKU ${nmId}`,
    rating: 4.8,
    feedbacksCount: 100,
    mainPhoto: "",
    listingPhotos: [], // пусто → без сетевых загрузок в тесте
    characteristics: [{ name: "Цвет", value: "чёрный" }],
    funnel: {
      viewsPerDay: 100,
      ordersPerDay: 5,
      ordersSumPerDay: 5000,
      ctr: 0.07,
      clickToCart: 0.1,
      cartToOrder: 0.05,
      clickToOrder,
      buyoutPct: 0.8,
      medianPriceWallet: 8730,
    },
    funnelDays: [
      { nmId, dt: "2026-06-11", viewCount: 100, openCard: 50, addToCart: 10, orders: 5, ordersSum: 5000, buyoutCount: 4, medianPrice: 9000 },
      { nmId, dt: "2026-06-12", viewCount: 120, openCard: 60, addToCart: 12, orders: 6, ordersSum: 6000, buyoutCount: 5, medianPrice: 9100 },
    ],
    priceDays: [
      { dt: "2026-06-11", value: 8730 },
      { dt: "2026-06-12", value: 8827 },
    ],
    queries: [],
    revenue,
    complete: true,
  }
}

const payload: NicheRunPayload = {
  version: NICHE_RUN_SNAPSHOT_VERSION,
  dateFrom: "2026-06-11",
  dateTo: "2026-07-10",
  skus: [sku(1, 100000, 0.02), sku(2, 300000, 0.01), sku(3, 200000, 0.05)],
}

describe("renderNicheRunPdf — генерация PDF (ANL-11)", () => {
  it("возвращает Buffer с PDF magic bytes и ненулевым размером", async () => {
    const buf = await renderNicheRunPdf(payload, "revenue")
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(0)
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF")
  })

  it("порядок SKU в PDF = sortSkus(sortMode)", () => {
    // revenue desc → [2,3,1]; clickToOrder desc → [3,1,2]
    expect(orderSkusForPdf(payload, "revenue").map((s) => s.nmId)).toEqual([2, 3, 1])
    expect(orderSkusForPdf(payload, "clickToOrder").map((s) => s.nmId)).toEqual([3, 1, 2])
  })

  it("не падает при ряде из <2 точек (график-заглушка)", async () => {
    const single: NicheRunPayload = {
      ...payload,
      skus: [
        {
          ...sku(9, 5000, 0.01),
          priceDays: [{ dt: "2026-06-11", value: 100 }], // 1 точка
          funnelDays: [{ nmId: 9, dt: "2026-06-11", viewCount: 1, openCard: 1, addToCart: 0, orders: 0, ordersSum: 0, buyoutCount: 0, medianPrice: 100 }],
        },
      ],
    }
    const buf = await renderNicheRunPdf(single, "revenue")
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF")
  })
})
