// lib/stock-wb-data.ts
// Phase 14 (STOCK-22): RSC data helper для /stock/wb — per-nmId данные с per-warehouse split.
// Группировка: Product → WbCard → кластер → склад

import { prisma } from "@/lib/prisma"
import { CLUSTER_ORDER, type ClusterShortName } from "@/lib/wb-clusters"

export interface WarehouseSlot {
  warehouseId: number
  warehouseName: string
  needsClusterReview: boolean
  quantity: number
}

export interface ClusterAggregate {
  shortCluster: string  // "ЦФО" | ...
  totalStock: number | null
  warehouses: WarehouseSlot[]
}

export interface WbStockRow {
  // Per-nmId
  wbCardId: string
  nmId: number
  wbCardName: string | null
  avgSalesSpeed7d: number | null
  totalStock: number | null  // SUM всех складов
  clusters: Record<ClusterShortName, ClusterAggregate>
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
        },
      })
    : []
  const wbCardByNmId = new Map(wbCards.map((c) => [c.nmId, c]))

  // Построить clusterWarehouses — уникальные склады per-кластер (по всем WbCards)
  const clusterWarehousesMap: Record<string, Map<number, { warehouseId: number; warehouseName: string; needsClusterReview: boolean }>> = {}
  for (const cluster of CLUSTER_ORDER) clusterWarehousesMap[cluster] = new Map()

  for (const card of wbCards) {
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
        clusters[shortCluster] = { shortCluster, totalStock: null, warehouses: [] }
      }

      let totalStock: number | null = null
      if (card) {
        totalStock = 0
        for (const ws of card.warehouses) {
          const rawCluster = ws.warehouse?.shortCluster as string | undefined
          const shortCluster: ClusterShortName = (
            rawCluster && (CLUSTER_ORDER as readonly string[]).includes(rawCluster)
              ? rawCluster
              : "Прочие"
          ) as ClusterShortName

          const aggregate = clusters[shortCluster]!
          aggregate.warehouses.push({
            warehouseId: ws.warehouseId,
            warehouseName: ws.warehouse?.name ?? `Склад ${ws.warehouseId}`,
            needsClusterReview: ws.warehouse?.needsClusterReview ?? false,
            quantity: ws.quantity,
          })
          aggregate.totalStock = (aggregate.totalStock ?? 0) + ws.quantity
          totalStock += ws.quantity
        }
      }

      return {
        wbCardId: card?.id ?? `missing-${a.article}`,
        nmId: isNaN(nmId) ? 0 : nmId,
        wbCardName: card?.name ?? null,
        avgSalesSpeed7d: card?.avgSalesSpeed7d ?? null,
        totalStock,
        clusters,
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
