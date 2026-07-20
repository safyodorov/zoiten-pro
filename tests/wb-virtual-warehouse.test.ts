// tests/wb-virtual-warehouse.test.ts
// quick 260720-oh2: виртуальные склады БПЛА (сгоревшие остатки Электросталь/Котовск).

import { describe, it, expect, vi } from "vitest"
import {
  applyBurnedInWay,
  loadVirtualWarehouseIds,
  loadBurnedQtyByNmId,
} from "@/lib/wb-virtual-warehouse"
import type { PrismaClient } from "@prisma/client"

describe("applyBurnedInWay", () => {
  it("вычитает сгоревшее qty из API-значения in-way", () => {
    expect(applyBurnedInWay(6414, 5142)).toBe(1272)
  })

  it("floor на 0 когда сгоревшее больше API-значения", () => {
    expect(applyBurnedInWay(100, 200)).toBe(0)
  })

  it("burnedQty=0 → значение не меняется", () => {
    expect(applyBurnedInWay(100, 0)).toBe(100)
  })
})

describe("loadVirtualWarehouseIds", () => {
  it("возвращает Set id складов с isVirtual=true", async () => {
    const raw = {
      wbWarehouse: {
        findMany: vi.fn(async () => [{ id: 99001 }, { id: 99002 }]),
      },
    }
    const db = raw as unknown as PrismaClient
    const ids = await loadVirtualWarehouseIds(db)
    expect(ids).toEqual(new Set([99001, 99002]))
    expect(raw.wbWarehouse.findMany).toHaveBeenCalledWith({
      where: { isVirtual: true },
      select: { id: true },
    })
  })
})

describe("loadBurnedQtyByNmId", () => {
  it("суммирует quantity по nmId из строк виртуальных складов", async () => {
    const raw = {
      wbCardWarehouseStock: {
        findMany: vi.fn(async () => [
          { quantity: 3, wbCard: { nmId: 100 } },
          { quantity: 4, wbCard: { nmId: 100 } },
          { quantity: 5, wbCard: { nmId: 200 } },
        ]),
      },
    }
    const db = raw as unknown as PrismaClient
    const map = await loadBurnedQtyByNmId(db)
    expect(map.get(100)).toBe(7)
    expect(map.get(200)).toBe(5)
    expect(raw.wbCardWarehouseStock.findMany).toHaveBeenCalledWith({
      where: { warehouse: { isVirtual: true } },
      select: { quantity: true, wbCard: { select: { nmId: true } } },
    })
  })

  it("нет строк на виртуальных складах → пустой Map", async () => {
    const raw = {
      wbCardWarehouseStock: { findMany: vi.fn(async () => []) },
    }
    const db = raw as unknown as PrismaClient
    const map = await loadBurnedQtyByNmId(db)
    expect(map.size).toBe(0)
  })
})

/**
 * Зеркало clean-replace фильтра из app/api/wb-sync/route.ts и
 * app/api/cron/wb-cards-refresh/route.ts (идентичный паттерн в обоих) — проверяет,
 * что виртуальные склады НИКОГДА не попадают в toDeleteIds, даже когда отсутствуют
 * в incoming-ответе API.
 */
function selectToDeleteIds(
  existingRows: Array<{ id: string; warehouseId: number; techSize: string }>,
  incomingKeys: Array<{ warehouseId: number; techSize: string }>,
  virtualIds: Set<number>,
): string[] {
  const incomingSet = new Set(incomingKeys.map((k) => `${k.warehouseId}::${k.techSize}`))
  return existingRows
    .filter(
      (r) => !incomingSet.has(`${r.warehouseId}::${r.techSize}`) && !virtualIds.has(r.warehouseId),
    )
    .map((r) => r.id)
}

describe("clean-replace delete-фильтр (защита виртуальных складов)", () => {
  it("виртуальный склад НЕ попадает в toDeleteIds, даже если отсутствует в incoming", () => {
    const existingRows = [
      { id: "real-1", warehouseId: 686, techSize: "" },
      { id: "virtual-1", warehouseId: 99001, techSize: "" },
    ]
    const incomingKeys: Array<{ warehouseId: number; techSize: string }> = []
    const virtualIds = new Set([99001, 99002])

    const toDelete = selectToDeleteIds(existingRows, incomingKeys, virtualIds)

    expect(toDelete).toEqual(["real-1"])
  })

  it("реальный склад из incoming не удаляется", () => {
    const existingRows = [
      { id: "real-1", warehouseId: 686, techSize: "" },
      { id: "virtual-1", warehouseId: 99001, techSize: "" },
    ]
    const incomingKeys = [{ warehouseId: 686, techSize: "" }]
    const virtualIds = new Set([99001, 99002])

    const toDelete = selectToDeleteIds(existingRows, incomingKeys, virtualIds)

    expect(toDelete).toEqual([])
  })
})
