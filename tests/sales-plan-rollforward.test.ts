import { describe, it, expect } from "vitest"
import { rollForwardAcceptedArrivals } from "@/lib/sales-plan/virtual-purchases"

// ──────────────────────────────────────────────────────────────────
// SP-17: Инвариант «не прошлым числом» для авто-ACCEPTED виртуальных закупок.
// rollForwardAcceptedArrivals — чистый хелпер сдвига просроченных авто-ACCEPTED.
// ──────────────────────────────────────────────────────────────────

describe("rollForwardAcceptedArrivals — инвариант «не прошлым числом» для ACCEPTED", () => {
  const TODAY = "2026-07-01"
  const LEAD_TIME = 45

  it("Test 1: авто-ACCEPTED с orderDate < today — сдвигается (инвариант «не прошлым числом»)", () => {
    const items = [
      {
        id: "vp-1",
        status: "ACCEPTED" as const,
        source: "auto",
        orderDate: "2026-06-01",        // < today
        expectedArrivalDate: "2026-07-16", // было старым
        qty: 100,
      },
    ]

    const result = rollForwardAcceptedArrivals(items, TODAY, LEAD_TIME)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("vp-1")
    // Инвариант: orderDate >= today
    expect(result[0].orderDate).toBe(TODAY)
    // Инвариант: expectedArrivalDate = today + leadTimeDays = 2026-07-01 + 45 = 2026-08-15
    expect(result[0].expectedArrivalDate).toBe("2026-08-15")
    expect(result[0].qty).toBe(100)
    expect(result[0].shifted).toBe(true)
  })

  it("Test 2: авто-ACCEPTED с orderDate >= today — НЕ сдвигается (даты без изменений)", () => {
    const items = [
      {
        id: "vp-2",
        status: "ACCEPTED" as const,
        source: "auto",
        orderDate: "2026-07-10",          // >= today, не просрочена
        expectedArrivalDate: "2026-08-24",
        qty: 50,
      },
    ]

    const result = rollForwardAcceptedArrivals(items, TODAY, LEAD_TIME)

    expect(result).toHaveLength(1)
    expect(result[0].orderDate).toBe("2026-07-10")
    expect(result[0].expectedArrivalDate).toBe("2026-08-24")
    expect(result[0].shifted).toBe(false)
  })

  it("Test 3: source=manual просроченная — НЕ сдвигается (пользователь управляет датой)", () => {
    const items = [
      {
        id: "vp-3",
        status: "ACCEPTED" as const,
        source: "manual",
        orderDate: "2026-05-01",          // < today, но manual
        expectedArrivalDate: "2026-06-15",
        qty: 200,
      },
    ]

    const result = rollForwardAcceptedArrivals(items, TODAY, LEAD_TIME)

    expect(result).toHaveLength(1)
    // manual не трогается — даты без изменений
    expect(result[0].orderDate).toBe("2026-05-01")
    expect(result[0].expectedArrivalDate).toBe("2026-06-15")
    expect(result[0].shifted).toBe(false)
  })

  it("Test 4: возвращает флаг shifted=true для сдвинутых и shifted=false для неизменённых", () => {
    const items = [
      {
        id: "vp-overdue",
        status: "ACCEPTED" as const,
        source: "auto",
        orderDate: "2026-06-01",    // просрочена → shifted=true
        expectedArrivalDate: "2026-07-16",
        qty: 80,
      },
      {
        id: "vp-future",
        status: "ACCEPTED" as const,
        source: "auto",
        orderDate: "2026-07-15",   // не просрочена → shifted=false
        expectedArrivalDate: "2026-08-29",
        qty: 60,
      },
      {
        id: "vp-manual-old",
        status: "ACCEPTED" as const,
        source: "manual",
        orderDate: "2026-04-01",   // manual, просрочена → НЕ трогается, shifted=false
        expectedArrivalDate: "2026-05-16",
        qty: 40,
      },
    ]

    const result = rollForwardAcceptedArrivals(items, TODAY, LEAD_TIME)

    expect(result).toHaveLength(3)

    const overdueResult = result.find((r) => r.id === "vp-overdue")!
    expect(overdueResult.shifted).toBe(true)
    expect(overdueResult.orderDate).toBe(TODAY)
    expect(overdueResult.expectedArrivalDate).toBe("2026-08-15")

    const futureResult = result.find((r) => r.id === "vp-future")!
    expect(futureResult.shifted).toBe(false)
    expect(futureResult.orderDate).toBe("2026-07-15")

    const manualResult = result.find((r) => r.id === "vp-manual-old")!
    expect(manualResult.shifted).toBe(false)
    expect(manualResult.orderDate).toBe("2026-04-01")
  })
})
