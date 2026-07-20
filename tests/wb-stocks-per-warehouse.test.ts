import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Backlog 999.1: wb-api теперь импортирует wb-cooldown, которому нужен prisma.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    appSetting: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
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

// ──────────────────────────────────────────────────────────────────
// quick-260720-mj0 — per-warehouse stocks via Analytics warehouse_remains
// ──────────────────────────────────────────────────────────────────
//
// 2026-07-20: Statistics API `GET /api/v1/supplier/stocks` отключён WB
// (HTTP 404 `PLUG-404-20260720`). Мигрировано на Analytics API
// `warehouse_remains` — task-based: CREATE → POLL status → DOWNLOAD.
// Верифицировано вручную на VPS 2026-07-20.

/** Helper: мокает CREATE → STATUS(done) → DOWNLOAD последовательность. */
function mockHappyFlow(rows: unknown[]) {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { taskId: "t1" } }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { id: "t1", status: "done" } }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => rows,
    })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("fetchStocksPerWarehouse — Analytics warehouse_remains (STOCK-07)", () => {
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

  it("happy path: create → status done → download → Map с per-warehouse данными", async () => {
    const { fetchStocksPerWarehouse } = await import("@/lib/wb-api")

    mockHappyFlow([
      {
        nmId: 418725481,
        barcode: "2044018340398",
        techSize: "0",
        warehouses: [
          { warehouseName: "Всего находится на складах", quantity: 26 },
          { warehouseName: "В пути до получателей", quantity: 2 },
          { warehouseName: "В пути возвраты на склад WB", quantity: 1 },
          { warehouseName: "Невинномысск", quantity: 21 },
          { warehouseName: "Коледино", quantity: 5 },
        ],
      },
    ])

    const promise = fetchStocksPerWarehouse([418725481])
    await vi.advanceTimersByTimeAsync(5000)
    const result = await promise

    expect(result.size).toBe(1)
    const items = result.get(418725481)!
    // "Всего находится на складах" исключён — только 2 физических склада
    expect(items).toHaveLength(2)

    const nevinnomyssk = items.find((i) => i.warehouseName === "Невинномысск")!
    expect(nevinnomyssk.quantity).toBe(21)
    // in-way навешан на ПЕРВЫЙ физический item строки (Невинномысск)
    expect(nevinnomyssk.inWayToClient).toBe(2)
    expect(nevinnomyssk.inWayFromClient).toBe(1)

    const koledino = items.find((i) => i.warehouseName === "Коледино")!
    expect(koledino.quantity).toBe(5)
    expect(koledino.inWayToClient).toBe(0)
    expect(koledino.inWayFromClient).toBe(0)

    expect(items.some((i) => i.warehouseName === "Всего находится на складах")).toBe(false)
  })

  it("фильтрует по переданным nmIds — чужие nmId не включаются", async () => {
    const { fetchStocksPerWarehouse } = await import("@/lib/wb-api")

    mockHappyFlow([
      { nmId: 111, techSize: "0", warehouses: [{ warehouseName: "Склад А", quantity: 10 }] },
      { nmId: 999, techSize: "0", warehouses: [{ warehouseName: "Склад А", quantity: 99 }] },
    ])

    const promise = fetchStocksPerWarehouse([111])
    await vi.advanceTimersByTimeAsync(5000)
    const result = await promise

    expect(result.has(111)).toBe(true)
    expect(result.has(999)).toBe(false)
  })

  it("несколько строк одного nmId (разные techSize) → все items конкатенируются в один массив", async () => {
    const { fetchStocksPerWarehouse } = await import("@/lib/wb-api")

    mockHappyFlow([
      {
        nmId: 859398279,
        barcode: "b46",
        techSize: "46",
        warehouses: [{ warehouseName: "Котовск", quantity: 11 }],
      },
      {
        nmId: 859398279,
        barcode: "b48",
        techSize: "48",
        warehouses: [{ warehouseName: "Котовск", quantity: 10 }],
      },
      {
        nmId: 859398279,
        barcode: "b50",
        techSize: "50",
        warehouses: [{ warehouseName: "Котовск", quantity: 10 }],
      },
    ])

    const promise = fetchStocksPerWarehouse([859398279])
    await vi.advanceTimersByTimeAsync(5000)
    const result = await promise

    const items = result.get(859398279)!
    expect(items).toHaveLength(3)
    const sizes = items.map((i) => i.techSize).sort()
    expect(sizes).toEqual(["46", "48", "50"])
  })

  it("пустой ответ download [] → пустой Map без throw", async () => {
    const { fetchStocksPerWarehouse } = await import("@/lib/wb-api")

    mockHappyFlow([])

    const promise = fetchStocksPerWarehouse([12345])
    await vi.advanceTimersByTimeAsync(5000)
    const result = await promise

    expect(result.size).toBe(0)
  })

  it("edge case: строка только с синтетическими складами (in-way без физ. склада) → данные не теряются", async () => {
    const { fetchStocksPerWarehouse } = await import("@/lib/wb-api")

    mockHappyFlow([
      {
        nmId: 700000001,
        techSize: "0",
        warehouses: [
          { warehouseName: "Всего находится на складах", quantity: 3 },
          { warehouseName: "В пути до получателей", quantity: 3 },
        ],
      },
    ])

    const promise = fetchStocksPerWarehouse([700000001])
    await vi.advanceTimersByTimeAsync(5000)
    const result = await promise

    expect(result.has(700000001)).toBe(true)
    const items = result.get(700000001)!
    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe(0)
    expect(items[0].inWayToClient).toBe(3)
    expect(items[0].inWayFromClient).toBe(0)
    // Явно НЕ используется имя синтетического "Всего" склада
    expect(items[0].warehouseName).not.toBe("Всего находится на складах")
  })

  it("CREATE !ok → throw с кодом статуса", async () => {
    const { fetchStocksPerWarehouse } = await import("@/lib/wb-api")

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(fetchStocksPerWarehouse([12345])).rejects.toThrow("401")
  })

  it("CREATE 403 → throw с кодом статуса", async () => {
    const { fetchStocksPerWarehouse } = await import("@/lib/wb-api")

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => "base token is not allowed",
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(fetchStocksPerWarehouse([12345])).rejects.toThrow("403")
  })

  it("таймаут поллинга (статус не 'done' за отведённое время) → throw", async () => {
    const { fetchStocksPerWarehouse } = await import("@/lib/wb-api")

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { taskId: "t1" } }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: "t1", status: "processing" } }),
      })
    vi.stubGlobal("fetch", fetchMock)

    const promise = fetchStocksPerWarehouse([12345])
    // Ловим rejection сразу, чтобы избежать unhandled rejection во время advance
    const assertion = expect(promise).rejects.toThrow("не готово")
    await vi.advanceTimersByTimeAsync(40 * 5000 + 5000)
    await assertion
  })

  it("использует правильный endpoint seller-analytics-api.wildberries.ru/warehouse_remains", async () => {
    const { fetchStocksPerWarehouse } = await import("@/lib/wb-api")

    mockHappyFlow([])

    const promise = fetchStocksPerWarehouse([12345])
    await vi.advanceTimersByTimeAsync(5000)
    await promise

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    const callUrl = fetchMock.mock.calls[0]?.[0] as string
    expect(callUrl).toContain("seller-analytics-api.wildberries.ru")
    expect(callUrl).toContain("/api/v1/warehouse_remains")
  })

  it("WarehouseStockItem содержит warehouseName, quantity, inWayToClient, inWayFromClient", async () => {
    const { fetchStocksPerWarehouse } = await import("@/lib/wb-api")

    mockHappyFlow([
      {
        nmId: 800750522,
        techSize: "0",
        warehouses: [
          { warehouseName: "Подольск", quantity: 15 },
          { warehouseName: "В пути до получателей", quantity: 3 },
          { warehouseName: "В пути возвраты на склад WB", quantity: 1 },
        ],
      },
    ])

    const promise = fetchStocksPerWarehouse([800750522])
    await vi.advanceTimersByTimeAsync(5000)
    const result = await promise
    const item = result.get(800750522)![0]!

    expect(item).toHaveProperty("warehouseName", "Подольск")
    expect(item).toHaveProperty("quantity", 15)
    expect(item).toHaveProperty("inWayToClient", 3)
    expect(item).toHaveProperty("inWayFromClient", 1)
  })

  it("Phase 16 (STOCK-32): WarehouseStockItem содержит techSize и barcode", async () => {
    const { fetchStocksPerWarehouse } = await import("@/lib/wb-api")

    mockHappyFlow([
      {
        nmId: 859398279,
        barcode: "2044018340398",
        techSize: "46",
        warehouses: [{ warehouseName: "Котовск", quantity: 11 }],
      },
    ])

    const promise = fetchStocksPerWarehouse([859398279])
    await vi.advanceTimersByTimeAsync(5000)
    const result = await promise
    const item = result.get(859398279)![0]!
    expect(item.techSize).toBe("46")
    expect(item.barcode).toBe("2044018340398")
  })

  it("Phase 16 (STOCK-32): отсутствие techSize/barcode → пустые строки", async () => {
    const { fetchStocksPerWarehouse } = await import("@/lib/wb-api")

    mockHappyFlow([{ nmId: 999, warehouses: [{ warehouseName: "Склад X", quantity: 5 }] }])

    const promise = fetchStocksPerWarehouse([999])
    await vi.advanceTimersByTimeAsync(5000)
    const result = await promise
    const item = result.get(999)![0]!
    expect(item.techSize).toBe("")
    expect(item.barcode).toBe("")
  })
})
