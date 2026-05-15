// 2026-05-15 (quick 260515-o4o): Tests для shouldFireCron — exact HH:MM match + lastRun guard.
import { describe, it, expect } from "vitest"
import { shouldFireCron } from "@/lib/wb-cron-schedule"

describe("shouldFireCron", () => {
  it("returns true when currentHHMM matches storedTime AND not yet run today", () => {
    expect(
      shouldFireCron({
        currentHHMM: "05:10",
        storedTime: "05:10",
        lastRunDate: "2026-05-14",
        today: "2026-05-15",
      }),
    ).toBe(true)
  })

  it("returns false when already run today (idempotent guard)", () => {
    expect(
      shouldFireCron({
        currentHHMM: "05:10",
        storedTime: "05:10",
        lastRunDate: "2026-05-15",
        today: "2026-05-15",
      }),
    ).toBe(false)
  })

  it("returns false when minute differs (exact match only)", () => {
    expect(
      shouldFireCron({
        currentHHMM: "05:11",
        storedTime: "05:10",
        lastRunDate: "2026-05-14",
        today: "2026-05-15",
      }),
    ).toBe(false)
  })

  it("returns false even within next 5-min window if not exact match", () => {
    expect(
      shouldFireCron({
        currentHHMM: "05:15",
        storedTime: "05:10",
        lastRunDate: "2026-05-14",
        today: "2026-05-15",
      }),
    ).toBe(false)
  })

  it("returns true when lastRunDate is null (never run)", () => {
    expect(
      shouldFireCron({
        currentHHMM: "05:00",
        storedTime: "05:00",
        lastRunDate: null,
        today: "2026-05-15",
      }),
    ).toBe(true)
  })
})
