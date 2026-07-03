// lib/finance-snapshot.ts
// Phase 24 Plan 24-06: ежедневный снапшот остатков (D-01/D-10/D-11/D-13) и дебиторки WB (D-14).
//
// computeStockSnapshotRows — PURE агрегатор Product × 4 локации (тестируется без prisma,
// см. tests/finance-snapshot.test.ts). runFinanceSnapshot (оркестратор prisma +
// lib/wb-finance-api, degraded mode) добавляется отдельной задачей ниже в этом же файле.

export type FinanceStockLocationName =
  | "WB_WAREHOUSE"
  | "WB_IN_WAY_TO_CLIENT"
  | "WB_IN_WAY_FROM_CLIENT"
  | "IVANOVO"

export interface StockSnapshotRowInput {
  productId: string
  sku: string
  name: string
  location: FinanceStockLocationName
  qty: number
  costPriceAtDate: number | null
  valueRub: number | null
}

export interface StockSnapshotProductInput {
  id: string
  sku: string
  name: string
  ivanovoStock: number | null
  costPrice: number | null
  nmIds: number[]
}

export interface WbCardStockInput {
  stockQty: number | null
  inWayToClient: number | null
  inWayFromClient: number | null
}

/**
 * PURE — агрегирует остатки Product × 4 локации (WB_WAREHOUSE / WB_IN_WAY_TO_CLIENT /
 * WB_IN_WAY_FROM_CLIENT / IVANOVO). Суммирует stockQty/inWayToClient/inWayFromClient по
 * всем nmIds товара (nmId без карточки в Map трактуется как 0 — не падает). Строка с
 * qty<=0 не создаётся (экономия объёма). costPrice=null → costPriceAtDate=null,
 * valueRub=null (D-11 — «без оценки»).
 */
export function computeStockSnapshotRows(
  products: StockSnapshotProductInput[],
  wbCardsByNmId: Map<number, WbCardStockInput>,
): StockSnapshotRowInput[] {
  const rows: StockSnapshotRowInput[] = []

  for (const product of products) {
    let wbWarehouseQty = 0
    let inWayToClientQty = 0
    let inWayFromClientQty = 0
    for (const nmId of product.nmIds) {
      const card = wbCardsByNmId.get(nmId)
      if (!card) continue
      wbWarehouseQty += card.stockQty ?? 0
      inWayToClientQty += card.inWayToClient ?? 0
      inWayFromClientQty += card.inWayFromClient ?? 0
    }
    const ivanovoQty = product.ivanovoStock ?? 0

    const locations: Array<[FinanceStockLocationName, number]> = [
      ["WB_WAREHOUSE", wbWarehouseQty],
      ["WB_IN_WAY_TO_CLIENT", inWayToClientQty],
      ["WB_IN_WAY_FROM_CLIENT", inWayFromClientQty],
      ["IVANOVO", ivanovoQty],
    ]

    for (const [location, qty] of locations) {
      if (qty <= 0) continue
      const costPriceAtDate = product.costPrice ?? null
      const valueRub =
        costPriceAtDate != null ? Math.round(qty * costPriceAtDate * 100) / 100 : null
      rows.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        location,
        qty,
        costPriceAtDate,
        valueRub,
      })
    }
  }

  return rows
}
