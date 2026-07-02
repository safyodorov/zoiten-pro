// lib/production-sync.ts
// Quick 260702-j52: денормализатор ProductIncoming.orderedQty из открытых закупок.
//
// «Производство» в /stock и /purchase-plan становится machine-managed:
// Σ max(0, PurchaseItem.quantity − qty этапа WAREHOUSE) по закупкам со
// статусом PLANNED|ACTIVE. Частичная приёмка (WAREHOUSE) сразу уменьшает
// количество, не дожидаясь закрытия закупки (COMPLETED).
//
// ВАЖНО: НЕ импортировать `@/lib/prisma` (runtime) — scripts/recompute-production.ts
// запускается через tsx, который не резолвит alias `@/*`. PrismaClient передаётся
// вызывающей стороной (DI): server actions передают singleton `@/lib/prisma`,
// скрипт — свой `new PrismaClient()`.

import type { PrismaClient } from "@prisma/client"

const OPEN_PURCHASE_STATUSES = ["PLANNED", "ACTIVE"] as const

/**
 * Чистая функция-агрегатор: Σ max(0, quantity − warehouseQty) per productId.
 * Клампит отрицательные остатки (кривые данные — WAREHOUSE.qty > quantity) в 0.
 */
export function computeProductionTotals(
  items: Array<{ productId: string; quantity: number; warehouseQty: number }>
): Map<string, number> {
  const totals = new Map<string, number>()
  for (const it of items) {
    const remaining = Math.max(0, it.quantity - it.warehouseQty)
    totals.set(it.productId, (totals.get(it.productId) ?? 0) + remaining)
  }
  return totals
}

/**
 * Пересчитывает ProductIncoming.orderedQty для переданных productId из
 * открытых закупок (PLANNED+ACTIVE). Пишет ТОЛЬКО orderedQty — expectedDate
 * и plannedSalesPerDay не трогаются (сохраняются как есть).
 */
export async function recomputeProductionForProducts(
  db: PrismaClient,
  productIds: string[]
): Promise<void> {
  const ids = [...new Set(productIds.filter(Boolean))]
  if (ids.length === 0) return

  const items = await db.purchaseItem.findMany({
    where: {
      productId: { in: ids },
      purchase: { status: { in: [...OPEN_PURCHASE_STATUSES] } },
    },
    select: {
      productId: true,
      quantity: true,
      stages: { where: { stage: "WAREHOUSE" }, select: { quantity: true } },
    },
  })

  const totals = computeProductionTotals(
    items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      warehouseQty: i.stages[0]?.quantity ?? 0,
    }))
  )

  // Seed нулями: товар выпал из всех открытых закупок → orderedQty=0.
  for (const id of ids) {
    if (!totals.has(id)) totals.set(id, 0)
  }

  for (const [productId, orderedQty] of totals) {
    await db.productIncoming.upsert({
      where: { productId },
      create: { productId, orderedQty },
      update: { orderedQty },
    })
  }
}

/**
 * Пересчитывает ProductIncoming.orderedQty для ВСЕХ товаров: union существующих
 * ProductIncoming (чтобы обнулить устаревшие ручные значения) и товаров с открытыми
 * закупками. Используется в одноразовом миграционном скрипте.
 */
export async function recomputeAllProduction(db: PrismaClient): Promise<void> {
  const [incomingRows, openItemRows] = await Promise.all([
    db.productIncoming.findMany({ select: { productId: true } }),
    db.purchaseItem.findMany({
      where: { purchase: { status: { in: [...OPEN_PURCHASE_STATUSES] } } },
      select: { productId: true },
    }),
  ])

  const unionIds = [
    ...new Set([
      ...incomingRows.map((r) => r.productId),
      ...openItemRows.map((r) => r.productId),
    ]),
  ]

  await recomputeProductionForProducts(db, unionIds)
}
