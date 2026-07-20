// tests/wb-fetch-rate-limit.test.ts
// 2026-05-12: проверка нового wbFetch helper из lib/wb-api.ts
// (заменил retryFetch — больше никаких слепых ретраев на 429).
// 2026-05-13 (Quick 260513-khv): per-bucket cooldown isolation.
// 2026-07-20 (quick-260720-mj0): fetchStocks удалён (Statistics API stocks
// отключён WB) — proxy к wbFetch переведён на fetchOrdersPerWarehouse
// (тоже один-запросный вызыватель wbFetch, endpoint "Orders API (per-warehouse)",
// bucket "statistics-orders").

import { describe, it, expect, vi, beforeEach } from "vitest"

// Замокать prisma — нужен appSetting для wb-cooldown (Backlog 999.1).
// По умолчанию findUnique = null (нет cooldown), upsert/delete no-op.
const appSettingFindUnique = vi.fn().mockResolvedValue(null)
const appSettingUpsert = vi.fn().mockResolvedValue({})
const appSettingDelete = vi.fn().mockResolvedValue({})
vi.mock("@/lib/prisma", () => ({
  prisma: {
    appSetting: {
      findUnique: appSettingFindUnique,
      upsert: appSettingUpsert,
      delete: appSettingDelete,
    },
  },
}))

// Quick 260512-jxh: wb-api теперь получает токены через getWbToken.
vi.mock("@/lib/wb-token", () => ({
  getWbToken: vi.fn(async (name: string) => {
    if (name === "WB_API_TOKEN") return "test-token"
    if (name === "WB_RETURNS_TOKEN") return "test-returns-token"
    if (name === "WB_CHAT_TOKEN") return "test-chat-token"
    throw new Error(`${name} не настроен`)
  }),
  invalidateWbTokenCache: vi.fn(),
  WB_TOKEN_NAMES: ["WB_API_TOKEN", "WB_RETURNS_TOKEN", "WB_CHAT_TOKEN"],
}))

// Используем fetchOrdersPerWarehouse как proxy к wbFetch (helper не экспортируется).
// Один wbFetch-вызов на 429 бросает WbRateLimitError, на 200 обрабатывает массив заказов.
describe("wbFetch — 429 → WbRateLimitError с X-Ratelimit-Retry (per-bucket)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
    vi.stubEnv("WB_API_TOKEN", "test-token")
    appSettingFindUnique.mockReset().mockResolvedValue(null)
    appSettingUpsert.mockReset().mockResolvedValue({})
    appSettingDelete.mockReset().mockResolvedValue({})
    // Сбрасываем module-level legacyMigrationDone flag в wb-cooldown.
    vi.resetModules()
  })

  it("429 + X-Ratelimit-Retry=6249 → WbRateLimitError.retryAfterSec=6249", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 429,
      headers: {
        get: (key: string) => (key === "X-Ratelimit-Retry" ? "6249" : null),
      },
    })

    const { fetchOrdersPerWarehouse, WbRateLimitError } = await import("@/lib/wb-api")

    let caught: unknown
    try {
      await fetchOrdersPerWarehouse([123])
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(WbRateLimitError)
    expect((caught as { retryAfterSec: number }).retryAfterSec).toBe(6249)
    expect((caught as { endpoint: string }).endpoint).toBe("Orders API (per-warehouse)")
  })

  it("429 без X-Ratelimit-Retry → retryAfterSec=60 (fallback)", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => null },
    })

    const { fetchOrdersPerWarehouse, WbRateLimitError } = await import("@/lib/wb-api")

    let caught: unknown
    try {
      await fetchOrdersPerWarehouse([123])
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(WbRateLimitError)
    expect((caught as { retryAfterSec: number }).retryAfterSec).toBe(60)
  })

  it("429 НЕ повторяет запрос (fail-fast, без retryFetch)", async () => {
    // Гарантия: один 429 = один fetch. Старый retryFetch делал 4 вызова.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => "100" },
    })
    vi.stubGlobal("fetch", fetchMock)

    const { fetchOrdersPerWarehouse } = await import("@/lib/wb-api")
    await expect(fetchOrdersPerWarehouse([123])).rejects.toThrow()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("200 OK → данные обрабатываются нормально (wbFetch transparent)", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => [
        { nmId: 100, warehouseName: "X", isCancel: false, date: "2026-01-01" },
        { nmId: 100, warehouseName: "X", isCancel: false, date: "2026-01-02" },
      ],
    })

    const { fetchOrdersPerWarehouse } = await import("@/lib/wb-api")
    const result = await fetchOrdersPerWarehouse([100])
    expect(result).toBeInstanceOf(Map)
    expect(result.has(100)).toBe(true)
  })

  // Backlog 999.1 + Quick 260513-khv: WB Cooldown Bus integration

  it("активный statistics-orders cooldown → throws WbRateLimitError БЕЗ обращения к WB", async () => {
    const future = new Date(Date.now() + 720 * 1000).toISOString()
    appSettingFindUnique.mockImplementation(({ where: { key } }: { where: { key: string } }) => {
      if (key === "wbCooldownUntil:statistics-orders") return Promise.resolve({ value: future })
      return Promise.resolve(null)
    })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const { fetchOrdersPerWarehouse, WbRateLimitError } = await import("@/lib/wb-api")
    let caught: unknown
    try {
      await fetchOrdersPerWarehouse([123])
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(WbRateLimitError)
    expect((caught as { endpoint: string }).endpoint).toContain("cooldown statistics-orders")
    expect((caught as { retryAfterSec: number }).retryAfterSec).toBeGreaterThan(700)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("429 от Orders API → пишет cooldown в bucket-key wbCooldownUntil:statistics-orders", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 429,
      headers: {
        get: (key: string) => (key === "X-Ratelimit-Retry" ? "1800" : null),
      },
    })
    appSettingFindUnique.mockResolvedValue(null)

    const { fetchOrdersPerWarehouse } = await import("@/lib/wb-api")
    await expect(fetchOrdersPerWarehouse([123])).rejects.toThrow()

    expect(appSettingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: "wbCooldownUntil:statistics-orders" } })
    )
  })

  it("cooldown на statistics-orders НЕ блокирует Prices endpoint (per-bucket isolation)", async () => {
    // statistics-orders заблокирован на 720s, prices свободен
    const future = new Date(Date.now() + 720 * 1000).toISOString()
    appSettingFindUnique.mockImplementation(({ where: { key } }: { where: { key: string } }) => {
      if (key === "wbCooldownUntil:statistics-orders") return Promise.resolve({ value: future })
      return Promise.resolve(null)
    })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ data: { listGoods: [] } }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const { fetchAllPrices } = await import("@/lib/wb-api")
    // Не должно throw — Prices не в cooldown.
    const result = await fetchAllPrices()
    expect(fetchMock).toHaveBeenCalled() // WB запрос реально пошёл
    expect(result).toBeInstanceOf(Map)
  })

  it("429 на Prices пишет ТОЛЬКО prices bucket (не statistics-orders)", async () => {
    appSettingFindUnique.mockResolvedValue(null)
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 429,
      headers: {
        get: (key: string) => (key === "X-Ratelimit-Retry" ? "1800" : null),
      },
    })

    const { fetchAllPrices } = await import("@/lib/wb-api")
    await expect(fetchAllPrices()).rejects.toThrow()

    // Upsert на prices bucket
    const upserts = appSettingUpsert.mock.calls
    const pricesUpsert = upserts.find(
      ([arg]) => arg?.where?.key === "wbCooldownUntil:prices"
    )
    const ordersUpsert = upserts.find(
      ([arg]) => arg?.where?.key === "wbCooldownUntil:statistics-orders"
    )
    expect(pricesUpsert).toBeDefined()
    expect(ordersUpsert).toBeUndefined()
  })
})
