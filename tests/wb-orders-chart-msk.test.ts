import { describe, it, expect } from "vitest"
import { getMskTodayDate, getMskYesterdayDate } from "@/lib/wb-orders-chart"

describe("MSK date helpers — midnight boundary", () => {
  it("23:30 MSK still тот же день (UTC = 20:30 same day)", () => {
    // 2026-05-15T20:30Z = 23:30 MSK still 2026-05-15
    const now = new Date("2026-05-15T20:30:00Z")
    expect(getMskTodayDate(now).toISOString()).toBe("2026-05-15T00:00:00.000Z")
    expect(getMskYesterdayDate(now).toISOString()).toBe("2026-05-14T00:00:00.000Z")
  })

  it("00:30 MSK уже следующий день (UTC = 21:30 previous day)", () => {
    // 2026-05-15T21:30Z = 00:30 MSK next day = 2026-05-16
    const now = new Date("2026-05-15T21:30:00Z")
    expect(getMskTodayDate(now).toISOString()).toBe("2026-05-16T00:00:00.000Z")
    expect(getMskYesterdayDate(now).toISOString()).toBe("2026-05-15T00:00:00.000Z")
  })

  it("ровно полночь MSK (UTC = 21:00) — flip happened", () => {
    const now = new Date("2026-05-15T21:00:00Z")
    expect(getMskTodayDate(now).toISOString()).toBe("2026-05-16T00:00:00.000Z")
  })

  it("ровно перед полночью MSK (UTC = 20:59:59) — ещё прежний день", () => {
    const now = new Date("2026-05-15T20:59:59Z")
    expect(getMskTodayDate(now).toISOString()).toBe("2026-05-15T00:00:00.000Z")
  })
})
