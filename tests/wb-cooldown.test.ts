// tests/wb-cooldown.test.ts
// Backlog 999.1: WB Cooldown Bus — AppSetting('wbCooldownUntil:<bucket>').
// Quick 260513-khv: Per-bucket isolation + lazy legacy key migration.

import { describe, it, expect, vi, beforeEach } from "vitest"

const findUniqueMock = vi.fn()
const upsertMock = vi.fn()
const deleteMock = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appSetting: {
      findUnique: findUniqueMock,
      upsert: upsertMock,
      delete: deleteMock,
    },
  },
}))

beforeEach(() => {
  findUniqueMock.mockReset()
  upsertMock.mockReset()
  deleteMock.mockReset()
  // Default: legacy key returns null → migration is a no-op.
  findUniqueMock.mockResolvedValue(null)
  upsertMock.mockResolvedValue({})
  deleteMock.mockResolvedValue({})
  // Reset module-scoped legacyMigrationDone flag between tests via fresh import.
  vi.resetModules()
})

describe("WB_COOLDOWN_BUCKETS / WbCooldownBucket", () => {
  it("экспортирует 9 bucket-слагов", async () => {
    const { WB_COOLDOWN_BUCKETS } = await import("@/lib/wb-cooldown")
    expect(WB_COOLDOWN_BUCKETS).toEqual([
      "statistics-stocks",
      "statistics-orders",
      "statistics-sales",
      "prices",
      "tariffs",
      "analytics",
      "content",
      "feedbacks",
      "questions",
    ])
  })
})

describe("getWbCooldownUntil(bucket)", () => {
  it("возвращает null если нет записи (key=wbCooldownUntil:prices)", async () => {
    findUniqueMock.mockImplementation(() => Promise.resolve(null))
    const { getWbCooldownUntil } = await import("@/lib/wb-cooldown")
    expect(await getWbCooldownUntil("prices")).toBeNull()
    expect(findUniqueMock).toHaveBeenCalledWith({ where: { key: "wbCooldownUntil:prices" } })
  })

  it("возвращает Date если cooldown в будущем (key=wbCooldownUntil:prices)", async () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    findUniqueMock.mockImplementation(({ where: { key } }: { where: { key: string } }) => {
      if (key === "wbCooldownUntil:prices") return Promise.resolve({ value: future })
      return Promise.resolve(null)
    })
    const { getWbCooldownUntil } = await import("@/lib/wb-cooldown")
    const result = await getWbCooldownUntil("prices")
    expect(result).toBeInstanceOf(Date)
    expect(result!.getTime()).toBeGreaterThan(Date.now())
  })

  it("истёкший lock удаляется по bucket-key и возвращается null", async () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    findUniqueMock.mockImplementation(({ where: { key } }: { where: { key: string } }) => {
      if (key === "wbCooldownUntil:prices") return Promise.resolve({ value: past })
      return Promise.resolve(null)
    })
    const { getWbCooldownUntil } = await import("@/lib/wb-cooldown")
    expect(await getWbCooldownUntil("prices")).toBeNull()
    expect(deleteMock).toHaveBeenCalledWith({ where: { key: "wbCooldownUntil:prices" } })
  })

  it("невалидный value возвращает null без crash", async () => {
    findUniqueMock.mockImplementation(({ where: { key } }: { where: { key: string } }) => {
      if (key === "wbCooldownUntil:prices") return Promise.resolve({ value: "not-a-date" })
      return Promise.resolve(null)
    })
    const { getWbCooldownUntil } = await import("@/lib/wb-cooldown")
    expect(await getWbCooldownUntil("prices")).toBeNull()
  })
})

describe("setWbCooldownUntil(bucket, retryAfterSec)", () => {
  // Buffer formula preserved per-bucket:
  // unlockAt = now + max(retryAfterSec, CRON_INTERVAL_SEC=900) + BUFFER_SEC=120
  // retry=720  → max(720,900)+120  = 1020s
  // retry=60   → max(60,900)+120   = 1020s (interval доминирует)
  // retry=3600 → max(3600,900)+120 = 3720s

  it("записывает новый cooldown по bucket-key (buffer formula, retry=720)", async () => {
    findUniqueMock.mockImplementation(() => Promise.resolve(null))
    const { setWbCooldownUntil } = await import("@/lib/wb-cooldown")
    const before = Date.now()
    const unlockAt = await setWbCooldownUntil("prices", 720)
    const after = Date.now()

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: "wbCooldownUntil:prices" } })
    )
    expect(unlockAt.getTime()).toBeGreaterThanOrEqual(before + 1020 * 1000 - 5)
    expect(unlockAt.getTime()).toBeLessThanOrEqual(after + 1020 * 1000 + 5)
  })

  it("retryAfterSec ниже cron interval — buffer interval доминирует (retry=60)", async () => {
    findUniqueMock.mockImplementation(() => Promise.resolve(null))
    const { setWbCooldownUntil } = await import("@/lib/wb-cooldown")
    const before = Date.now()
    const unlockAt = await setWbCooldownUntil("prices", 60)
    const after = Date.now()

    expect(upsertMock).toHaveBeenCalled()
    expect(unlockAt.getTime()).toBeGreaterThanOrEqual(before + 1020 * 1000 - 5)
    expect(unlockAt.getTime()).toBeLessThanOrEqual(after + 1020 * 1000 + 5)
  })

  it("retry=3600 → 3720s (retry+buffer доминирует над interval)", async () => {
    findUniqueMock.mockImplementation(() => Promise.resolve(null))
    const { setWbCooldownUntil } = await import("@/lib/wb-cooldown")
    const before = Date.now()
    const unlockAt = await setWbCooldownUntil("prices", 3600)
    const after = Date.now()

    expect(upsertMock).toHaveBeenCalled()
    expect(unlockAt.getTime()).toBeGreaterThanOrEqual(before + 3720 * 1000 - 5)
    expect(unlockAt.getTime()).toBeLessThanOrEqual(after + 3720 * 1000 + 5)
  })

  it("retryAfterSec=0 или отрицательный — no-op (не пишет)", async () => {
    findUniqueMock.mockImplementation(() => Promise.resolve(null))
    const { setWbCooldownUntil } = await import("@/lib/wb-cooldown")
    await setWbCooldownUntil("prices", 0)
    expect(upsertMock).not.toHaveBeenCalled()

    await setWbCooldownUntil("prices", -100)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it("идемпотентный max() — короткий retry игнорируется если существующий bucket lock дольше", async () => {
    const longExisting = new Date(Date.now() + 3600 * 1000).toISOString()
    findUniqueMock.mockImplementation(({ where: { key } }: { where: { key: string } }) => {
      if (key === "wbCooldownUntil:prices") return Promise.resolve({ value: longExisting })
      return Promise.resolve(null)
    })
    const { setWbCooldownUntil } = await import("@/lib/wb-cooldown")

    // proposed = now + 1020s; existing = now + 3600s → existing wins
    const result = await setWbCooldownUntil("prices", 60)
    expect(upsertMock).not.toHaveBeenCalled()
    expect(result.toISOString()).toBe(longExisting)
  })

  it("getWbCooldownSecondsRemaining(bucket): 0 если нет lock, положительное число если есть", async () => {
    findUniqueMock.mockImplementation(() => Promise.resolve(null))
    const mod1 = await import("@/lib/wb-cooldown")
    expect(await mod1.getWbCooldownSecondsRemaining("prices")).toBe(0)

    vi.resetModules()
    const future = new Date(Date.now() + 720 * 1000).toISOString()
    findUniqueMock.mockImplementation(({ where: { key } }: { where: { key: string } }) => {
      if (key === "wbCooldownUntil:prices") return Promise.resolve({ value: future })
      return Promise.resolve(null)
    })
    const mod2 = await import("@/lib/wb-cooldown")
    const sec = await mod2.getWbCooldownSecondsRemaining("prices")
    expect(sec).toBeGreaterThan(715)
    expect(sec).toBeLessThanOrEqual(720)
  })
})

describe("Per-bucket isolation", () => {
  it("setWbCooldownUntil('prices', ...) не пишет в wbCooldownUntil:statistics-stocks", async () => {
    findUniqueMock.mockImplementation(() => Promise.resolve(null))
    const { setWbCooldownUntil, getWbCooldownSecondsRemaining } = await import("@/lib/wb-cooldown")
    await setWbCooldownUntil("prices", 60)

    // Upsert pages только wbCooldownUntil:prices, не statistics-stocks
    const stocksUpsert = upsertMock.mock.calls.find(
      ([arg]) => arg?.where?.key === "wbCooldownUntil:statistics-stocks"
    )
    expect(stocksUpsert).toBeUndefined()

    // Statistics-stocks остаётся свободным
    expect(await getWbCooldownSecondsRemaining("statistics-stocks")).toBe(0)
  })

  it("независимый max() на разные buckets — установка prices не задевает statistics-stocks", async () => {
    // statistics-stocks уже заблокирован на 3720s
    const stocksLock = new Date(Date.now() + 3720 * 1000).toISOString()
    findUniqueMock.mockImplementation(({ where: { key } }: { where: { key: string } }) => {
      if (key === "wbCooldownUntil:statistics-stocks") return Promise.resolve({ value: stocksLock })
      return Promise.resolve(null)
    })
    const { setWbCooldownUntil } = await import("@/lib/wb-cooldown")
    // Устанавливаем prices=60s → max(60,900)+120=1020s
    await setWbCooldownUntil("prices", 60)

    // Upsert ушёл только в prices, не в statistics-stocks
    const pricesUpsert = upsertMock.mock.calls.find(
      ([arg]) => arg?.where?.key === "wbCooldownUntil:prices"
    )
    const stocksUpsert = upsertMock.mock.calls.find(
      ([arg]) => arg?.where?.key === "wbCooldownUntil:statistics-stocks"
    )
    expect(pricesUpsert).toBeDefined()
    expect(stocksUpsert).toBeUndefined()
  })
})

describe("Lazy legacy key migration", () => {
  it("FUTURE legacy value: COPY в 9 bucket-keys + DELETE legacy", async () => {
    const future = new Date(Date.now() + 1800 * 1000).toISOString()
    findUniqueMock.mockImplementation(({ where: { key } }: { where: { key: string } }) => {
      if (key === "wbCooldownUntil") return Promise.resolve({ value: future })
      return Promise.resolve(null)
    })
    const { setWbCooldownUntil, WB_COOLDOWN_BUCKETS } = await import("@/lib/wb-cooldown")
    await setWbCooldownUntil("prices", 60)

    // Все 9 bucket-keys получили COPY of future value через upsert
    for (const bucket of WB_COOLDOWN_BUCKETS) {
      const bucketUpsert = upsertMock.mock.calls.find(
        ([arg]) =>
          arg?.where?.key === `wbCooldownUntil:${bucket}` &&
          arg?.create?.value === future
      )
      expect(bucketUpsert, `expected upsert on wbCooldownUntil:${bucket} with copy of future`).toBeDefined()
    }
    // Legacy key DELETED
    expect(deleteMock).toHaveBeenCalledWith({ where: { key: "wbCooldownUntil" } })
  })

  it("PAST legacy value: просто DELETE (без копирования)", async () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    findUniqueMock.mockImplementation(({ where: { key } }: { where: { key: string } }) => {
      if (key === "wbCooldownUntil") return Promise.resolve({ value: past })
      return Promise.resolve(null)
    })
    const { setWbCooldownUntil, WB_COOLDOWN_BUCKETS } = await import("@/lib/wb-cooldown")
    await setWbCooldownUntil("prices", 60)

    // Legacy key DELETED
    expect(deleteMock).toHaveBeenCalledWith({ where: { key: "wbCooldownUntil" } })

    // Бакеты получили только тот, который ставит сам setWbCooldownUntil('prices',60) — никаких legacy copy.
    for (const bucket of WB_COOLDOWN_BUCKETS) {
      if (bucket === "prices") continue
      const bucketUpsert = upsertMock.mock.calls.find(
        ([arg]) => arg?.where?.key === `wbCooldownUntil:${bucket}`
      )
      expect(bucketUpsert, `bucket ${bucket} НЕ должен получить upsert`).toBeUndefined()
    }
  })

  it("идемпотентно: второй вызов setWbCooldownUntil не re-мигрирует", async () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    let legacyCalled = false
    findUniqueMock.mockImplementation(({ where: { key } }: { where: { key: string } }) => {
      if (key === "wbCooldownUntil") {
        if (legacyCalled) return Promise.resolve(null)
        legacyCalled = true
        return Promise.resolve({ value: past })
      }
      return Promise.resolve(null)
    })
    const { setWbCooldownUntil } = await import("@/lib/wb-cooldown")
    await setWbCooldownUntil("prices", 60)
    await setWbCooldownUntil("tariffs", 60)

    // delete на legacy ВЫЗЫВАЛАСЬ ровно один раз
    const legacyDeletes = deleteMock.mock.calls.filter(
      ([arg]) => arg?.where?.key === "wbCooldownUntil"
    )
    expect(legacyDeletes).toHaveLength(1)
  })
})

describe("resolveBucketFromUrl", () => {
  it.each([
    ["https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=2020", "statistics-stocks"],
    ["https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom=2020", "statistics-orders"],
    ["https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=2020", "statistics-sales"],
    ["https://discounts-prices-api.wildberries.ru/api/v2/list/goods/filter?limit=10", "prices"],
    ["https://common-api.wildberries.ru/api/v1/tariffs/commission?locale=ru", "tariffs"],
    ["https://seller-analytics-api.wildberries.ru/api/v2/nm-report/downloads", "analytics"],
    ["https://content-api.wildberries.ru/content/v2/get/cards/list", "content"],
    ["https://feedbacks-api.wildberries.ru/api/v1/feedbacks?take=10", "feedbacks"],
    ["https://feedbacks-api.wildberries.ru/api/v1/questions?take=10", "questions"],
  ])("url=%s → %s", async (url, expected) => {
    const { resolveBucketFromUrl } = await import("@/lib/wb-cooldown")
    expect(resolveBucketFromUrl(url)).toBe(expected)
  })

  it("неизвестный host → null (safe fallback)", async () => {
    const { resolveBucketFromUrl } = await import("@/lib/wb-cooldown")
    expect(resolveBucketFromUrl("https://returns-api.wildberries.ru/api/v1/claims")).toBeNull()
    expect(resolveBucketFromUrl("https://buyer-chat-api.wildberries.ru/api/v1/seller/chats")).toBeNull()
    expect(resolveBucketFromUrl("https://dp-calendar-api.wildberries.ru/api/v1/calendar/promotions")).toBeNull()
    expect(resolveBucketFromUrl("https://example.com/x")).toBeNull()
  })
})

describe("constants", () => {
  it("экспортирует CRON_INTERVAL_SEC=900 и BUFFER_SEC=120", async () => {
    const { CRON_INTERVAL_SEC, BUFFER_SEC } = await import("@/lib/wb-cooldown")
    expect(CRON_INTERVAL_SEC).toBe(900)
    expect(BUFFER_SEC).toBe(120)
  })
})
