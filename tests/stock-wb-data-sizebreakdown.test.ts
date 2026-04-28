import { describe, it, expect } from "vitest"
import { buildSizeBreakdown } from "@/lib/stock-wb-data"

// Phase 16 (STOCK-34): unit-тесты для pure-функции buildSizeBreakdown.
// Тестируем без Prisma mock — pure helper принимает уже-нормализованный массив
// warehouses со склеенными warehouse meta (name/shortCluster/needsClusterReview).

describe("buildSizeBreakdown (STOCK-34)", () => {
  const koledino = {
    name: "Коледино",
    shortCluster: "ЦФО",
    needsClusterReview: false,
  }
  const kazan = {
    name: "Казань",
    shortCluster: "ПФО",
    needsClusterReview: false,
  }

  it("один размер → пустой sizeBreakdown (одно-размерные товары не порождают строк)", () => {
    const result = buildSizeBreakdown([
      { warehouseId: 1, techSize: "46", quantity: 11, warehouse: koledino },
    ])
    expect(result).toEqual([])
  })

  it("два размера в одном складе → 2 WbStockSizeRow", () => {
    const result = buildSizeBreakdown([
      { warehouseId: 1, techSize: "46", quantity: 11, warehouse: koledino },
      { warehouseId: 1, techSize: "48", quantity: 10, warehouse: koledino },
    ])
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.techSize)).toEqual(["46", "48"])
  })

  it("sortSizes применён: 60, 46, 48 → 46, 48, 60", () => {
    const result = buildSizeBreakdown([
      { warehouseId: 1, techSize: "60", quantity: 5, warehouse: koledino },
      { warehouseId: 1, techSize: "46", quantity: 11, warehouse: koledino },
      { warehouseId: 1, techSize: "48", quantity: 10, warehouse: koledino },
    ])
    expect(result.map((r) => r.techSize)).toEqual(["46", "48", "60"])
  })

  it("totalStock = sum по всем складам этого размера", () => {
    const result = buildSizeBreakdown([
      { warehouseId: 1, techSize: "46", quantity: 11, warehouse: koledino },
      { warehouseId: 2, techSize: "46", quantity: 4, warehouse: kazan },
      { warehouseId: 1, techSize: "48", quantity: 10, warehouse: koledino },
    ])
    const size46 = result.find((r) => r.techSize === "46")!
    expect(size46.totalStock).toBe(15)
  })

  it("clusters[ЦФО].totalStock = только этот размер в кластере", () => {
    const result = buildSizeBreakdown([
      { warehouseId: 1, techSize: "46", quantity: 11, warehouse: koledino },
      { warehouseId: 2, techSize: "46", quantity: 4, warehouse: kazan },
      { warehouseId: 1, techSize: "48", quantity: 10, warehouse: koledino },
    ])
    const size46 = result.find((r) => r.techSize === "46")!
    expect(size46.clusters["ЦФО"].totalStock).toBe(11)
    expect(size46.clusters["ПФО"].totalStock).toBe(4)
  })

  it("warehouses[i].quantity = только этот размер на этом складе", () => {
    const result = buildSizeBreakdown([
      { warehouseId: 1, techSize: "46", quantity: 11, warehouse: koledino },
      { warehouseId: 1, techSize: "48", quantity: 10, warehouse: koledino },
    ])
    const size46 = result.find((r) => r.techSize === "46")!
    const wh = size46.clusters["ЦФО"].warehouses.find((w) => w.warehouseId === 1)!
    expect(wh.quantity).toBe(11)
  })

  it("ordersPerDay в каждом кластере и складе = null (per-size orders не хранятся)", () => {
    const result = buildSizeBreakdown([
      { warehouseId: 1, techSize: "46", quantity: 11, warehouse: koledino },
      { warehouseId: 1, techSize: "48", quantity: 10, warehouse: koledino },
    ])
    const size46 = result.find((r) => r.techSize === "46")!
    expect(size46.clusters["ЦФО"].ordersPerDay).toBeNull()
    const wh = size46.clusters["ЦФО"].warehouses.find((w) => w.warehouseId === 1)!
    expect(wh.ordersPerDay).toBeNull()
    expect(wh.ordersCount).toBe(0)
  })

  it("techSize='0' (одно-размерный mixed с реальными размерами) → '0' в конце", () => {
    const result = buildSizeBreakdown([
      { warehouseId: 1, techSize: "0", quantity: 5, warehouse: koledino },
      { warehouseId: 1, techSize: "46", quantity: 11, warehouse: koledino },
    ])
    expect(result.map((r) => r.techSize)).toEqual(["46", "0"])
  })

  it("неизвестный shortCluster → попадает в 'Прочие'", () => {
    const unknown = {
      name: "X",
      shortCluster: "Антарктида",
      needsClusterReview: false,
    }
    const result = buildSizeBreakdown([
      { warehouseId: 1, techSize: "46", quantity: 11, warehouse: koledino },
      { warehouseId: 999, techSize: "46", quantity: 1, warehouse: unknown },
    ])
    const size46 = result.find((r) => r.techSize === "46")!
    expect(size46.clusters["Прочие"].totalStock).toBe(1)
  })
})
