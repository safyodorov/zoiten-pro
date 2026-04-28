import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ──────────────────────────────────────────────────────────────────
// Phase 14 Plan 03 — per-warehouse stocks via Statistics API
// ──────────────────────────────────────────────────────────────────
//
// DEVIATION: Plan 14-03 изначально написан под Analytics API
// (POST /api/analytics/v1/stocks-report/wb-warehouses). Base токен
// возвращает 403. Используем Statistics API
// (GET /api/v1/supplier/stocks?dateFrom=...) который уже работает
// и возвращает per-warehouse данные (warehouseName + nmId + quantity).
//
// Statistics API endpoint верифицирован curl на VPS 2026-04-22.
// Пример ответа см. в deviation notes плана 14-03.
//
// Rate limit Statistics API: ~1 запрос в минуту per токен.
// Один запрос возвращает ВСЕ данные — НЕ ставить в цикл.

describe("fetchStocksPerWarehouse — Statistics API (STOCK-07)", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv("WB_API_TOKEN", "test-token")
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("пустой массив nmIds → пустой Map без HTTP вызовов", async () => {
    const { fetchStocksPerWarehouse } = await import("@/lib/wb-api")

    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const result = await fetchStocksPerWarehouse([])
    expect(result.size).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("happy path 200 → Map с per-warehouse данными", async () => {
    const { fetchStocksPerWarehouse } = await import("@/lib/wb-api")

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          lastChangeDate: "2026-04-21T07:44:34",
          warehouseName: "Невинномысск",
          nmId: 418725481,
          barcode: "2044018340398",
          quantity: 21,
          inWayToClient: 0,
          inWayFromClient: 0,
          quantityFull: 21,
          supplierArticle: "МоющийПылесосZoiten",
          techSize: "0",
        },
        {
          lastChangeDate: "2026-04-21T07:44:34",
          warehouseName: "Коледино",
          nmId: 418725481,
          barcode: "2044018340398",
          quantity: 5,
          inWayToClient: 2,
          inWayFromClient: 1,
          quantityFull: 8,
          supplierArticle: "МоющийПылесосZoiten",
          techSize: "0",
        },
      ],
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await fetchStocksPerWarehouse([418725481])

    expect(result.size).toBe(1)
    const items = result.get(418725481)
    expect(items).toHaveLength(2)

    const nevinnomyssk = items!.find((i) => i.warehouseName === "Невинномысск")
    expect(nevinnomyssk).toBeDefined()
    expect(nevinnomyssk!.quantity).toBe(21)
    expect(nevinnomyssk!.inWayToClient).toBe(0)

    const koledino = items!.find((i) => i.warehouseName === "Коледино")
    expect(koledino!.quantity).toBe(5)
    expect(koledino!.inWayToClient).toBe(2)
  })

  it("несколько nmIds → сгруппированы по nmId в одном запросе", async () => {
    const { fetchStocksPerWarehouse } = await import("@/lib/wb-api")

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        { warehouseName: "Склад А", nmId: 111, quantity: 10, inWayToClient: 0, inWayFromClient: 0 },
        { warehouseName: "Склад А", nmId: 222, quantity: 5,  inWayToClient: 1, inWayFromClient: 0 },
        { warehouseName: "Склад Б", nmId: 111, quantity: 3,  inWayToClient: 0, inWayFromClient: 2 },
      ],
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await fetchStocksPerWarehouse([111, 222])

    // Ровно один HTTP запрос — не несколько
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.size).toBe(2)
    expect(result.get(111)).toHaveLength(2)
    expect(result.get(222)).toHaveLength(1)
  })

  it("фильтрует по переданным nmIds — чужие nmId не включаются", async () => {
    const { fetchStocksPerWarehouse } = await import("@/lib/wb-api")

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        { warehouseName: "Склад А", nmId: 111, quantity: 10, inWayToClient: 0, inWayFromClient: 0 },
        { warehouseName: "Склад А", nmId: 999, quantity: 99, inWayToClient: 0, inWayFromClient: 0 },
      ],
    })
    vi.stubGlobal("fetch", fetchMock)

    // Просим только 111, но API вернул и 999 (другой seller? — не наш)
    const result = await fetchStocksPerWarehouse([111])

    expect(result.has(111)).toBe(true)
    expect(result.has(999)).toBe(false)
  })

  it("пустой ответ API [] → пустой Map без throw", async () => {
    const { fetchStocksPerWarehouse } = await import("@/lib/wb-api")

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await fetchStocksPerWarehouse([12345])
    expect(result.size).toBe(0)
  })

  it("HTTP 401 → throws Error с упоминанием статуса", async () => {
    const { fetchStocksPerWarehouse } = await import("@/lib/wb-api")

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(fetchStocksPerWarehouse([12345])).rejects.toThrow("401")
  })

  it("HTTP 403 → throws Error с упоминанием статуса", async () => {
    const { fetchStocksPerWarehouse } = await import("@/lib/wb-api")

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => "base token is not allowed",
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(fetchStocksPerWarehouse([12345])).rejects.toThrow("403")
  })

  it("использует правильный endpoint statistics-api.wildberries.ru", async () => {
    const { fetchStocksPerWarehouse } = await import("@/lib/wb-api")

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    })
    vi.stubGlobal("fetch", fetchMock)

    await fetchStocksPerWarehouse([12345])

    const callUrl = fetchMock.mock.calls[0]?.[0] as string
    expect(callUrl).toContain("statistics-api.wildberries.ru")
    expect(callUrl).toContain("/api/v1/supplier/stocks")
    expect(callUrl).toContain("dateFrom=")
  })

  it("WarehouseStockItem содержит warehouseName, quantity, inWayToClient, inWayFromClient", async () => {
    const { fetchStocksPerWarehouse } = await import("@/lib/wb-api")

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          warehouseName: "Подольск",
          nmId: 800750522,
          quantity: 15,
          inWayToClient: 3,
          inWayFromClient: 1,
          quantityFull: 19,
        },
      ],
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await fetchStocksPerWarehouse([800750522])
    const item = result.get(800750522)![0]!

    expect(item).toHaveProperty("warehouseName", "Подольск")
    expect(item).toHaveProperty("quantity", 15)
    expect(item).toHaveProperty("inWayToClient", 3)
    expect(item).toHaveProperty("inWayFromClient", 1)
  })

  it("Phase 16 (STOCK-32): WarehouseStockItem содержит techSize и barcode", async () => {
    const { fetchStocksPerWarehouse } = await import("@/lib/wb-api")
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          warehouseName: "Котовск",
          nmId: 859398279,
          techSize: "46",
          barcode: "2044018340398",
          quantity: 11,
          inWayToClient: 0,
          inWayFromClient: 0,
        },
      ],
    })
    vi.stubGlobal("fetch", fetchMock)
    const result = await fetchStocksPerWarehouse([859398279])
    const item = result.get(859398279)![0]!
    expect(item.techSize).toBe("46")
    expect(item.barcode).toBe("2044018340398")
  })

  it("Phase 16 (STOCK-32): несколько techSize для одного warehouseName — каждый отдельная WarehouseStockItem", async () => {
    const { fetchStocksPerWarehouse } = await import("@/lib/wb-api")
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        { warehouseName: "Котовск", nmId: 859398279, techSize: "46", barcode: "b46", quantity: 11, inWayToClient: 0, inWayFromClient: 0 },
        { warehouseName: "Котовск", nmId: 859398279, techSize: "48", barcode: "b48", quantity: 10, inWayToClient: 0, inWayFromClient: 0 },
        { warehouseName: "Котовск", nmId: 859398279, techSize: "50", barcode: "b50", quantity: 10, inWayToClient: 0, inWayFromClient: 0 },
      ],
    })
    vi.stubGlobal("fetch", fetchMock)
    const result = await fetchStocksPerWarehouse([859398279])
    const items = result.get(859398279)!
    expect(items).toHaveLength(3)
    const sizes = items.map((i) => i.techSize).sort()
    expect(sizes).toEqual(["46", "48", "50"])
  })

  it("Phase 16 (STOCK-32): отсутствие techSize/barcode → пустые строки", async () => {
    const { fetchStocksPerWarehouse } = await import("@/lib/wb-api")
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        { warehouseName: "Склад X", nmId: 999, quantity: 5, inWayToClient: 0, inWayFromClient: 0 },
      ],
    })
    vi.stubGlobal("fetch", fetchMock)
    const result = await fetchStocksPerWarehouse([999])
    const item = result.get(999)![0]!
    expect(item.techSize).toBe("")
    expect(item.barcode).toBe("")
  })
})
