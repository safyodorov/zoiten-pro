import { describe, it, expect } from "vitest"
import { buildNicheRunPayload, parseNicheRunPayload } from "@/lib/analytics/snapshot"
import { NICHE_RUN_SNAPSHOT_VERSION, type SkuPayload } from "@/lib/analytics/types"

function sku(nmId: number): SkuPayload {
  return {
    nmId,
    brand: "B",
    seller: "114151",
    subject: "Кофемашины",
    name: "Кофемашина",
    rating: 4.9,
    feedbacksCount: 1438,
    mainPhoto: "https://basket-39.wbbasket.ru/x/1.webp",
    listingPhotos: ["https://basket-39.wbbasket.ru/x/1.webp"],
    characteristics: [{ name: "Цвет", value: "чёрный" }],
    funnel: {
      viewsPerDay: 100,
      ordersPerDay: 5,
      ordersSumPerDay: 5000,
      ctr: 0.07,
      clickToCart: 0.1,
      cartToOrder: 0.05,
      clickToOrder: 0.005,
      buyoutPct: 0.8,
      medianPriceWallet: 8730,
    },
    funnelDays: [],
    priceDays: [{ dt: "2026-06-11", value: 8730 }],
    queries: [],
    revenue: 150000,
    complete: true,
  }
}

describe("snapshot — build/parse round-trip + version guard (ANL-05)", () => {
  it("build проставляет текущую version + dateFrom/dateTo/skus", () => {
    const p = buildNicheRunPayload([sku(1), sku(2)], "2026-06-11", "2026-07-10")
    expect(p.version).toBe(NICHE_RUN_SNAPSHOT_VERSION)
    expect(p.dateFrom).toBe("2026-06-11")
    expect(p.dateTo).toBe("2026-07-10")
    expect(p.skus).toHaveLength(2)
  })

  it("round-trip через JSON → parse возвращает эквивалентный payload", () => {
    const p = buildNicheRunPayload([sku(1)], "2026-06-11", "2026-07-10")
    const roundTripped = parseNicheRunPayload(JSON.parse(JSON.stringify(p)))
    expect(roundTripped).not.toBeNull()
    expect(roundTripped!.skus[0].nmId).toBe(1)
    expect(roundTripped!.version).toBe(NICHE_RUN_SNAPSHOT_VERSION)
  })

  it("неверная version → null (fallback)", () => {
    const bad = { version: 999, dateFrom: "x", dateTo: "y", skus: [] }
    expect(parseNicheRunPayload(bad)).toBeNull()
  })

  it("не-объект / массив / без skus[] → null", () => {
    expect(parseNicheRunPayload({})).toBeNull()
    expect(parseNicheRunPayload(null)).toBeNull()
    expect(parseNicheRunPayload([])).toBeNull()
    expect(parseNicheRunPayload("str")).toBeNull()
    expect(parseNicheRunPayload({ version: NICHE_RUN_SNAPSHOT_VERSION, skus: "nope" })).toBeNull()
  })
})
