// app/api/wb-sync/route.ts
// POST /api/wb-sync — синхронизация карточек с Wildberries
export const runtime = "nodejs"
export const maxDuration = 300

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"
import {
  fetchAllCards,
  parseCard,
  fetchAllPrices,
  fetchWbDiscounts,
  fetchStandardCommissions,
  fetchStocks,
  fetchBuyoutPercent,
  fetchOrdersPerWarehouse,
  type OrdersWarehouseStats,
  fetchStocksPerWarehouse,
  type WarehouseStockItem,
  WbRateLimitError,
} from "@/lib/wb-api"

/**
 * Информация о каждом упавшем external-API во время sync.
 * UI читает `failures[]` и показывает warning toast с retry-after.
 */
interface SyncFailure {
  endpoint: string
  /** Какие поля БД не обновились из-за этого провала. */
  fields: string[]
  /** Секунды до восстановления (из X-Ratelimit-Retry для 429). null для не-rate-limit ошибок. */
  retryAfterSec: number | null
  message: string
}

function recordFailure(
  failures: SyncFailure[],
  endpoint: string,
  fields: string[],
  e: unknown,
): void {
  const err = e as Error
  failures.push({
    endpoint,
    fields,
    retryAfterSec: e instanceof WbRateLimitError ? e.retryAfterSec : null,
    message: err?.message ?? String(e),
  })
  console.error(`[wb-sync] ${endpoint} failed → пропускаем ${fields.join(", ")}:`, e)
}

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

    // Флаги доступности данных от внешних API.
    // При ошибке API (429, network, etc.) фетчер бросает — мы ловим здесь
    // и НЕ включаем поле в upsert.update, чтобы не затирать БД нулями.
    // Prisma игнорирует поля, которые не переданы в update — старые значения сохраняются.
    //
    // 2026-05-12: failures[] собирает rate-limit ошибки с X-Ratelimit-Retry,
    // route возвращает их UI'ю — пользователь видит «WB просит подождать X сек»,
    // а не ложный «успех».
    const failures: SyncFailure[] = []

    // 2. Цены из Prices API
    let priceMap = new Map<number, import("@/lib/wb-api").PriceData>()
    let pricesOk = false
    try {
      priceMap = await fetchAllPrices()
      pricesOk = true
    } catch (e) {
      recordFailure(failures, "Prices API", ["price", "priceBeforeDiscount", "sellerDiscount", "clubDiscount"], e)
    }

    // 3. Стандартные комиссии из Tariffs API
    let commMap = new Map<number, { fbw: number; fbs: number }>()
    let commissionsOk = false
    try {
      commMap = await fetchStandardCommissions()
      commissionsOk = true
    } catch (e) {
      recordFailure(failures, "Tariffs API", ["commFbwStd", "commFbsStd"], e)
    }

    // 4. ИУ комиссии из БД
    const iuList = await prisma.wbCommissionIu.findMany()
    const iuMap = new Map(iuList.map((iu) => [iu.subjectName, { fbw: iu.fbw, fbs: iu.fbs }]))

    // 5. Остатки из Statistics API
    let stockMap = new Map<number, number>()
    let stocksOk = false
    try {
      stockMap = await fetchStocks()
      stocksOk = true
    } catch (e) {
      recordFailure(failures, "Statistics API (stocks)", ["stockQty"], e)
    }

    // 6. Процент выкупа из Analytics API
    // fetchBuyoutPercent возвращает пустой Map и НЕ бросает в двух кейсах:
    //   (а) дневной cap 3/день исчерпан (checkAndIncrementAnalyticsCounter)
    //   (б) Analytics успешно вернул пустой отчёт (новый продавец / нет продаж)
    // В обоих случаях buyoutMap.size === 0 → buyoutOk=false → поле пропускается в upsert,
    // существующие значения сохраняются (как и для других API failure кейсов).
    const nmIds = rawCards.map((c) => c.nmID)
    let buyoutMap = new Map<number, number>()
    let buyoutOk = false
    try {
      buyoutMap = await fetchBuyoutPercent(nmIds)
      buyoutOk = buyoutMap.size > 0
    } catch (e) {
      recordFailure(failures, "Analytics API (buyout)", ["buyoutPercent"], e)
    }

    // 6a. Phase 14 (STOCK-07, STOCK-08): per-warehouse остатки из Statistics API
    // DEVIATION: Statistics API вместо Analytics API (base token 403 на Analytics)
    // Один запрос возвращает ВСЕ данные — degraded mode при failure
    let stocksPerWarehouse = new Map<number, WarehouseStockItem[]>()
    try {
      stocksPerWarehouse = await fetchStocksPerWarehouse(nmIds)
      console.log(`[wb-sync] Получено per-warehouse остатков для ${stocksPerWarehouse.size} nmIds`)
    } catch (e) {
      recordFailure(failures, "Statistics API (per-warehouse stocks)", ["WbCardWarehouseStock", "inWayToClient", "inWayFromClient"], e)
    }

    // 7. СПП из Sales API (ретроспектива; актуальные через кнопку «Скидка WB»)
    // fetchWbDiscounts деградирует тихо (curl + fallback), не бросает при 429
    const discountMap = await fetchWbDiscounts(nmIds)

    // 8. Phase 7 (D-09) + Phase 15 (ORDERS-02): заказы за 7 дней — per-card avg/yesterday + per-warehouse breakdown.
    // Один запрос к Orders API (rate limit ~1 req/min) покрывает обе задачи.
    // Degraded mode — если Orders API недоступен, поля НЕ включаются в upsert.update.
    let ordersPerWarehouseMap = new Map<number, OrdersWarehouseStats>()
    let ordersOk = false
    try {
      ordersPerWarehouseMap = await fetchOrdersPerWarehouse(nmIds, 7)
      ordersOk = true
    } catch (e) {
      recordFailure(failures, "Orders API (per-warehouse)", ["avgSalesSpeed7d", "ordersYesterday", "WbCardWarehouseOrders"], e)
    }

    let synced = 0
    const errors: string[] = []

    // Обрабатываем каждую карточку
    for (const raw of rawCards) {
      try {
        const card = parseCard(raw)
        const iuComm = card.category ? iuMap.get(card.category) : undefined

        // Базовые поля из Content API — всегда присутствуют (fetchAllCards не упал)
        const updateData: Prisma.WbCardUpdateInput = {
          article: card.article,
          // Phase 260514-mci: id imt-склейки для агрегации рейтингов
          imtId: card.imtId,
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
          discountWb: discountMap.get(card.nmId) ?? null,
          label: card.tags.length > 0 ? card.tags.join(", ") : undefined,
          rawJson: JSON.parse(JSON.stringify(raw)),
          // Phase 17: нормализованные characteristics + techSizes из WB Content API
          characteristics:
            card.characteristics === null
              ? Prisma.DbNull
              : (JSON.parse(JSON.stringify(card.characteristics)) as never),
          techSizes: card.techSizes,
          updatedAt: new Date(),
        }

        // Ценовые поля — только если Prices API ответил успешно
        if (pricesOk) {
          const priceData = priceMap.get(card.nmId)
          updateData.priceBeforeDiscount = priceData?.priceBeforeDiscount ?? null
          updateData.sellerDiscount = priceData?.sellerDiscount ?? null
          updateData.price = priceData?.discountedPrice ?? null
          updateData.clubDiscount = priceData?.clubDiscount ?? null
        }

        // Остатки — только если Statistics API ответил успешно
        if (stocksOk) {
          updateData.stockQty = stockMap.get(card.nmId) ?? null
        }

        // Процент выкупа — только если Analytics API ответил успешно
        // (buyoutOk=true включает кейс "дневной cap" — buyoutMap может быть пустым, это норма)
        if (buyoutOk) {
          updateData.buyoutPercent = buyoutMap.get(card.nmId) ?? null
        }

        // Стандартные комиссии — только если Tariffs API ответил успешно
        if (commissionsOk) {
          const stdComm = commMap.get(raw.subjectID)
          updateData.commFbwStd = stdComm?.fbw ?? null
          updateData.commFbsStd = stdComm?.fbs ?? null
        }

        // ИУ комиссии всегда берутся из БД (не из внешнего API)
        updateData.commFbwIu = iuComm?.fbw ?? null
        updateData.commFbsIu = iuComm?.fbs ?? null

        // Данные заказов — только если Orders API ответил успешно
        if (ordersOk) {
          const ordersStats = ordersPerWarehouseMap.get(card.nmId)
          updateData.avgSalesSpeed7d = ordersStats?.avg ?? null
          updateData.ordersYesterday = ordersStats?.yesterday ?? null
        }

        // create объект — те же поля что и update, но без undefined-ов (Prisma create не принимает undefined)
        // При создании новой карточки недоступные поля останутся NULL (schema default)
        const createData: Prisma.WbCardCreateInput = {
          nmId: card.nmId,
          // Phase 260514-mci: id imt-склейки для агрегации рейтингов
          imtId: card.imtId,
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
          discountWb: discountMap.get(card.nmId) ?? null,
          label: card.tags.length > 0 ? card.tags.join(", ") : null,
          rawJson: JSON.parse(JSON.stringify(raw)),
          characteristics:
            card.characteristics === null
              ? Prisma.DbNull
              : (JSON.parse(JSON.stringify(card.characteristics)) as never),
          techSizes: card.techSizes,
          commFbwIu: iuComm?.fbw ?? null,
          commFbsIu: iuComm?.fbs ?? null,
        }

        if (pricesOk) {
          const priceData = priceMap.get(card.nmId)
          createData.priceBeforeDiscount = priceData?.priceBeforeDiscount ?? null
          createData.sellerDiscount = priceData?.sellerDiscount ?? null
          createData.price = priceData?.discountedPrice ?? null
          createData.clubDiscount = priceData?.clubDiscount ?? null
        }
        if (stocksOk) createData.stockQty = stockMap.get(card.nmId) ?? null
        if (buyoutOk) createData.buyoutPercent = buyoutMap.get(card.nmId) ?? null
        if (commissionsOk) {
          const stdComm = commMap.get(raw.subjectID)
          createData.commFbwStd = stdComm?.fbw ?? null
          createData.commFbsStd = stdComm?.fbs ?? null
        }
        if (ordersOk) {
          const ordersStats = ordersPerWarehouseMap.get(card.nmId)
          createData.avgSalesSpeed7d = ordersStats?.avg ?? null
          createData.ordersYesterday = ordersStats?.yesterday ?? null
        }

        await prisma.wbCard.upsert({
          where: { nmId: card.nmId },
          update: updateData,
          create: createData,
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

              // Phase 16 (STOCK-33): per-size upsert через compound unique
              // (wbCardId, warehouseId, techSize). До Phase 16 был bug: 6 rows
              // одного склада (per techSize) ПЕРЕЗАПИСЫВАЛИ друг друга, БД
              // содержала qty последнего techSize. См. RESEARCH §Hypothesis 1 #File 2.
              const incomingKeys: Array<{ warehouseId: number; techSize: string }> = []

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

                // Phase 16 (STOCK-33): per-size upsert REPLACE
                const techSize = item.techSize || ""
                await tx.wbCardWarehouseStock.upsert({
                  where: {
                    wbCardId_warehouseId_techSize: {
                      wbCardId: card.id,
                      warehouseId,
                      techSize,
                    },
                  },
                  create: {
                    wbCardId: card.id,
                    warehouseId,
                    techSize,
                    quantity: item.quantity,
                  },
                  update: {
                    quantity: item.quantity,  // REPLACE — не суммировать
                  },
                })

                incomingKeys.push({ warehouseId, techSize: item.techSize || "" })
              }

              // Phase 16 (STOCK-33): 2-step clean-replace — Prisma не поддерживает
              // compound NOT IN deleteMany (см. RESEARCH §Pitfall 1).
              if (incomingKeys.length > 0) {
                const existingRows = await tx.wbCardWarehouseStock.findMany({
                  where: { wbCardId: card.id },
                  select: { id: true, warehouseId: true, techSize: true },
                })
                const incomingSet = new Set(
                  incomingKeys.map((k) => `${k.warehouseId}::${k.techSize}`),
                )
                const toDeleteIds = existingRows
                  .filter((r) => !incomingSet.has(`${r.warehouseId}::${r.techSize}`))
                  .map((r) => r.id)
                if (toDeleteIds.length > 0) {
                  await tx.wbCardWarehouseStock.deleteMany({
                    where: { id: { in: toDeleteIds } },
                  })
                }
              }

              // Денормализация per-nmId: WbCard.stockQty = SUM(физ. остаток),
              // WbCard.inWayToClient / inWayFromClient = SUM(inWay по всем складам).
              const totalStock = warehouseItems.reduce((s, w) => s + w.quantity, 0)
              const totalInWayTo = warehouseItems.reduce(
                (s, w) => s + w.inWayToClient,
                0,
              )
              const totalInWayFrom = warehouseItems.reduce(
                (s, w) => s + w.inWayFromClient,
                0,
              )
              await tx.wbCard.update({
                where: { id: card.id },
                data: {
                  stockQty: totalStock,
                  inWayToClient: totalInWayTo,
                  inWayFromClient: totalInWayFrom,
                },
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

    // Phase 15 (ORDERS-02): Clean-replace per-warehouse orders
    let warehouseOrdersUpdated = 0
    if (ordersPerWarehouseMap.size > 0) {
      try {
        await prisma.$transaction(
          async (tx) => {
            for (const [nmId, stats] of ordersPerWarehouseMap.entries()) {
              const card = await tx.wbCard.findUnique({
                where: { nmId },
                select: { id: true },
              })
              if (!card) continue

              const incomingWarehouseIds: number[] = []

              for (const [warehouseName, ordersCount] of stats.perWarehouse.entries()) {
                if (!warehouseName) continue

                // Lookup by name FIRST — seed+stocks section уже могли создать этот склад
                const existingByName = await tx.wbWarehouse.findFirst({
                  where: { name: warehouseName },
                  select: { id: true },
                })

                let warehouseId: number
                if (existingByName) {
                  warehouseId = existingByName.id
                } else {
                  warehouseId = stableWarehouseIdFromName(warehouseName)
                  console.warn(
                    `[wb-sync orders] Auto-insert неизвестный склад: id=${warehouseId} name="${warehouseName}"`,
                  )
                  await tx.wbWarehouse.create({
                    data: {
                      id: warehouseId,
                      name: warehouseName,
                      cluster: "Прочие склады",
                      shortCluster: "Прочие",
                      isActive: true,
                      needsClusterReview: true,
                    },
                  })
                }

                incomingWarehouseIds.push(warehouseId)

                await tx.wbCardWarehouseOrders.upsert({
                  where: {
                    wbCardId_warehouseId: {
                      wbCardId: card.id,
                      warehouseId,
                    },
                  },
                  create: {
                    wbCardId: card.id,
                    warehouseId,
                    ordersCount,
                    periodDays: stats.periodDays,
                  },
                  update: {
                    ordersCount,
                    periodDays: stats.periodDays,
                  },
                })
              }

              // Clean: удалить склады которых нет в текущем ответе API
              if (incomingWarehouseIds.length > 0) {
                await tx.wbCardWarehouseOrders.deleteMany({
                  where: {
                    wbCardId: card.id,
                    NOT: { warehouseId: { in: incomingWarehouseIds } },
                  },
                })
              } else {
                // Если кластеры пустые но card есть — обнуляем полностью (редкий кейс)
                await tx.wbCardWarehouseOrders.deleteMany({
                  where: { wbCardId: card.id },
                })
              }

              warehouseOrdersUpdated++
            }
          },
          { timeout: 60_000 },
        )
        console.log(
          `[wb-sync] Обновлено per-warehouse orders для ${warehouseOrdersUpdated} wbCards`,
        )
      } catch (e) {
        console.error("[wb-sync] Per-warehouse orders transaction failed:", e)
        errors.push(`per-warehouse-orders: ${(e as Error).message}`)
      }
    }

    return NextResponse.json({
      synced,
      total: rawCards.length,
      pricesLoaded: priceMap.size,
      discountsLoaded: discountMap.size,
      warehouseStocksUpdated: stocksPerWarehouse.size,
      warehouseOrdersUpdated,
      failures: failures.length > 0 ? failures : undefined,
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
