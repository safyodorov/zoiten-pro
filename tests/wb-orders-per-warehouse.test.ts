import { describe, it, expect, vi, beforeEach } from "vitest"
import { fetchOrdersPerWarehouse } from "@/lib/wb-api"

// @ts-expect-error - mocking global fetch
global.fetch = vi.fn()

describe("fetchOrdersPerWarehouse", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.WB_API_TOKEN = "test-token"
  })

  it("пустой массив nmIds → пустой Map без HTTP", async () => {
    const result = await fetchOrdersPerWarehouse([])
    expect(result.size).toBe(0)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("happy path — агрегация per warehouseName", async () => {
    const orders = [
      { nmId: 100, warehouseName: "Коледино", isCancel: false, date: "2025-04-15T10:00:00" },
      { nmId: 100, warehouseName: "Коледино", isCancel: false, date: "2025-04-16T10:00:00" },
      { nmId: 100, warehouseName: "Казань", isCancel: false, date: "2025-04-17T10:00:00" },
      { nmId: 200, warehouseName: "Коледино", isCancel: false, date: "2025-04-18T10:00:00" },
    ]
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => orders,
    })

    const result = await fetchOrdersPerWarehouse([100, 200], 7)

    expect(result.size).toBe(2)
    const s100 = result.get(100)!
    expect(s100.avg).toBeCloseTo(3 / 7)
    expect(s100.perWarehouse.get("Коледино")).toBe(2)
    expect(s100.perWarehouse.get("Казань")).toBe(1)
    expect(s100.periodDays).toBe(7)

    const s200 = result.get(200)!
    expect(s200.avg).toBeCloseTo(1 / 7)
    expect(s200.perWarehouse.get("Коледино")).toBe(1)
  })

  it("isCancel=true исключаются из всех счётчиков", async () => {
    const orders = [
      { nmId: 100, warehouseName: "Коледино", isCancel: false, date: "2025-04-15T10:00:00" },
      { nmId: 100, warehouseName: "Коледино", isCancel: true, date: "2025-04-16T10:00:00" },
      { nmId: 100, warehouseName: "Казань", isCancel: true, date: "2025-04-17T10:00:00" },
    ]
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => orders,
    })

    const result = await fetchOrdersPerWarehouse([100], 7)
    const s = result.get(100)!
    expect(s.avg).toBeCloseTo(1 / 7)
    expect(s.perWarehouse.get("Коледино")).toBe(1)
    expect(s.perWarehouse.has("Казань")).toBe(false)
  })

  it("нерелевантные nmId отфильтрованы", async () => {
    const orders = [
      { nmId: 100, warehouseName: "Коледино", isCancel: false, date: "2025-04-15T10:00:00" },
      { nmId: 999, warehouseName: "Коледино", isCancel: false, date: "2025-04-15T10:00:00" },
    ]
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => orders,
    })

    const result = await fetchOrdersPerWarehouse([100], 7)
    expect(result.size).toBe(1)
    expect(result.has(100)).toBe(true)
    expect(result.has(999)).toBe(false)
  })

  it("периодDays=14 → avg делится на 14", async () => {
    const orders = Array.from({ length: 14 }, (_, i) => ({
      nmId: 100,
      warehouseName: "Коледино",
      isCancel: false,
      date: `2025-04-${String(i + 1).padStart(2, "0")}T10:00:00`,
    }))
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => orders,
    })

    const result = await fetchOrdersPerWarehouse([100], 14)
    const s = result.get(100)!
    expect(s.avg).toBeCloseTo(14 / 14)
    expect(s.periodDays).toBe(14)

    // Проверим что URL содержит сдвинутый на 14 дней dateFrom
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain("statistics-api.wildberries.ru/api/v1/supplier/orders")
    expect(url).toContain("dateFrom=")
  })

  it("HTTP !ok (non-429) → пустой Map, не throw", async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    })

    const result = await fetchOrdersPerWarehouse([100], 7)
    expect(result.size).toBe(0)
  })

  it("пустой warehouseName не попадает в perWarehouse", async () => {
    const orders = [
      { nmId: 100, warehouseName: "", isCancel: false, date: "2025-04-15T10:00:00" },
      { nmId: 100, warehouseName: "Коледино", isCancel: false, date: "2025-04-16T10:00:00" },
    ]
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => orders,
    })

    const result = await fetchOrdersPerWarehouse([100], 7)
    const s = result.get(100)!
    expect(s.avg).toBeCloseTo(2 / 7) // avg считает оба
    expect(s.perWarehouse.size).toBe(1) // но в perWarehouse только непустой
    expect(s.perWarehouse.get("Коледино")).toBe(1)
  })

  it("Phase 16 (STOCK-32): perWarehouseSize заполнен per warehouseName per techSize", async () => {
    const orders = [
      { nmId: 100, warehouseName: "Коледино", techSize: "M", isCancel: false, date: "2026-04-20T10:00:00" },
      { nmId: 100, warehouseName: "Коледино", techSize: "M", isCancel: false, date: "2026-04-21T10:00:00" },
      { nmId: 100, warehouseName: "Коледино", techSize: "M", isCancel: false, date: "2026-04-22T10:00:00" },
      { nmId: 100, warehouseName: "Коледино", techSize: "L", isCancel: false, date: "2026-04-22T11:00:00" },
    ]
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => orders,
    })

    const result = await fetchOrdersPerWarehouse([100], 7)
    const stats = result.get(100)!
    const koledino = stats.perWarehouseSize.get("Коледино")!
    expect(koledino.get("M")).toBe(3)
    expect(koledino.get("L")).toBe(1)
  })

  it("Phase 16 (STOCK-32): isCancel:true исключаются из perWarehouseSize", async () => {
    const orders = [
      { nmId: 200, warehouseName: "Котовск", techSize: "46", isCancel: false, date: "2026-04-20T10:00:00" },
      { nmId: 200, warehouseName: "Котовск", techSize: "46", isCancel: true,  date: "2026-04-21T10:00:00" },
      { nmId: 200, warehouseName: "Котовск", techSize: "48", isCancel: false, date: "2026-04-22T10:00:00" },
    ]
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => orders,
    })

    const result = await fetchOrdersPerWarehouse([200], 7)
    const stats = result.get(200)!
    const kotovsk = stats.perWarehouseSize.get("Котовск")!
    expect(kotovsk.get("46")).toBe(1)  // отменённый исключён
    expect(kotovsk.get("48")).toBe(1)
  })

  it("Phase 16 (STOCK-32): отсутствие techSize → ключ '0' в perWarehouseSize", async () => {
    const orders = [
      { nmId: 300, warehouseName: "Склад X", isCancel: false, date: "2026-04-22T10:00:00" },
    ]
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => orders,
    })

    const result = await fetchOrdersPerWarehouse([300], 7)
    const stats = result.get(300)!
    const wh = stats.perWarehouseSize.get("Склад X")!
    expect(wh.get("0")).toBe(1)
  })

  it("Phase 16 (STOCK-32, W11): nmId с avg=0, yesterday=0, perWh.size=0 → НЕ попадает в result Map (skip-condition)", async () => {
    // W11: проверяет что Изменение 4.5 не нарушает skip-condition.
    // nmId 999 в requested, но fetch возвращает orders только для других nmId
    // → totals/yesterday/perWh для 999 пустые → skip → result.has(999) === false
    const orders = [
      { nmId: 100, warehouseName: "Коледино", techSize: "M", isCancel: false, date: "2026-04-22T10:00:00" },
      // 999 — нет ни одного заказа
    ]
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => orders,
    })

    const result = await fetchOrdersPerWarehouse([100, 999], 7)
    // 100 — попадает (есть заказ)
    expect(result.has(100)).toBe(true)
    // 999 — НЕ попадает (skip: t=0 && y=0 && perWh.size=0)
    expect(result.has(999)).toBe(false)
  })
})
