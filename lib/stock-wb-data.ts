// lib/stock-wb-data.ts
// Phase 14 (STOCK-22): RSC data helper для /stock/wb — per-nmId данные с per-warehouse split.
// Phase 15 (ORDERS-03): расширен per-warehouse orders aggregation per-cluster.
// Группировка: Product → WbCard → кластер → склад

import { prisma } from "@/lib/prisma"
import { CLUSTER_ORDER, type ClusterShortName } from "@/lib/wb-clusters"

export interface WarehouseSlot {
  warehouseId: number
  warehouseName: string
  needsClusterReview: boolean
  quantity: number
  // Phase 15 (ORDERS-03):
  ordersCount: number           // 0 если нет записи в WbCardWarehouseOrders
  ordersPerDay: number | null   // ordersCount / periodDays, null если нет записи
}

export interface ClusterAggregate {
  shortCluster: string  // "ЦФО" | ...
  totalStock: number | null
  warehouses: WarehouseSlot[]
  // Phase 15 (ORDERS-03):
  totalOrdersCount: number | null   // SUM ordersCount всех складов кластера; null если ни одного order-record
  ordersPerDay: number | null       // totalOrdersCount / periodDays
}

export interface WbStockRow {
  // Per-nmId
  wbCardId: string
  nmId: number
  wbCardName: string | null
  avgSalesSpeed7d: number | null
  totalStock: number | null  // SUM всех складов (физ. остаток)
  // Phase 15.1: товар в пути (агрегат per nmId, без per-warehouse разбивки)
  inWayToClient: number | null
  inWayFromClient: number | null
  clusters: Record<ClusterShortName, ClusterAggregate>
  // Phase 15 (ORDERS-03):
  periodDays: number | null         // periodDays из первой WbCardWarehouseOrders записи (обычно 7)
}

export interface ProductWbGroup {
  productId: string
  productSku: string
  productName: string
  brandName: string
  photoUrl: string | null
  ivanovoStock: number | null
  productionStock: number | null
  wbCards: WbStockRow[]
}

export interface StockWbDataResult {
  groups: ProductWbGroup[]
  turnoverNormDays: number
  // Набор реальных складов per-кластер (для expanded columns headers)
  clusterWarehouses: Record<ClusterShortName, Array<{ warehouseId: number; warehouseName: string; needsClusterReview: boolean }>>
}

const TURNOVER_NORM_KEY = "stock.turnoverNormDays"

export async function getStockWbData(): Promise<StockWbDataResult> {
  const setting = await prisma.appSetting.findUnique({ where: { key: TURNOVER_NORM_KEY } })
  const turnoverNormDays = setting ? parseInt(setting.value, 10) : 37

  // Все Product с WB-артикулами
  const products = await prisma.product.findMany({
    where: {
      deletedAt: null,
      articles: { some: { marketplace: { name: { in: ["WB", "wb", "Wildberries"] } } } },
    },
    include: {
      brand: true,
      articles: {
        include: { marketplace: true },
      },
    },
    orderBy: { sku: "asc" },
  })

  // Собрать все WB nmIds
  const wbNmIds = products.flatMap((p) =>
    p.articles
      .filter((a) => a.marketplace.name.toLowerCase().includes("wb") || a.marketplace.name.toLowerCase().includes("wildberries"))
      .map((a) => parseInt(a.article, 10))
      .filter((n) => !isNaN(n))
  )

  const wbCards = wbNmIds.length > 0
    ? await prisma.wbCard.findMany({
        where: { nmId: { in: wbNmIds } },
        include: {
          warehouses: {
            include: { warehouse: true },
          },
          warehouseOrders: {
            include: { warehouse: true },
          },
        },
      })
    : []
  const wbCardByNmId = new Map(wbCards.map((c) => [c.nmId, c]))

  // Построить clusterWarehouses — уникальные склады per-кластер (по всем WbCards)
  const clusterWarehousesMap: Record<string, Map<number, { warehouseId: number; warehouseName: string; needsClusterReview: boolean }>> = {}
  for (const cluster of CLUSTER_ORDER) clusterWarehousesMap[cluster] = new Map()

  for (const card of wbCards) {
    // Из stocks
    for (const ws of card.warehouses) {
      const shortCluster = (ws.warehouse?.shortCluster as ClusterShortName | undefined) ?? "Прочие"
      const targetKey = (CLUSTER_ORDER as readonly string[]).includes(shortCluster) ? shortCluster : "Прочие"
      const map = clusterWarehousesMap[targetKey]!
      if (!map.has(ws.warehouseId)) {
        map.set(ws.warehouseId, {
          warehouseId: ws.warehouseId,
          warehouseName: ws.warehouse?.name ?? `Склад ${ws.warehouseId}`,
          needsClusterReview: ws.warehouse?.needsClusterReview ?? false,
        })
      }
    }
    // Phase 15: также из orders
    for (const wo of card.warehouseOrders) {
      const shortCluster = (wo.warehouse?.shortCluster as ClusterShortName | undefined) ?? "Прочие"
      const targetKey = (CLUSTER_ORDER as readonly string[]).includes(shortCluster) ? shortCluster : "Прочие"
      const map = clusterWarehousesMap[targetKey]!
      if (!map.has(wo.warehouseId)) {
        map.set(wo.warehouseId, {
          warehouseId: wo.warehouseId,
          warehouseName: wo.warehouse?.name ?? `Склад ${wo.warehouseId}`,
          needsClusterReview: wo.warehouse?.needsClusterReview ?? false,
        })
      }
    }
  }
  const clusterWarehouses = Object.fromEntries(
    CLUSTER_ORDER.map((c) => [
      c,
      [...(clusterWarehousesMap[c]?.values() ?? [])].sort((a, b) =>
        a.warehouseName.localeCompare(b.warehouseName, "ru")
      ),
    ])
  ) as StockWbDataResult["clusterWarehouses"]

  // Построить groups
  const groups: ProductWbGroup[] = products.map((p) => {
    const wbArticles = p.articles.filter((a) =>
      a.marketplace.name.toLowerCase().includes("wb") ||
      a.marketplace.name.toLowerCase().includes("wildberries")
    )

    const wbRows: WbStockRow[] = wbArticles.map((a) => {
      const nmId = parseInt(a.article, 10)
      const card = !isNaN(nmId) ? wbCardByNmId.get(nmId) : undefined

      // Инициализировать кластеры
      const clusters = {} as Record<ClusterShortName, ClusterAggregate>
      for (const shortCluster of CLUSTER_ORDER) {
        clusters[shortCluster] = {
          shortCluster,
          totalStock: null,
          totalOrdersCount: null,
          ordersPerDay: null,
          warehouses: [],
        }
      }

      // Phase 15: Map<warehouseId, {ordersCount, periodDays}> для быстрого lookup
      const ordersByWarehouseId = new Map<number, { ordersCount: number; periodDays: number }>()
      let cardPeriodDays: number | null = null
      if (card) {
        for (const wo of card.warehouseOrders) {
          ordersByWarehouseId.set(wo.warehouseId, {
            ordersCount: wo.ordersCount,
            periodDays: wo.periodDays,
          })
          if (cardPeriodDays === null) cardPeriodDays = wo.periodDays
        }
      }

      let totalStock: number | null = null
      if (card) {
        // Собираем все уникальные warehouseId из stocks + orders
        const allWarehouseIds = new Set<number>()
        for (const ws of card.warehouses) allWarehouseIds.add(ws.warehouseId)
        for (const wo of card.warehouseOrders) allWarehouseIds.add(wo.warehouseId)

        // Lookup stocks по warehouseId
        const stockByWarehouseId = new Map<number, typeof card.warehouses[number]>()
        for (const ws of card.warehouses) stockByWarehouseId.set(ws.warehouseId, ws)

        // Lookup warehouse meta (имя, кластер, флаг) — приоритет из stocks, затем из orders
        const warehouseMetaById = new Map<number, { name: string; shortCluster: string | null; needsClusterReview: boolean }>()
        for (const ws of card.warehouses) {
          warehouseMetaById.set(ws.warehouseId, {
            name: ws.warehouse?.name ?? `Склад ${ws.warehouseId}`,
            shortCluster: ws.warehouse?.shortCluster ?? null,
            needsClusterReview: ws.warehouse?.needsClusterReview ?? false,
          })
        }
        for (const wo of card.warehouseOrders) {
          if (!warehouseMetaById.has(wo.warehouseId)) {
            warehouseMetaById.set(wo.warehouseId, {
              name: wo.warehouse?.name ?? `Склад ${wo.warehouseId}`,
              shortCluster: wo.warehouse?.shortCluster ?? null,
              needsClusterReview: wo.warehouse?.needsClusterReview ?? false,
            })
          }
        }

        for (const warehouseId of allWarehouseIds) {
          const meta = warehouseMetaById.get(warehouseId)!
          const rawCluster = meta.shortCluster
          const shortCluster: ClusterShortName = (
            rawCluster && (CLUSTER_ORDER as readonly string[]).includes(rawCluster)
              ? rawCluster
              : "Прочие"
          ) as ClusterShortName

          const aggregate = clusters[shortCluster]!
          const stockEntry = stockByWarehouseId.get(warehouseId)
          const orderEntry = ordersByWarehouseId.get(warehouseId)

          const quantity = stockEntry?.quantity ?? 0
          const ordersCount = orderEntry?.ordersCount ?? 0
          const ordersPerDay = orderEntry ? ordersCount / orderEntry.periodDays : null

          aggregate.warehouses.push({
            warehouseId,
            warehouseName: meta.name,
            needsClusterReview: meta.needsClusterReview,
            quantity,
            ordersCount,
            ordersPerDay,
          })

          // Stocks aggregation (только если в stocks была запись)
          if (stockEntry) {
            aggregate.totalStock = (aggregate.totalStock ?? 0) + quantity
            if (totalStock === null) totalStock = 0
            totalStock += quantity
          }

          // Orders aggregation
          if (orderEntry) {
            aggregate.totalOrdersCount = (aggregate.totalOrdersCount ?? 0) + ordersCount
          }
        }

        // Второй проход: пересчёт ordersPerDay per-cluster
        for (const shortCluster of CLUSTER_ORDER) {
          const agg = clusters[shortCluster]!
          if (agg.totalOrdersCount !== null && cardPeriodDays !== null && cardPeriodDays > 0) {
            agg.ordersPerDay = agg.totalOrdersCount / cardPeriodDays
          }
        }
      }

      return {
        wbCardId: card?.id ?? `missing-${a.article}`,
        nmId: isNaN(nmId) ? 0 : nmId,
        wbCardName: card?.name ?? null,
        avgSalesSpeed7d: card?.avgSalesSpeed7d ?? null,
        totalStock,
        inWayToClient: card?.inWayToClient ?? null,
        inWayFromClient: card?.inWayFromClient ?? null,
        clusters,
        periodDays: cardPeriodDays,
      }
    })

    return {
      productId: p.id,
      productSku: p.sku,
      productName: p.name,
      brandName: p.brand.name,
      photoUrl: p.photoUrl ?? null,
      ivanovoStock: p.ivanovoStock ?? null,
      productionStock: p.productionStock ?? null,
      wbCards: wbRows,
    }
  })

  return { groups, turnoverNormDays, clusterWarehouses }
}
