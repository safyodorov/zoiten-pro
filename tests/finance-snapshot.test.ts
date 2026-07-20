// tests/finance-snapshot.test.ts
// Phase 24 Plan 24-06: pure computeStockSnapshotRows — Product × 4 локации (D-01/D-10/D-11/D-13).
// PURE — без моков prisma.

import { describe, it, expect } from "vitest"
import { computeStockSnapshotRows } from "@/lib/finance-snapshot"

describe("computeStockSnapshotRows", () => {
  it("aggregates qty across nmIds per location + computes valueRub from costPrice", () => {
    const products = [
      {
        id: "p1",
        sku: "УКТ-000001",
        name: "Товар 1",
        ivanovoStock: 7,
        costPrice: 100,
        nmIds: [1, 2],
      },
    ]
    const wbCardsByNmId = new Map([
      [1, { stockQty: 10, inWayToClient: 3, inWayFromClient: 1 }],
      [2, { stockQty: 5, inWayToClient: 0, inWayFromClient: 0 }],
    ])

    const rows = computeStockSnapshotRows(products, wbCardsByNmId)

    expect(rows).toEqual([
      { productId: "p1", sku: "УКТ-000001", name: "Товар 1", location: "WB_WAREHOUSE", qty: 15, costPriceAtDate: 100, valueRub: 1500 },
      { productId: "p1", sku: "УКТ-000001", name: "Товар 1", location: "WB_IN_WAY_TO_CLIENT", qty: 3, costPriceAtDate: 100, valueRub: 300 },
      { productId: "p1", sku: "УКТ-000001", name: "Товар 1", location: "WB_IN_WAY_FROM_CLIENT", qty: 1, costPriceAtDate: 100, valueRub: 100 },
      { productId: "p1", sku: "УКТ-000001", name: "Товар 1", location: "IVANOVO", qty: 7, costPriceAtDate: 100, valueRub: 700 },
    ])
  })

  it("costPrice=null → costPriceAtDate=null, valueRub=null (D-11)", () => {
    const products = [
      {
        id: "p2",
        sku: "УКТ-000002",
        name: "Товар без себестоимости",
        ivanovoStock: 5,
        costPrice: null,
        nmIds: [],
      },
    ]
    const rows = computeStockSnapshotRows(products, new Map())

    expect(rows).toEqual([
      {
        productId: "p2",
        sku: "УКТ-000002",
        name: "Товар без себестоимости",
        location: "IVANOVO",
        qty: 5,
        costPriceAtDate: null,
        valueRub: null,
      },
    ])
  })

  it("location with qty=0 does not create a row", () => {
    const products = [
      {
        id: "p3",
        sku: "УКТ-000003",
        name: "Товар только на Иваново",
        ivanovoStock: 0,
        costPrice: 50,
        nmIds: [10],
      },
    ]
    const wbCardsByNmId = new Map([
      [10, { stockQty: 0, inWayToClient: 0, inWayFromClient: 2 }],
    ])

    const rows = computeStockSnapshotRows(products, wbCardsByNmId)

    expect(rows).toEqual([
      {
        productId: "p3",
        sku: "УКТ-000003",
        name: "Товар только на Иваново",
        location: "WB_IN_WAY_FROM_CLIENT",
        qty: 2,
        costPriceAtDate: 50,
        valueRub: 100,
      },
    ])
  })

  it("product without nmIds and ivanovoStock=null → 0 rows", () => {
    const products = [
      {
        id: "p4",
        sku: "УКТ-000004",
        name: "Пустой товар",
        ivanovoStock: null,
        costPrice: 20,
        nmIds: [],
      },
    ]
    const rows = computeStockSnapshotRows(products, new Map())
    expect(rows).toEqual([])
  })

  it("nmId missing from wbCardsByNmId Map is treated as 0 (not crashing)", () => {
    const products = [
      {
        id: "p5",
        sku: "УКТ-000005",
        name: "Товар с пропавшей карточкой",
        ivanovoStock: null,
        costPrice: 10,
        nmIds: [999],
      },
    ]
    const rows = computeStockSnapshotRows(products, new Map())
    expect(rows).toEqual([])
  })

  // quick 260720-oh2: WB_BURNED — сгоревшие остатки БПЛА (Электросталь/Котовск)
  it("nmId в burnedQtyByNmId → эмитит строку WB_BURNED (qty × costPrice)", () => {
    const products = [
      {
        id: "p6",
        sku: "УКТ-000006",
        name: "Товар со сгоревшим остатком",
        ivanovoStock: null,
        costPrice: 100,
        nmIds: [500],
      },
    ]
    const wbCardsByNmId = new Map([[500, { stockQty: 2, inWayToClient: 0, inWayFromClient: 0 }]])
    const burnedQtyByNmId = new Map([[500, 5]])

    const rows = computeStockSnapshotRows(products, wbCardsByNmId, burnedQtyByNmId)

    expect(rows).toEqual([
      { productId: "p6", sku: "УКТ-000006", name: "Товар со сгоревшим остатком", location: "WB_WAREHOUSE", qty: 2, costPriceAtDate: 100, valueRub: 200 },
      { productId: "p6", sku: "УКТ-000006", name: "Товар со сгоревшим остатком", location: "WB_BURNED", qty: 5, costPriceAtDate: 100, valueRub: 500 },
    ])
  })

  it("без сгоревшего (burnedQtyByNmId по умолчанию пустой) → строки WB_BURNED нет", () => {
    const products = [
      {
        id: "p7",
        sku: "УКТ-000007",
        name: "Товар без сгоревшего остатка",
        ivanovoStock: null,
        costPrice: 100,
        nmIds: [501],
      },
    ]
    const wbCardsByNmId = new Map([[501, { stockQty: 3, inWayToClient: 0, inWayFromClient: 0 }]])

    // Обратная совместимость: старая 2-арг сигнатура (см. scripts/bootstrap-balance-snapshot.ts)
    const rows = computeStockSnapshotRows(products, wbCardsByNmId)

    expect(rows.some((r) => r.location === "WB_BURNED")).toBe(false)
  })
})
