import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ──────────────────────────────────────────────────────────────────
// RED stub — план 07-00 Wave 0
// ──────────────────────────────────────────────────────────────────
//
// Функции fetchAllPromotions / fetchPromotionDetails / fetchPromotionNomenclatures
// будут добавлены в lib/wb-api.ts в плане 07-03. До этого тесты падают с
// "Cannot find export" — корректное RED состояние Wave 0.
//
// Зафиксированный base URL (07-WAVE0-NOTES.md §3):
//   https://dp-calendar-api.wildberries.ru
//
// Rate limit WB Promotions Calendar API:
//   10 запросов / 6 секунд
//   Безопасная пауза между запросами: 600ms
//   При 429 → sleep(6000) и retry

describe("fetchAllPromotions — rate limit (mocked fetch)", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // WB_API_TOKEN нужен для getToken() — в тестах стабим любой непустой
    vi.stubEnv("WB_API_TOKEN", "test-token")
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("делает паузу ~600ms между pagination-запросами", async () => {
    const { fetchAllPromotions } = await import("@/lib/wb-api")

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            promotions: new Array(100).fill({
              id: 1,
              name: "promo",
              type: "regular",
              startDateTime: "2026-04-09T00:00:00Z",
              endDateTime: "2026-06-09T00:00:00Z",
            }),
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { promotions: [] } }),
      })
    vi.stubGlobal("fetch", fetchMock)

    const promise = fetchAllPromotions(
      new Date("2026-04-09T00:00:00Z"),
      new Date("2026-06-09T00:00:00Z")
    )
    await vi.advanceTimersByTimeAsync(800)
    await promise

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("обрабатывает 429 через sleep(6000) и retry", async () => {
    const { fetchAllPromotions } = await import("@/lib/wb-api")

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => "too many requests",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { promotions: [] } }),
      })
    vi.stubGlobal("fetch", fetchMock)

    const promise = fetchAllPromotions(
      new Date("2026-04-09T00:00:00Z"),
      new Date("2026-06-09T00:00:00Z")
    )
    await vi.advanceTimersByTimeAsync(6200)
    await promise

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("использует правильный базовый URL dp-calendar-api.wildberries.ru", async () => {
    const { fetchAllPromotions } = await import("@/lib/wb-api")

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { promotions: [] } }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const promise = fetchAllPromotions(
      new Date("2026-04-09T00:00:00Z"),
      new Date("2026-06-09T00:00:00Z")
    )
    await vi.advanceTimersByTimeAsync(100)
    await promise

    const firstCall = fetchMock.mock.calls[0]?.[0] as string
    expect(firstCall).toContain("dp-calendar-api.wildberries.ru")
    expect(firstCall).toContain("/api/v1/calendar/promotions")
    expect(firstCall).toContain("allPromo=true")
  })
})

describe("fetchPromotionDetails — батчи по 10 ID", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv("WB_API_TOKEN", "test-token")
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("разбивает 25 promotionIDs на 3 батча (10+10+5)", async () => {
    const { fetchPromotionDetails } = await import("@/lib/wb-api")

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { promotions: [] } }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const ids = Array.from({ length: 25 }, (_, i) => i + 1)
    const promise = fetchPromotionDetails(ids)
    await vi.advanceTimersByTimeAsync(3000)
    await promise

    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
