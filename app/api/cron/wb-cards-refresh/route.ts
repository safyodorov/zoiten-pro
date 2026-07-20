// app/api/cron/wb-cards-refresh/route.ts
// GET — daily refresh «горячих» WbCard полей: stockQty, in-way, prices, СПП.
// По умолчанию 05:30 МСК через dispatcher (после wb-prices-daily 05:10).
// Защищён x-cron-secret == process.env.CRON_SECRET.
//
// Делает минимальный subset того, что делает /api/wb-sync:
//  • Statistics API /supplier/stocks (per-warehouse) — stockQty, inWay*, WbCardWarehouseStock
//  • Prices API — price, priceBeforeDiscount, sellerDiscount, clubDiscount
//  • curl v4 (card.wb.ru) — discountWb (СПП) + wbStoreRating/wbStoreFeedbacks
//
// НЕ делает:
//  • Content API (vendorCode/photos/категория редко меняются — manual sync)
//  • Tariffs API (ставки комиссий редко меняются)
//  • Analytics API (3/UTC-сутки cap — не тратим)
//  • Orders API (своё cron'ы wb-orders-daily / wb-funnel-daily)
//  • Soft-delete карточек (без Content API нечем верифицировать present-set)
//
// 2026-05-21

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import {
  fetchAllPrices,
  fetchWbDiscounts,
  fetchStocksPerWarehouse,
  type WarehouseStockItem,
} from "@/lib/wb-api"
import { getMskTodayString } from "@/lib/wb-cron-schedule"
import {
  loadVirtualWarehouseIds,
  loadBurnedQtyByNmId,
  applyBurnedInWay,
} from "@/lib/wb-virtual-warehouse"

export const runtime = "nodejs"
export const maxDuration = 600

/** Стабильный hash имени склада (см. /api/wb-sync для контекста). */
function stableWarehouseIdFromName(name: string): number {
  let hash = 5381
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) + hash) ^ name.charCodeAt(i)
    hash = hash >>> 0
  }
  return 10_000_001 + (hash % 8_446_744)
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const errors: string[] = []
  const todayStr = getMskTodayString()

  // 1. Список активных nmIds из БД (Content API не зовём — берём всё что уже есть)
  const cards = await prisma.wbCard.findMany({
    where: { deletedAt: null },
    select: { id: true, nmId: true },
  })
  if (cards.length === 0) {
    await prisma.appSetting.upsert({
      where: { key: "wbCardsRefreshLastRun" },
      create: { key: "wbCardsRefreshLastRun", value: todayStr },
      update: { value: todayStr },
    })
    return NextResponse.json({ ok: true, message: "Карточки не найдены в БД" })
  }
  const nmIds = cards.map((c) => c.nmId)
  const cardIdByNmId = new Map(cards.map((c) => [c.nmId, c.id]))

  // 2. Prices API
  let priceMap = new Map<number, import("@/lib/wb-api").PriceData>()
  let pricesOk = false
  try {
    priceMap = await fetchAllPrices()
    pricesOk = true
  } catch (e) {
    errors.push(`Prices API: ${(e as Error).message}`)
  }

  // 3. Statistics API (per-warehouse stocks)
  let stocksPerWarehouse = new Map<number, WarehouseStockItem[]>()
  let stocksOk = false
  try {
    stocksPerWarehouse = await fetchStocksPerWarehouse(nmIds)
    stocksOk = true
  } catch (e) {
    errors.push(`Statistics API stocks: ${(e as Error).message}`)
  }

  // 4. curl v4 — СПП + рейтинг витрины
  const storefront = {
    ratings: new Map<number, number>(),
    feedbacks: new Map<number, number>(),
  }
  const discountMap = await fetchWbDiscounts(nmIds, undefined, storefront)

  // 5. Update WbCard fields (без upsert — карточка обязательно есть в БД)
  let cardsUpdated = 0
  for (const nmId of nmIds) {
    const updateData: Prisma.WbCardUpdateInput = {
      discountWb: discountMap.get(nmId) ?? null,
      wbStoreRating: storefront.ratings.get(nmId) ?? null,
      wbStoreFeedbacks: storefront.feedbacks.get(nmId) ?? null,
      updatedAt: new Date(),
    }
    if (pricesOk) {
      const pd = priceMap.get(nmId)
      updateData.priceBeforeDiscount = pd?.priceBeforeDiscount ?? null
      updateData.sellerDiscount = pd?.sellerDiscount ?? null
      updateData.price = pd?.discountedPrice ?? null
      updateData.clubDiscount = pd?.clubDiscount ?? null
    }
    try {
      await prisma.wbCard.update({ where: { nmId }, data: updateData })
      cardsUpdated++
    } catch (e) {
      errors.push(`update nmId=${nmId}: ${(e as Error).message}`)
    }
  }

  // 6. Per-warehouse upsert + денормализация stockQty/inWay* на WbCard
  let warehousesUpdated = 0
  if (stocksOk && stocksPerWarehouse.size > 0) {
    try {
      // quick 260720-oh2: виртуальные склады БПЛА (сгоревшие остатки Электросталь/
      // Котовск) защищены от clean-replace + вычитаются из inWayFromClient.
      const virtualIds = await loadVirtualWarehouseIds(prisma)
      const burnedByNmId = await loadBurnedQtyByNmId(prisma)
      await prisma.$transaction(
        async (tx) => {
          for (const [nmId, warehouseItems] of stocksPerWarehouse.entries()) {
            const wbCardId = cardIdByNmId.get(nmId)
            if (!wbCardId) continue

            const incomingKeys: Array<{ warehouseId: number; techSize: string }> = []

            for (const item of warehouseItems) {
              const existingByName = await tx.wbWarehouse.findFirst({
                where: { name: item.warehouseName },
                select: { id: true },
              })
              let warehouseId: number
              if (existingByName) {
                warehouseId = existingByName.id
              } else {
                warehouseId = stableWarehouseIdFromName(item.warehouseName)
                await tx.wbWarehouse.create({
                  data: {
                    id: warehouseId,
                    name: item.warehouseName,
                    cluster: "Прочие склады",
                    shortCluster: "Прочие",
                    isActive: true,
                    needsClusterReview: true,
                  },
                })
              }

              const techSize = item.techSize || ""
              await tx.wbCardWarehouseStock.upsert({
                where: {
                  wbCardId_warehouseId_techSize: {
                    wbCardId,
                    warehouseId,
                    techSize,
                  },
                },
                create: {
                  wbCardId,
                  warehouseId,
                  techSize,
                  quantity: item.quantity,
                },
                update: { quantity: item.quantity },
              })
              incomingKeys.push({ warehouseId, techSize })
            }

            // Clean-replace: удалить per-warehouse строки которых больше нет в ответе
            if (incomingKeys.length > 0) {
              const existing = await tx.wbCardWarehouseStock.findMany({
                where: { wbCardId },
                select: { id: true, warehouseId: true, techSize: true },
              })
              const incomingSet = new Set(
                incomingKeys.map((k) => `${k.warehouseId}::${k.techSize}`),
              )
              // quick 260720-oh2: виртуальные склады БПЛА (сгоревшие остатки) защищены
              // от clean-replace — отсутствуют в ответе API, но не должны удаляться.
              const toDeleteIds = existing
                .filter(
                  (r) =>
                    !incomingSet.has(`${r.warehouseId}::${r.techSize}`) &&
                    !virtualIds.has(r.warehouseId),
                )
                .map((r) => r.id)
              if (toDeleteIds.length > 0) {
                await tx.wbCardWarehouseStock.deleteMany({
                  where: { id: { in: toDeleteIds } },
                })
              }
            }

            // Денормализованные totals на WbCard
            const totalStock = warehouseItems.reduce((s, w) => s + w.quantity, 0)
            const totalInWayTo = warehouseItems.reduce(
              (s, w) => s + w.inWayToClient,
              0,
            )
            const totalInWayFrom = warehouseItems.reduce(
              (s, w) => s + w.inWayFromClient,
              0,
            )
            // quick 260720-oh2: вычитаем сгоревшие БПЛА-остатки из «в пути от клиента».
            await tx.wbCard.update({
              where: { id: wbCardId },
              data: {
                stockQty: totalStock,
                inWayToClient: totalInWayTo,
                inWayFromClient: applyBurnedInWay(totalInWayFrom, burnedByNmId.get(nmId) ?? 0),
              },
            })
            warehousesUpdated++
          }
        },
        { timeout: 120_000 },
      )
    } catch (e) {
      errors.push(`per-warehouse tx: ${(e as Error).message}`)
    }
  }

  await prisma.appSetting.upsert({
    where: { key: "wbCardsRefreshLastRun" },
    create: { key: "wbCardsRefreshLastRun", value: todayStr },
    update: { value: todayStr },
  })

  console.log(
    `[cron wb-cards-refresh] cards=${cardsUpdated}/${cards.length} warehouses=${warehousesUpdated} prices=${pricesOk ? priceMap.size : "FAIL"} stocks=${stocksOk ? stocksPerWarehouse.size : "FAIL"} discounts=${discountMap.size} errors=${errors.length}`,
  )

  return NextResponse.json({
    ok: true,
    cardsTotal: cards.length,
    cardsUpdated,
    warehousesUpdated,
    pricesLoaded: pricesOk ? priceMap.size : null,
    stocksLoaded: stocksOk ? stocksPerWarehouse.size : null,
    discountsLoaded: discountMap.size,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    date: todayStr,
  })
}
