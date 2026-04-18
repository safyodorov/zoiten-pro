// tests/support-stats-page.test.ts
// Phase 13-02 — unit тесты parseStatsSearchParams + smoke тесты Plan 13-01 imports.
// Примечание: тесты покрывают pure helper из search-params.ts (вынесенный из page.tsx
// потому что Next.js 15 запрещает произвольные экспорты из Page).

import { describe, it, expect } from "vitest"
import { parseStatsSearchParams } from "@/app/(dashboard)/support/stats/search-params"

describe("parseStatsSearchParams", () => {
  it("happy path — все параметры корректны", () => {
    const r = parseStatsSearchParams({
      tab: "managers",
      period: "custom",
      dateFrom: "2026-04-01",
      dateTo: "2026-04-30",
      nmId: "12345",
      userId: "user-1",
    })
    expect(r.tab).toBe("managers")
    expect(r.period).toBe("custom")
    expect(r.dateFrom).toBe("2026-04-01")
    expect(r.dateTo).toBe("2026-04-30")
    expect(r.nmId).toBe(12345)
    expect(r.userId).toBe("user-1")
  })

  it("fallback: tab default = 'products', period default = '30d'", () => {
    const r = parseStatsSearchParams({})
    expect(r.tab).toBe("products")
    expect(r.period).toBe("30d")
  })

  it("невалидный tab → fallback на products", () => {
    const r = parseStatsSearchParams({ tab: "invalid-tab" })
    expect(r.tab).toBe("products")
  })

  it("невалидный period → fallback на 30d", () => {
    const r = parseStatsSearchParams({ period: "10y" })
    expect(r.period).toBe("30d")
  })

  it("nmId coerce из строки в int", () => {
    const r = parseStatsSearchParams({ nmId: "999" })
    expect(r.nmId).toBe(999)
  })

  it("array values берёт первый (Next.js searchParams behaviour)", () => {
    const r = parseStatsSearchParams({ tab: ["managers", "products"] })
    expect(r.tab).toBe("managers")
  })

  it("отрицательный nmId → undefined (Zod int positive)", () => {
    const r = parseStatsSearchParams({ nmId: "-5" })
    expect(r.nmId).toBeUndefined()
  })

  it("пропущенные dateFrom/dateTo при period=custom → сохраняет период=custom без дат", () => {
    const r = parseStatsSearchParams({ period: "custom" })
    expect(r.period).toBe("custom")
    expect(r.dateFrom).toBeUndefined()
    expect(r.dateTo).toBeUndefined()
  })
})

describe("Plan 13-01 integration smoke", () => {
  it("lib/support-stats exports expected API", async () => {
    const mod = await import("@/lib/support-stats")
    expect(typeof mod.listProductsWithStats).toBe("function")
    expect(typeof mod.listManagersWithStats).toBe("function")
    expect(typeof mod.getTopReturnReasons).toBe("function")
    expect(typeof mod.getAutoReplyCount).toBe("function")
  })

  it("lib/date-periods exports getPeriod + PERIOD_PRESETS", async () => {
    const mod = await import("@/lib/date-periods")
    expect(typeof mod.getPeriod).toBe("function")
    expect(mod.PERIOD_PRESETS).toEqual(["7d", "30d", "quarter", "custom"])
  })
})
