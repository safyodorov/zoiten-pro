import { describe, it, expect } from "vitest"

describe("support-stats-cron (stub — заполняется в Plan 13-03)", () => {
  it.skip("upsert ManagerSupportStats for each SUPPORT user — TODO Plan 13-03", () => {})
  it.skip("period = startOfMonthMsk(today) — TODO Plan 13-03", () => {})
  it.skip("idempotent — second run doesn't duplicate — TODO Plan 13-03", () => {})
  it.skip("CRON_SECRET required — TODO Plan 13-03", () => {})

  it("smoke: pure helper import from Plan 13-01", async () => {
    const { computeManagerStatsForPeriod } = await import("@/lib/support-stats")
    expect(typeof computeManagerStatsForPeriod).toBe("function")
  })
})
