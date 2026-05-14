// lib/stock-wb-data.ts
// Phase 14 (STOCK-22): RSC data helper для /stock/wb — per-nmId данные с per-warehouse split.
// Phase 15 (ORDERS-03): расширен per-warehouse orders aggregation per-cluster.
// Phase 16 (STOCK-34): добавлен per-size breakdown — sizeBreakdown[] под каждой
//   nmId-строкой; pure helper buildSizeBreakdown для тестирования без Prisma mock.
// Группировка: Product → WbCard → кластер → склад

import { prisma } from "@/lib/prisma"
import { CLUSTER_ORDER, type ClusterShortName, sortSizes } from "@/lib/wb-clusters"
import { PRODUCT_HIERARCHY_ORDER_BY } from "@/lib/product-order"

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

/**
 * Phase 16 (STOCK-34): per-size агрегат для размерной строки в /stock/wb.
 * Структура clusters идентична WbStockRow.clusters — UI рендерит ту же сетку
 * О/З/Об/Д per cluster + per warehouse при expand.
 *
 * Note: ordersPerDay/totalOrdersCount per-size не хранятся в БД (per-size
 * orders агрегация только в Map в памяти от fetchOrdersPerWarehouse, в БД
 * есть только nmId-уровень WbCardWarehouseOrders). В размерных строках
 * ordersPerDay = null → UI показывает «—» в колонке З.
 */
export interface WbStockSizeRow {
  techSize: string
  totalStock: number | null
  clusters: Record<ClusterShortName, ClusterAggregate>
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
  // Phase 16 (STOCK-34): per-size breakdown под этой nmId-строкой
  sizeBreakdown: WbStockSizeRow[]
  hasMultipleSizes: boolean
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

export interface StockWbFiltersInput {
  directionIds?: string[]
  brandIds?: string[]
  categoryIds?: string[]
  subcategoryIds?: string[]
}

export async function getStockWbData(
  filters: StockWbFiltersInput = {},
): Promise<StockWbDataResult> {
  const setting = await prisma.appSetting.findUnique({ where: { key: TURNOVER_NORM_KEY } })
  const turnoverNormDays = setting ? parseInt(setting.value, 10) : 37

  // Все Product с WB-артикулами + фильтры (если есть)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const productWhere: any = {
    deletedAt: null,
    articles: { some: { marketplace: { name: { in: ["WB", "wb", "Wildberries"] } } } },
  }
  if (filters.brandIds && filters.brandIds.length > 0) {
    productWhere.brandId = { in: filters.brandIds }
  }
  if (filters.directionIds && filters.directionIds.length > 0) {
    productWhere.brand = { directionId: { in: filters.directionIds } }
  }
  if (filters.categoryIds && filters.categoryIds.length > 0) {
    productWhere.categoryId = { in: filters.categoryIds }
  }
  if (filters.subcategoryIds && filters.subcategoryIds.length > 0) {
    productWhere.subcategoryId = { in: filters.subcategoryIds }
  }

  const products = await prisma.product.findMany({
    where: productWhere,
    include: {
      brand: true,
      articles: {
        include: { marketplace: true },
      },
    },
    // Глобальная иерархия: Направление → Бренд → Категория → Подкатегория → name
    orderBy: PRODUCT_HIERARCHY_ORDER_BY,
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

        // Phase 16 fix: stocks aggregated per warehouseId — теперь несколько rows
        // per warehouse (по одному на techSize), нужно SUM, не set/overwrite.
        // До фикса: Map.set перезаписывал rows → quantity = только последний размер.
        const stockSumByWarehouseId = new Map<number, number>()
        for (const ws of card.warehouses) {
          const prev = stockSumByWarehouseId.get(ws.warehouseId) ?? 0
          stockSumByWarehouseId.set(ws.warehouseId, prev + (ws.quantity ?? 0))
        }
        // Флаг наличия записи в stocks (для отличия "0 шт" vs "нет данных")
        const hasStockEntryByWarehouseId = new Set<number>(
          card.warehouses.map((ws) => ws.warehouseId),
        )

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
          const hasStockEntry = hasStockEntryByWarehouseId.has(warehouseId)
          const orderEntry = ordersByWarehouseId.get(warehouseId)

          // Phase 16 fix: quantity = SUM по всем techSize на этом складе (а не одна строка)
          const quantity = stockSumByWarehouseId.get(warehouseId) ?? 0
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
          if (hasStockEntry) {
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

      // Phase 16 (STOCK-34): per-size breakdown.
      // Quick 260514-kzg: передаём card.techSizes — buildSizeBreakdown
      // доливает «выпавшие» размеры (есть в WB API, нет в WbCardWarehouseStock)
      // с пустыми метриками, чтобы UI мог подсветить их красным.
      const cardWarehouses = card?.warehouses ?? []
      const cardTechSizes = card?.techSizes ?? []
      const sizeBreakdown = buildSizeBreakdown(
        cardWarehouses.map((ws) => ({
          warehouseId: ws.warehouseId,
          techSize: ws.techSize ?? "",
          quantity: ws.quantity ?? 0,
          warehouse: ws.warehouse
            ? {
                name: ws.warehouse.name,
                shortCluster: ws.warehouse.shortCluster ?? null,
                needsClusterReview: ws.warehouse.needsClusterReview ?? false,
              }
            : null,
        })),
        cardTechSizes,
      )
      // Quick 260514-kzg: union(stockSizes, techSizes) — товар, у которого WB API
      // вернул несколько размеров, должен показывать размерные строки даже если
      // в БД stock есть только по одному размеру (остальные «выпали» и должны
      // быть красными).
      const stockSizes = new Set<string>(cardWarehouses.map((ws) => ws.techSize ?? ""))
      const cardTechSizesFiltered = cardTechSizes.filter((s) => s && s !== "0")
      const effectiveSizeCount = new Set<string>([...stockSizes, ...cardTechSizesFiltered]).size
      const hasMultipleSizes = effectiveSizeCount > 1

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
        sizeBreakdown,
        hasMultipleSizes,
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

/**
 * Phase 16 (STOCK-34): построить per-size breakdown для одного nmId по
 * card.warehouses[]. Pure function — можно тестировать без Prisma mock.
 *
 * Quick 260514-kzg: дополнительно принимает `techSizes` из `WbCard.techSizes`
 * (Phase 17 — все размеры из WB API). Размеры, которые присутствуют в
 * `techSizes`, но отсутствуют в `warehouses` (нет stock-rows в БД), всё равно
 * попадают в результат с пустыми метриками (totalStock=null, кластеры =
 * пустые) — UI подсвечивает такие «выпавшие» размеры красным.
 *
 * Контракт:
 *   - Если effectiveSizes = union(stockSizes, techSizes\{"","0"}) содержит
 *     <=1 уникальное значение → возвращает [] (одно-размерные товары не
 *     порождают размерных строк в UI; см. CONTEXT.md «Когда у nmId 1 размер
 *     — скрывать»).
 *   - Иначе для каждого размера из effectiveSizes формирует WbStockSizeRow:
 *     - Если в `warehouses` есть rows на этот размер → обычная aggregation.
 *     - Если rows нет (размер из techSizes без stock) → totalStock=null,
 *       все clusters пустые (totalStock=null, warehouses=[]).
 *   - Sort размеров через sortSizes() (числовая ASC / SIZE_ORDER / alpha
 *     fallback / пустые в конец).
 *   - ordersCount/ordersPerDay в каждом WarehouseSlot и ClusterAggregate
 *     всегда 0/null — per-size orders не хранятся в БД (CONTEXT.md «Per-size
 *     З default '—'»; UI рендерит как «—»).
 *
 * @param warehouses — записи WbCardWarehouseStock с присоединённой meta
 *   склада (поле techSize присутствует после миграции 16-01).
 * @param techSizes — полный список размеров из WbCard.techSizes (Phase 17).
 *   Дефолт `[]` для обратной совместимости с тестами Phase 16.
 * @returns массив WbStockSizeRow, отсортированный через sortSizes().
 */
export function buildSizeBreakdown(
  warehouses: Array<{
    warehouseId: number
    techSize: string
    quantity: number
    warehouse: {
      name: string
      shortCluster: string | null
      needsClusterReview: boolean
    } | null
  }>,
  techSizes: string[] = [],
): WbStockSizeRow[] {
  // 1. Сформировать effectiveSizes = union(stockSizes, techSizes\{"","0"}).
  //    Quick 260514-kzg: размер, попавший только в techSizes, считается
  //    «выпавшим» — он попадёт в результат, но с пустыми метриками.
  const uniqueSizes = new Set<string>(warehouses.map((w) => w.techSize ?? ""))
  const extraSizes = techSizes.filter((s) => s && s !== "0")
  const effectiveSizes = new Set<string>([...uniqueSizes, ...extraSizes])

  // Одно-размерные товары не дают строк (контракт Phase 16 сохраняется).
  if (effectiveSizes.size <= 1) return []

  // 2. Group warehouses по techSize
  const bySize = new Map<string, typeof warehouses>()
  for (const w of warehouses) {
    const ts = w.techSize ?? ""
    const arr = bySize.get(ts) ?? []
    arr.push(w)
    bySize.set(ts, arr)
  }

  // 3. Build WbStockSizeRow per size — итерация по effectiveSizes, чтобы
  //    «выпавшие» размеры (нет stock-rows) тоже формировали пустую строку.
  const rows: WbStockSizeRow[] = []
  for (const techSize of effectiveSizes) {
    const sizeWarehouses = bySize.get(techSize) ?? []

    // Init clusters — все CLUSTER_ORDER ключи всегда присутствуют
    const clusters = {} as Record<ClusterShortName, ClusterAggregate>
    for (const sc of CLUSTER_ORDER) {
      clusters[sc] = {
        shortCluster: sc,
        totalStock: null,
        warehouses: [],
        totalOrdersCount: null,
        ordersPerDay: null,
      }
    }

    let totalStock: number | null = null
    for (const w of sizeWarehouses) {
      const rawCluster = w.warehouse?.shortCluster ?? null
      const shortCluster: ClusterShortName = (
        rawCluster && (CLUSTER_ORDER as readonly string[]).includes(rawCluster)
          ? rawCluster
          : "Прочие"
      ) as ClusterShortName
      const agg = clusters[shortCluster]!

      const qty = w.quantity ?? 0
      agg.warehouses.push({
        warehouseId: w.warehouseId,
        warehouseName: w.warehouse?.name ?? `Склад ${w.warehouseId}`,
        needsClusterReview: w.warehouse?.needsClusterReview ?? false,
        quantity: qty,
        ordersCount: 0,        // Phase 16: per-size orders не хранятся в БД
        ordersPerDay: null,    //          → UI рендерит как «—»
      })
      agg.totalStock = (agg.totalStock ?? 0) + qty
      totalStock = (totalStock ?? 0) + qty
      // ordersPerDay/totalOrdersCount остаются null
    }

    // Quick 260514-kzg: если размер только в techSizes (нет stock-rows в БД) —
    // это «выпавший» размер. totalStock = 0 (явный ноль, не null), чтобы UI
    // подсветил его красным consistent'но с размерами, имеющими WbCardWarehouseStock
    // row с quantity=0. Кластеры остаются null (нет данных по складам) →
    // в UI «—» muted, что корректно семантически.
    if (sizeWarehouses.length === 0) {
      totalStock = 0
    }
    rows.push({ techSize, totalStock, clusters })
  }

  // 4. Sort через sortSizes (стабильный порядок для UI)
  const sortedSizes = sortSizes(rows.map((r) => r.techSize))
  const indexBySize = new Map(sortedSizes.map((s, i) => [s, i]))
  rows.sort(
    (a, b) =>
      (indexBySize.get(a.techSize) ?? 0) - (indexBySize.get(b.techSize) ?? 0),
  )

  return rows
}
