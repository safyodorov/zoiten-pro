// app/api/wb-sync/route.ts
// POST /api/wb-sync — синхронизация карточек с Wildberries
export const runtime = "nodejs"
export const maxDuration = 300

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import {
  fetchAllCards,
  parseCard,
  fetchAllPrices,
  fetchWbDiscounts,
  fetchStandardCommissions,
  fetchStocks,
  fetchBuyoutPercent,
  fetchAvgSalesSpeed7d,
  fetchStocksPerWarehouse,
  type WarehouseStockItem,
} from "@/lib/wb-api"

/**
 * Генерирует стабильный числовой ID для склада по его имени.
 * Используется когда Statistics API возвращает только warehouseName (без числового id).
 * Диапазон: 10_000_001..18_446_744 — не пересекается с реальными WB warehouseId (< 1_000_000).
 * Алгоритм: djb2 hash → Math.abs → 10_000_001 + (hash % 8_446_744).
 */
function stableWarehouseIdFromName(name: string): number {
  let hash = 5381
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) + hash) ^ name.charCodeAt(i)
    hash = hash >>> 0 // unsigned 32-bit
  }
  return 10_000_001 + (hash % 8_446_744)
}

export async function POST(): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }

  try {
    // 1. Карточки из Content API
    const rawCards = await fetchAllCards()

    if (rawCards.length === 0) {
      return NextResponse.json({ synced: 0, message: "Карточки не найдены в WB API" })
    }

    // 2. Цены из Prices API
    const priceMap = await fetchAllPrices()

    // 3. Стандартные комиссии из Tariffs API
    const commMap = await fetchStandardCommissions()

    // 4. ИУ комиссии из БД
    const iuList = await prisma.wbCommissionIu.findMany()
    const iuMap = new Map(iuList.map((iu) => [iu.subjectName, { fbw: iu.fbw, fbs: iu.fbs }]))

    // 5. Остатки из Statistics API
    const stockMap = await fetchStocks()

    // 6. Процент выкупа из Analytics API
    const nmIds = rawCards.map((c) => c.nmID)
    const buyoutMap = await fetchBuyoutPercent(nmIds)

    // 6a. Phase 14 (STOCK-07, STOCK-08): per-warehouse остатки из Statistics API
    // DEVIATION: Statistics API вместо Analytics API (base token 403 на Analytics)
    // Один запрос возвращает ВСЕ данные — degraded mode при failure
    let stocksPerWarehouse = new Map<number, WarehouseStockItem[]>()
    try {
      stocksPerWarehouse = await fetchStocksPerWarehouse(nmIds)
      console.log(`[wb-sync] Получено per-warehouse остатков для ${stocksPerWarehouse.size} nmIds`)
    } catch (e) {
      console.warn("[wb-sync] fetchStocksPerWarehouse failed, skipping per-warehouse update:", e)
    }

    // 7. СПП из Sales API (ретроспектива; актуальные через кнопку «Скидка WB»)
    const discountMap = await fetchWbDiscounts(nmIds)

    // 8. Phase 7 (D-09): скорость заказов за 7 дней + заказы вчера
    //    Degraded mode — если Orders API недоступен, поля останутся null,
    //    основной sync не ломается.
    let ordersStatsMap = new Map<
      number,
      { avg7d: number; yesterday: number }
    >()
    try {
      ordersStatsMap = await fetchAvgSalesSpeed7d(nmIds)
    } catch (e) {
      console.error("fetchAvgSalesSpeed7d failed:", e)
    }

    let synced = 0
    const errors: string[] = []

    // 8. Обрабатываем каждую карточку
    for (const raw of rawCards) {
      try {
        const card = parseCard(raw)
        const priceData = priceMap.get(card.nmId)
        const discountWb = discountMap.get(card.nmId) ?? null
        const price = priceData?.discountedPrice ?? null
        const priceBeforeDiscount = priceData?.priceBeforeDiscount ?? null
        const sellerDiscount = priceData?.sellerDiscount ?? null
        const clubDiscount = priceData?.clubDiscount ?? null
        const stockQty = stockMap.get(card.nmId) ?? null
        const buyoutPct = buyoutMap.get(card.nmId) ?? null
        const ordersStats = ordersStatsMap.get(card.nmId)
        const avgSalesSpeed7d = ordersStats?.avg7d ?? null
        const ordersYesterday = ordersStats?.yesterday ?? null

        const stdComm = commMap.get(raw.subjectID)
        const iuComm = card.category ? iuMap.get(card.category) : undefined

        await prisma.wbCard.upsert({
          where: { nmId: card.nmId },
          update: {
            article: card.article,
            name: card.name,
            brand: card.brand,
            category: card.category,
            photoUrl: card.photoUrl,
            photos: card.photos,
            hasVideo: card.hasVideo,
            barcode: card.barcode,
            barcodes: card.barcodes,
            weightKg: card.weightKg,
            heightCm: card.heightCm,
            widthCm: card.widthCm,
            depthCm: card.depthCm,
            priceBeforeDiscount,
            sellerDiscount,
            price,
            discountWb,
            clubDiscount,
            stockQty,
            buyoutPercent: buyoutPct,
            avgSalesSpeed7d,
            ordersYesterday,
            commFbwStd: stdComm?.fbw ?? null,
            commFbsStd: stdComm?.fbs ?? null,
            commFbwIu: iuComm?.fbw ?? null,
            commFbsIu: iuComm?.fbs ?? null,
            label: card.tags.length > 0 ? card.tags.join(", ") : undefined,
            rawJson: JSON.parse(JSON.stringify(raw)),
            updatedAt: new Date(),
          },
          create: {
            nmId: card.nmId,
            article: card.article,
            name: card.name,
            brand: card.brand,
            category: card.category,
            photoUrl: card.photoUrl,
            photos: card.photos,
            hasVideo: card.hasVideo,
            barcode: card.barcode,
            barcodes: card.barcodes,
            weightKg: card.weightKg,
            heightCm: card.heightCm,
            widthCm: card.widthCm,
            depthCm: card.depthCm,
            priceBeforeDiscount,
            sellerDiscount,
            price,
            discountWb,
            clubDiscount,
            stockQty,
            buyoutPercent: buyoutPct,
            avgSalesSpeed7d,
            ordersYesterday,
            commFbwStd: stdComm?.fbw ?? null,
            commFbsStd: stdComm?.fbs ?? null,
            commFbwIu: iuComm?.fbw ?? null,
            commFbsIu: iuComm?.fbs ?? null,
            label: card.tags.length > 0 ? card.tags.join(", ") : null,
            rawJson: JSON.parse(JSON.stringify(raw)),
          },
        })

        synced++
      } catch (err) {
        errors.push(`nmID ${raw.nmID}: ${(err as Error).message}`)
      }
    }

    // Phase 14 (STOCK-08, STOCK-10): clean-replace per-warehouse stocks
    // Выполняется после основного цикла upsert карточек — все WbCard уже в БД
    if (stocksPerWarehouse.size > 0) {
      try {
        await prisma.$transaction(
          async (tx) => {
            for (const [nmId, warehouseItems] of stocksPerWarehouse.entries()) {
              const card = await tx.wbCard.findUnique({
                where: { nmId },
                select: { id: true },
              })
              if (!card) continue

              const incomingWarehouseIds: number[] = []

              // Auto-insert неизвестных складов (STOCK-10) + upsert остатков
              for (const item of warehouseItems) {
                // Сначала ищем склад ПО ИМЕНИ — seed (Plan 14-02) создал 75 складов
                // с синтетическими ID 90001-90067 ИЛИ реальными WB ID (Коледино=507 и т.п.).
                // Использование stableWarehouseIdFromName напрямую создало бы дубли.
                const existingByName = await tx.wbWarehouse.findFirst({
                  where: { name: item.warehouseName },
                  select: { id: true },
                })

                let warehouseId: number
                if (existingByName) {
                  warehouseId = existingByName.id
                } else {
                  // Склад неизвестен — генерируем stable ID через hash и создаём
                  warehouseId = stableWarehouseIdFromName(item.warehouseName)
                  console.warn(
                    `[wb-sync] Auto-insert неизвестный склад: id=${warehouseId} name="${item.warehouseName}"`,
                  )
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

                incomingWarehouseIds.push(warehouseId)

                await tx.wbCardWarehouseStock.upsert({
                  where: {
                    wbCardId_warehouseId: {
                      wbCardId: card.id,
                      warehouseId,
                    },
                  },
                  create: {
                    wbCardId: card.id,
                    warehouseId,
                    quantity: item.quantity,
                  },
                  update: {
                    quantity: item.quantity,
                  },
                })
              }

              // Clean: удалить склады которых нет в текущем ответе API
              if (incomingWarehouseIds.length > 0) {
                await tx.wbCardWarehouseStock.deleteMany({
                  where: {
                    wbCardId: card.id,
                    NOT: { warehouseId: { in: incomingWarehouseIds } },
                  },
                })
              }

              // Денормализация WbCard.stockQty = SUM(quantity) для backward compat /prices/wb
              const totalQty = warehouseItems.reduce((sum, w) => sum + w.quantity, 0)
              await tx.wbCard.update({
                where: { id: card.id },
                data: { stockQty: totalQty },
              })
            }
          },
          { timeout: 60_000 }, // транзакция может быть длинной — 60s timeout
        )
        console.log(
          `[wb-sync] Обновлено per-warehouse остатков для ${stocksPerWarehouse.size} wbCards`,
        )
      } catch (e) {
        console.error("[wb-sync] Per-warehouse transaction failed:", e)
        errors.push(`per-warehouse-stocks: ${(e as Error).message}`)
      }
    }

    return NextResponse.json({
      synced,
      total: rawCards.length,
      pricesLoaded: priceMap.size,
      discountsLoaded: discountMap.size,
      warehouseStocksUpdated: stocksPerWarehouse.size,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    })
  } catch (e) {
    console.error("WB sync error:", e)
    return NextResponse.json(
      { error: (e as Error).message || "Ошибка синхронизации" },
      { status: 500 }
    )
  }
}
