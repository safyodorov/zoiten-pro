import { describe, it, expect, vi, beforeEach } from "vitest"

// ──────────────────────────────────────────────────────────────────
// Тест: POST /api/wb-sync НЕ должен перетирать WbCard в NULL при 429
//
// Воспроизводит баг: при !ok фетчеры возвращали empty Map, а upsert-цикл
// писал stockMap.get(nmId) ?? null = null поверх всех карточек.
//
// После фикса:
//   - fetchStocks throws → upsert.update НЕ содержит ключа stockQty
//   - fetchAllPrices throws → upsert.update НЕ содержит ключей price, priceBeforeDiscount, sellerDiscount, clubDiscount
//   - всё OK → все поля присутствуют в upsert.update
// ──────────────────────────────────────────────────────────────────

// Моки для prisma
const mockWbCardUpsert = vi.fn().mockResolvedValue({})
const mockWbCommissionIuFindMany = vi.fn().mockResolvedValue([])
const mockAuthFn = vi.fn().mockResolvedValue({ user: { id: "1" } })
const mockAppSettingFindUnique = vi.fn().mockResolvedValue(null)
const mockAppSettingUpsert = vi.fn().mockResolvedValue({})
const mockWbWarehouseFindFirst = vi.fn().mockResolvedValue(null)
const mockWbWarehouseCreate = vi.fn().mockResolvedValue({})
const mockWbCardFindUnique = vi.fn().mockResolvedValue(null)
const mockWbCardWarehouseStockUpsert = vi.fn().mockResolvedValue({})
const mockWbCardWarehouseStockFindMany = vi.fn().mockResolvedValue([])
const mockWbCardWarehouseStockDeleteMany = vi.fn().mockResolvedValue({})
const mockWbCardUpdate = vi.fn().mockResolvedValue({})
const mockWbCardWarehouseOrdersUpsert = vi.fn().mockResolvedValue({})
const mockWbCardWarehouseOrdersDeleteMany = vi.fn().mockResolvedValue({})

// Транзакция — выполняет callback сразу (нет реального DB)
const mockTransaction = vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
  return cb({
    wbWarehouse: { findFirst: mockWbWarehouseFindFirst, create: mockWbWarehouseCreate },
    wbCard: { findUnique: mockWbCardFindUnique, update: mockWbCardUpdate },
    wbCardWarehouseStock: {
      upsert: mockWbCardWarehouseStockUpsert,
      findMany: mockWbCardWarehouseStockFindMany,
      deleteMany: mockWbCardWarehouseStockDeleteMany,
    },
    wbCardWarehouseOrders: {
      upsert: mockWbCardWarehouseOrdersUpsert,
      deleteMany: mockWbCardWarehouseOrdersDeleteMany,
    },
  })
})

vi.mock("@/lib/prisma", () => ({
  prisma: {
    wbCard: { upsert: mockWbCardUpsert },
    wbCommissionIu: { findMany: mockWbCommissionIuFindMany },
    appSetting: { findUnique: mockAppSettingFindUnique, upsert: mockAppSettingUpsert },
    $transaction: mockTransaction,
  },
}))

vi.mock("@/lib/auth", () => ({
  auth: mockAuthFn,
}))

// Минимальная карточка WB для тестов
const MINIMAL_WB_CARD = {
  nmID: 12345,
  vendorCode: "TEST-001",
  brand: "TestBrand",
  title: "Тестовый товар",
  description: "",
  subjectName: "Электроника",
  subjectID: 500,
  photos: [],
  sizes: [{ skus: ["1234567890"], price: 1000, techSize: "0" }],
  tags: [],
}

// Стандартный (успешный) ответ fetchAllCards
const CARDS_SUCCESS = [MINIMAL_WB_CARD]

// Стандартные данные цен
const PRICES_SUCCESS = new Map([
  [12345, { priceBeforeDiscount: 1000, discountedPrice: 900, sellerDiscount: 10, clubDiscount: 5 }],
])

// Стандартные остатки
const STOCKS_SUCCESS = new Map([[12345, 42]])

// Стандартные комиссии
const COMMISSIONS_SUCCESS = new Map([[500, { fbw: 15.5, fbs: 10.0 }]])

// Стандартные данные выкупа
const BUYOUT_SUCCESS = new Map([[12345, 78]])

// Стандартный Map для скидок WB (СПП)
const DISCOUNTS_SUCCESS = new Map([[12345, 12.5]])

// Пустые Maps для per-warehouse (их ошибки корректно обрабатываются)
const ORDERS_EMPTY = new Map()
const STOCKS_PW_EMPTY = new Map()

vi.mock("@/lib/wb-api", () => ({
  fetchAllCards: vi.fn(),
  parseCard: vi.fn((raw) => ({
    nmId: raw.nmID,
    article: raw.vendorCode,
    name: raw.title || raw.vendorCode,
    brand: raw.brand || null,
    category: raw.subjectName || null,
    photoUrl: null,
    photos: [],
    hasVideo: false,
    barcode: raw.sizes?.[0]?.skus?.[0] ?? null,
    barcodes: raw.sizes?.flatMap((s: { skus: string[] }) => s.skus) ?? [],
    weightKg: null,
    heightCm: null,
    widthCm: null,
    depthCm: null,
    tags: [],
    characteristics: null,
    techSizes: [],
    sizeSkus: [],
  })),
  fetchAllPrices: vi.fn(),
  fetchWbDiscounts: vi.fn(),
  fetchStandardCommissions: vi.fn(),
  fetchStocks: vi.fn(),
  fetchBuyoutPercent: vi.fn(),
  fetchOrdersPerWarehouse: vi.fn(),
  fetchStocksPerWarehouse: vi.fn(),
}))

// Динамический импорт route — после установки моков
async function importRoute() {
  // Сбрасываем модуль чтобы моки применились
  const mod = await import("@/app/api/wb-sync/route")
  return mod
}

// Helper: вызвать POST /api/wb-sync
async function callPost() {
  const { POST } = await importRoute()
  const req = new Request("http://localhost/api/wb-sync", { method: "POST" })
  return POST()
}

describe("POST /api/wb-sync — защита от NULL при API 429", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockAuthFn.mockResolvedValue({ user: { id: "1" } })
    mockWbCommissionIuFindMany.mockResolvedValue([])
    mockWbCardUpsert.mockResolvedValue({})
    mockAppSettingFindUnique.mockResolvedValue(null)
    mockAppSettingUpsert.mockResolvedValue({})

    // Сбрасываем vi.mock wb-api функции
    const wbApi = await import("@/lib/wb-api")
    vi.mocked(wbApi.fetchAllCards).mockResolvedValue(CARDS_SUCCESS as never)
    vi.mocked(wbApi.fetchAllPrices).mockResolvedValue(PRICES_SUCCESS as never)
    vi.mocked(wbApi.fetchStocks).mockResolvedValue(STOCKS_SUCCESS)
    vi.mocked(wbApi.fetchStandardCommissions).mockResolvedValue(COMMISSIONS_SUCCESS)
    vi.mocked(wbApi.fetchBuyoutPercent).mockResolvedValue(BUYOUT_SUCCESS)
    vi.mocked(wbApi.fetchWbDiscounts).mockResolvedValue(DISCOUNTS_SUCCESS)
    vi.mocked(wbApi.fetchOrdersPerWarehouse).mockResolvedValue(ORDERS_EMPTY)
    vi.mocked(wbApi.fetchStocksPerWarehouse).mockResolvedValue(STOCKS_PW_EMPTY)
  })

  // ─── Сценарий 1: fetchStocks throws ───────────────────────────────────────

  it("Сц.1: fetchStocks throws → upsert.update НЕ содержит ключа stockQty", async () => {
    const wbApi = await import("@/lib/wb-api")
    vi.mocked(wbApi.fetchStocks).mockRejectedValue(new Error("Statistics API stocks ошибка 429"))

    await callPost()

    expect(mockWbCardUpsert).toHaveBeenCalledTimes(1)
    const upsertCall = mockWbCardUpsert.mock.calls[0][0]
    // update НЕ должен содержать ключ stockQty
    expect(upsertCall.update).not.toHaveProperty("stockQty")
  })

  // ─── Сценарий 2: fetchAllPrices throws ────────────────────────────────────

  it("Сц.2: fetchAllPrices throws → upsert.update НЕ содержит ключей price/priceBeforeDiscount/sellerDiscount/clubDiscount", async () => {
    const wbApi = await import("@/lib/wb-api")
    vi.mocked(wbApi.fetchAllPrices).mockRejectedValue(new Error("Prices API ошибка 429"))

    await callPost()

    expect(mockWbCardUpsert).toHaveBeenCalledTimes(1)
    const upsertCall = mockWbCardUpsert.mock.calls[0][0]
    expect(upsertCall.update).not.toHaveProperty("price")
    expect(upsertCall.update).not.toHaveProperty("priceBeforeDiscount")
    expect(upsertCall.update).not.toHaveProperty("sellerDiscount")
    expect(upsertCall.update).not.toHaveProperty("clubDiscount")
  })

  // ─── Сценарий 3: fetchStandardCommissions throws ──────────────────────────

  it("Сц.3: fetchStandardCommissions throws → upsert.update НЕ содержит commFbwStd/commFbsStd", async () => {
    const wbApi = await import("@/lib/wb-api")
    vi.mocked(wbApi.fetchStandardCommissions).mockRejectedValue(new Error("Tariffs API ошибка 429"))

    await callPost()

    expect(mockWbCardUpsert).toHaveBeenCalledTimes(1)
    const upsertCall = mockWbCardUpsert.mock.calls[0][0]
    expect(upsertCall.update).not.toHaveProperty("commFbwStd")
    expect(upsertCall.update).not.toHaveProperty("commFbsStd")
  })

  // ─── Сценарий 4: fetchBuyoutPercent throws ────────────────────────────────

  it("Сц.4: fetchBuyoutPercent throws → upsert.update НЕ содержит buyoutPercent", async () => {
    const wbApi = await import("@/lib/wb-api")
    vi.mocked(wbApi.fetchBuyoutPercent).mockRejectedValue(new Error("Analytics create report ошибка 429"))

    await callPost()

    expect(mockWbCardUpsert).toHaveBeenCalledTimes(1)
    const upsertCall = mockWbCardUpsert.mock.calls[0][0]
    expect(upsertCall.update).not.toHaveProperty("buyoutPercent")
  })

  // ─── Сценарий 5: fetchOrdersPerWarehouse throws ───────────────────────────

  it("Сц.5: fetchOrdersPerWarehouse throws → upsert.update НЕ содержит avgSalesSpeed7d/ordersYesterday", async () => {
    const wbApi = await import("@/lib/wb-api")
    vi.mocked(wbApi.fetchOrdersPerWarehouse).mockRejectedValue(new Error("WB Orders API 429"))

    await callPost()

    expect(mockWbCardUpsert).toHaveBeenCalledTimes(1)
    const upsertCall = mockWbCardUpsert.mock.calls[0][0]
    expect(upsertCall.update).not.toHaveProperty("avgSalesSpeed7d")
    expect(upsertCall.update).not.toHaveProperty("ordersYesterday")
  })

  // ─── Сценарий 6: все API OK → все поля присутствуют ──────────────────────

  it("Сц.6: все API OK → все поля присутствуют в upsert.update с корректными значениями", async () => {
    await callPost()

    expect(mockWbCardUpsert).toHaveBeenCalledTimes(1)
    const upsertCall = mockWbCardUpsert.mock.calls[0][0]
    const upd = upsertCall.update

    // Поля из prices
    expect(upd).toHaveProperty("price", 900)
    expect(upd).toHaveProperty("priceBeforeDiscount", 1000)
    expect(upd).toHaveProperty("sellerDiscount", 10)
    expect(upd).toHaveProperty("clubDiscount", 5)

    // Поля из stocks
    expect(upd).toHaveProperty("stockQty", 42)

    // Поля из buyout
    expect(upd).toHaveProperty("buyoutPercent", 78)

    // Поля из commissions
    expect(upd).toHaveProperty("commFbwStd", 15.5)
    expect(upd).toHaveProperty("commFbsStd", 10.0)

    // Поля из orders (пустой map — нет данных → поля присутствуют как null)
    // ordersPerWarehouseMap.get(nmId) = undefined → ordersStats = undefined → avg = null
    expect(upd).toHaveProperty("avgSalesSpeed7d", null)
    expect(upd).toHaveProperty("ordersYesterday", null)
  })

  // ─── Сценарий 7: все API throws → response 200 без краша (degraded mode) ─

  it("Сц.7: несколько API throws одновременно → 200 OK, upsert вызван (с контентными полями)", async () => {
    const wbApi = await import("@/lib/wb-api")
    vi.mocked(wbApi.fetchStocks).mockRejectedValue(new Error("429"))
    vi.mocked(wbApi.fetchAllPrices).mockRejectedValue(new Error("429"))
    vi.mocked(wbApi.fetchStandardCommissions).mockRejectedValue(new Error("429"))
    vi.mocked(wbApi.fetchBuyoutPercent).mockRejectedValue(new Error("429"))
    vi.mocked(wbApi.fetchOrdersPerWarehouse).mockRejectedValue(new Error("429"))
    vi.mocked(wbApi.fetchWbDiscounts).mockResolvedValue(new Map()) // discounts деградируют тихо

    const { POST } = await importRoute()
    const response = await POST()
    const body = await response.json()

    // Синхронизация не упала с 500
    expect(response.status).not.toBe(500)
    // Карточки всё равно обработаны (Content API OK)
    expect(body.synced).toBe(1)
    // upsert вызван но без пропавших полей
    expect(mockWbCardUpsert).toHaveBeenCalledTimes(1)
    const upd = mockWbCardUpsert.mock.calls[0][0].update
    expect(upd).not.toHaveProperty("stockQty")
    expect(upd).not.toHaveProperty("price")
    expect(upd).not.toHaveProperty("buyoutPercent")
    expect(upd).not.toHaveProperty("commFbwStd")
    expect(upd).not.toHaveProperty("avgSalesSpeed7d")
  })
})
