// tests/wb-adv-api.test.ts
// Phase 19 Plan 19-03: WB Advert API client tests.
// 7 tests covering /promotion/count, /fullstats, /balance + 429 + cooldown bus.

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/wb-token", () => ({
  getWbToken: vi.fn(async () => "test-token"),
}))
vi.mock("@/lib/wb-cooldown", () => ({
  getWbCooldownSecondsRemaining: vi.fn(async () => 0),
  setWbCooldownUntil: vi.fn(async () => {}),
}))

const fetchMock = vi.fn()
vi.stubGlobal("fetch", fetchMock)

import {
  fetchPromotionCount,
  fetchFullStats,
  fetchBalance,
} from "@/lib/wb-adv-api"
import { WbRateLimitError } from "@/lib/wb-api"
import { setWbCooldownUntil, getWbCooldownSecondsRemaining } from "@/lib/wb-cooldown"

beforeEach(() => {
  vi.useRealTimers()
  fetchMock.mockReset()
  vi.mocked(setWbCooldownUntil).mockClear()
  vi.mocked(getWbCooldownSecondsRemaining).mockReset()
  vi.mocked(getWbCooldownSecondsRemaining).mockResolvedValue(0)
})

describe("WB Advert API client", () => {
  // Test 1
  it("fetchPromotionCount parses /promotion/count two-level structure", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      adverts: [
        { type: 9, status: 9, count: 2, advert_list: [
          { advertId: 1, changeTime: "2026-05-19T00:00:00+03:00" },
          { advertId: 2, changeTime: "2026-05-19T00:00:00+03:00" },
        ]},
      ],
    })))
    const res = await fetchPromotionCount()
    expect(res).toHaveLength(2)
    expect(res[0]).toMatchObject({ advertId: 1, type: 9, status: 9 })
  })

  // Test 2 — 429 + WB-specific x-ratelimit-retry header (preferred over Retry-After)
  it("on 429 reads x-ratelimit-retry and sets cooldown", async () => {
    fetchMock.mockResolvedValueOnce(new Response("rate-limited", {
      status: 429,
      headers: { "x-ratelimit-retry": "60" },
    }))
    await expect(fetchPromotionCount()).rejects.toBeInstanceOf(WbRateLimitError)
    expect(setWbCooldownUntil).toHaveBeenCalledWith("advert", 60)
  })

  // Test 3 — fullstats GET with query params, batching ≤100
  it("fetchFullStats sends GET batches of 100 with query params + sleep", async () => {
    vi.useFakeTimers()
    const advertIds = Array.from({ length: 250 }, (_, i) => i + 1)
    // Factory: каждый call возвращает СВЕЖИЙ Response — body нельзя читать дважды
    fetchMock.mockImplementation(async () => new Response(JSON.stringify([])))
    const promise = fetchFullStats(advertIds, { beginDate: "2026-05-12", endDate: "2026-05-19" })
    await vi.runAllTimersAsync()
    await promise
    expect(fetchMock).toHaveBeenCalledTimes(3) // 100, 100, 50
    // Должен быть GET (без method или method: "GET")
    const firstInit = fetchMock.mock.calls[0][1] as RequestInit | undefined
    expect(firstInit?.method ?? "GET").toBe("GET")
    // URL должен содержать query params
    const firstUrl = fetchMock.mock.calls[0][0] as string
    expect(firstUrl).toContain("/adv/v3/fullstats")
    expect(firstUrl).toContain("beginDate=2026-05-12")
    expect(firstUrl).toContain("endDate=2026-05-19")
    expect(firstUrl).toContain("ids=1%2C2") // URL-encoded comma
    // Последний батч — 50 ids
    const lastUrl = fetchMock.mock.calls[2][0] as string
    const lastIds = new URL(lastUrl).searchParams.get("ids")!.split(",")
    expect(lastIds).toHaveLength(50)
    vi.useRealTimers()
  })

  // Test 4 — null response handling (W0: WB returns null when no data)
  it("fetchFullStats handles null response (no data for period)", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(null)))
    const res = await fetchFullStats([1], { beginDate: "2026-05-12", endDate: "2026-05-19" })
    expect(res).toEqual([])
  })

  // Test 4b — fullstats with real nested data (4-level: campaign → day → app → nms)
  it("fetchFullStats flattens 4-level nesting", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([
      {
        advertId: 100,
        days: [
          {
            date: "2026-05-15T00:00:00Z",
            apps: [
              {
                appType: 32,
                nms: [
                  { nmId: 999, name: "Test product", views: 100, clicks: 5,
                    sum: 75.5, atbs: 2, orders: 1, shks: 1, sum_price: 1500,
                    ctr: 5.0, cpc: 15.1, cr: 20.0, canceled: 0 },
                ],
              },
            ],
          },
        ],
      },
    ])))
    const res = await fetchFullStats([100], { beginDate: "2026-05-15", endDate: "2026-05-15" })
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({
      advertId: 100, date: "2026-05-15", nmId: 999, name: "Test product",
      appType: 32, views: 100, clicks: 5, sum: 75.5, sumPrice: 1500, canceled: 0,
    })
  })

  // Test 5 — balance shape (W0: no bonus, has currency)
  it("fetchBalance parses /balance response without bonus", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      balance: 0, net: 2561471, currency: "RUB",
    })))
    const res = await fetchBalance()
    expect(res).toEqual({ balance: 0, net: 2561471, currency: "RUB" })
  })

  // Test 6 — cooldown bypass
  it("if cooldown active throws WbRateLimitError without fetch call", async () => {
    vi.mocked(getWbCooldownSecondsRemaining).mockReset()
    vi.mocked(getWbCooldownSecondsRemaining).mockResolvedValueOnce(300)
    vi.mocked(getWbCooldownSecondsRemaining).mockResolvedValue(0)
    await expect(fetchPromotionCount()).rejects.toBeInstanceOf(WbRateLimitError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
