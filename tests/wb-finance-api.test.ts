// tests/wb-finance-api.test.ts
// Phase 24 Plan 24-03: WB Finance API client tests (mocked HTTP).
// Covers: fetchAccountBalance happy path, 429 → cooldown 'finance', 402 explicit,
// fetchWeeklyForPayTail (stat token, flag=0, post-filter by saleDt — M1/B4).

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/wb-token", () => ({
  getWbToken: vi.fn(async (name: string) => `test-token-${name}`),
}))
vi.mock("@/lib/wb-cooldown", () => ({
  getWbCooldownSecondsRemaining: vi.fn(async () => 0),
  setWbCooldownUntil: vi.fn(async () => {}),
}))

const fetchMock = vi.fn()
vi.stubGlobal("fetch", fetchMock)

import { fetchAccountBalance, fetchWeeklyForPayTail } from "@/lib/wb-finance-api"
import { WbRateLimitError } from "@/lib/wb-api"
import { getWbToken } from "@/lib/wb-token"
import {
  getWbCooldownSecondsRemaining,
  setWbCooldownUntil,
} from "@/lib/wb-cooldown"

beforeEach(() => {
  fetchMock.mockReset()
  vi.mocked(getWbToken).mockClear()
  vi.mocked(setWbCooldownUntil).mockClear()
  vi.mocked(getWbCooldownSecondsRemaining).mockReset()
  vi.mocked(getWbCooldownSecondsRemaining).mockResolvedValue(0)
})

describe("WB Finance API client", () => {
  // Test 1 — happy path
  it("fetchAccountBalance parses {currency, current, for_withdraw} as numbers", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ currency: "RUB", current: 10196.21, for_withdraw: 6395.8 })
      )
    )
    const res = await fetchAccountBalance()
    expect(res).toEqual({ currency: "RUB", current: 10196.21, forWithdraw: 6395.8 })
    expect(getWbToken).toHaveBeenCalledWith("WB_FINANCE_TOKEN")
  })

  // Test 2 — 429 → WbRateLimitError + cooldown bucket 'finance'
  it("on 429 sets cooldown 'finance' and throws WbRateLimitError", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("rate-limited", {
        status: 429,
        headers: { "Retry-After": "60" },
      })
    )
    await expect(fetchAccountBalance()).rejects.toBeInstanceOf(WbRateLimitError)
    expect(setWbCooldownUntil).toHaveBeenCalledWith("finance", 60)
  })

  // Test 3 — 402 Payment Required → explicit error, no cooldown write
  it("on 402 throws explicit error and does NOT touch cooldown", async () => {
    fetchMock.mockResolvedValueOnce(new Response("payment required", { status: 402 }))
    await expect(fetchAccountBalance()).rejects.toThrow(/402/)
    expect(setWbCooldownUntil).not.toHaveBeenCalled()
  })

  // Test 4 — fetchWeeklyForPayTail: STAT token (not finance!), flag=0, post-filter by saleDt (M1)
  it("fetchWeeklyForPayTail sums forPay in [monday, snapshot] using stat token, filters out-of-range saleDt", async () => {
    const monday = new Date("2026-06-29T00:00:00Z")
    const snapshot = new Date("2026-07-02T23:59:59Z")
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { forPay: 100, saleDt: "2026-06-30T10:00:00Z" },
          { forPay: 250.5, saleDt: "2026-07-01T12:00:00Z" },
          { forPay: 999, saleDt: "2026-06-20T09:00:00Z" }, // до monday — отфильтровать (M1)
        ])
      )
    )
    const sum = await fetchWeeklyForPayTail(monday, snapshot)
    expect(sum).toBe(350.5)
    expect(getWbToken).toHaveBeenCalledWith("WB_API_TOKEN")
    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain("flag=0")
  })
})
