// lib/stock-data.ts
// Phase 14 (STOCK-16, STOCK-18): RSC data helper для /stock — собирает Product[] с агрегацией остатков.
// Возвращает типы, которые потребляет StockProductTable (client).
//
// Архитектура:
// - Один запрос Product с relations (Brand, Category, Subcategory, MarketplaceArticle + Marketplace)
// - Отдельный батч-запрос WbCard.findMany({nmId: {in}}) для всех WB-артикулов
// - Агрегация JS: wbTotalStock, wbTotalOrdersPerDay, mpTotalStock, rfTotalStock
// - Фильтр onlyDeficit: dynamically imported calculateStockMetrics

import { prisma } from "@/lib/prisma"

// ──────────────────────────────────────────────────────────────────
// Types (публичный контракт для StockProductTable + page.tsx)
// ──────────────────────────────────────────────────────────────────

export interface StockArticleRow {
  id: string                // MarketplaceArticle.id
  marketplaceName: string   // "WB", "Ozon", "ДМ", "ЯМ"
  article: string           // nmId (WB) или другой артикул

  // WB-specific данные (null для non-WB)
  wbCard: {
    id: string
    nmId: number
    stockQty: number | null         // денорм SUM остатков
    avgSalesSpeed7d: number | null  // З
  } | null
}

export interface StockAggregates {
  wbTotalStock: number | null        // SUM(wbCard.stockQty) по всем WB articles
  wbTotalOrdersPerDay: number | null // SUM(wbCard.avgSalesSpeed7d) по всем WB articles
  mpTotalStock: number | null        // WB + Ozon (Ozon placeholder, сейчас равен wbTotalStock)
  mpTotalOrdersPerDay: number | null // Равен wbTotalOrdersPerDay пока нет Ozon
  rfTotalStock: number | null        // Иваново + МП (БЕЗ Производства — решение 2026-04-22)
}

export interface StockProductRow {
  id: string
  sku: string
  name: string
  brandName: string
  categoryName: string | null
  subcategoryName: string | null
  abcStatus: string | null
  photoUrl: string | null

  // Inline редактируемые поля
  ivanovoStock: number | null
  productionStock: number | null

  articles: StockArticleRow[]
  aggregates: StockAggregates
}

export interface StockDataResult {
  products: StockProductRow[]
  turnoverNormDays: number // из AppSetting stock.turnoverNormDays (default 37)
}

export interface StockFilters {
  brandIds?: string[]
  categoryIds?: string[]
  subcategoryIds?: string[]
  onlyDeficit?: boolean
}

// ──────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────

const TURNOVER_NORM_KEY = "stock.turnoverNormDays"
const DEFAULT_TURNOVER_NORM = 37

// ──────────────────────────────────────────────────────────────────
// Main data fetcher
// ──────────────────────────────────────────────────────────────────

export async function getStockData(filters: StockFilters = {}): Promise<StockDataResult> {
  // 1. Получить норму оборачиваемости из AppSetting
  const setting = await prisma.appSetting.findUnique({ where: { key: TURNOVER_NORM_KEY } })
  const turnoverNormDays = setting ? parseInt(setting.value, 10) : DEFAULT_TURNOVER_NORM

  // 2. Собрать Product с relations (Brand, Category, Subcategory, MarketplaceArticle + Marketplace)
  const whereFilters: Record<string, unknown> = { deletedAt: null }

  if (filters.brandIds && filters.brandIds.length > 0) {
    whereFilters.brandId = { in: filters.brandIds }
  }
  if (filters.categoryIds && filters.categoryIds.length > 0) {
    whereFilters.categoryId = { in: filters.categoryIds }
  }
  if (filters.subcategoryIds && filters.subcategoryIds.length > 0) {
    whereFilters.subcategoryId = { in: filters.subcategoryIds }
  }

  const products = await prisma.product.findMany({
    where: whereFilters,
    include: {
      brand: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      subcategory: { select: { id: true, name: true } },
      articles: {
        include: { marketplace: { select: { id: true, name: true } } },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { sku: "asc" },
  })

  // 3. Батч-запрос WbCard для всех WB-артикулов (один запрос на всю страницу)
  const wbNmIds: number[] = []
  for (const p of products) {
    for (const a of p.articles) {
      const mpName = a.marketplace.name
      const isWb = mpName.toLowerCase() === "wb"
      if (isWb) {
        const nmId = parseInt(a.article, 10)
        if (!isNaN(nmId)) wbNmIds.push(nmId)
      }
    }
  }

  const wbCards = wbNmIds.length > 0
    ? await prisma.wbCard.findMany({
        where: { nmId: { in: wbNmIds } },
        select: { id: true, nmId: true, stockQty: true, avgSalesSpeed7d: true },
      })
    : []

  const wbCardByNmId = new Map(wbCards.map((c) => [c.nmId, c]))

  // 4. Собрать StockProductRow[] с агрегацией
  const rows: StockProductRow[] = products.map((p) => {
    // Собрать articles
    const articles: StockArticleRow[] = p.articles.map((a) => {
      const mpName = a.marketplace.name
      const isWb = mpName.toLowerCase() === "wb"
      let wbCard: StockArticleRow["wbCard"] = null

      if (isWb) {
        const nmId = parseInt(a.article, 10)
        if (!isNaN(nmId)) {
          const card = wbCardByNmId.get(nmId)
          if (card) {
            wbCard = {
              id: card.id,
              nmId: card.nmId,
              stockQty: card.stockQty,
              avgSalesSpeed7d: card.avgSalesSpeed7d,
            }
          }
        }
      }

      return {
        id: a.id,
        marketplaceName: mpName,
        article: a.article,
        wbCard,
      }
    })

    // Агрегаты по Product
    const wbStocks = articles
      .map((a) => a.wbCard?.stockQty)
      .filter((s): s is number => s !== null && s !== undefined)
    const wbOrders = articles
      .map((a) => a.wbCard?.avgSalesSpeed7d)
      .filter((s): s is number => s !== null && s !== undefined)

    const wbTotalStock = wbStocks.length > 0 ? wbStocks.reduce((a, b) => a + b, 0) : null
    const wbTotalOrdersPerDay = wbOrders.length > 0 ? wbOrders.reduce((a, b) => a + b, 0) : null

    // МП = WB + Ozon (Ozon пока 0, будет реализован в будущем)
    const mpTotalStock = wbTotalStock
    const mpTotalOrdersPerDay = wbTotalOrdersPerDay

    // РФ = Иваново + МП (БЕЗ Производства — решение 2026-04-22)
    // Производство — отдельный столбец для планируемого прихода, не складской остаток.
    const rfParts: number[] = []
    if (p.ivanovoStock !== null) rfParts.push(p.ivanovoStock)
    if (mpTotalStock !== null) rfParts.push(mpTotalStock)
    const rfTotalStock = rfParts.length > 0 ? rfParts.reduce((a, b) => a + b, 0) : null

    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      brandName: p.brand.name,
      categoryName: p.category?.name ?? null,
      subcategoryName: p.subcategory?.name ?? null,
      abcStatus: p.abcStatus,
      photoUrl: p.photoUrl ?? null,
      ivanovoStock: p.ivanovoStock,
      productionStock: p.productionStock,
      articles,
      aggregates: {
        wbTotalStock,
        wbTotalOrdersPerDay,
        mpTotalStock,
        mpTotalOrdersPerDay,
        rfTotalStock,
      },
    }
  })

  // 5. Фильтр «только с дефицитом» применяется JS-стороне после агрегации
  let filteredRows = rows
  if (filters.onlyDeficit) {
    const { calculateStockMetrics } = await import("@/lib/stock-math")
    filteredRows = rows.filter((r) => {
      // Дефицит определяем по РФ (агрегат): Д = (norm × 0.3 × З) − О
      const rfMetrics = calculateStockMetrics({
        stock: r.aggregates.rfTotalStock,
        ordersPerDay: r.aggregates.wbTotalOrdersPerDay,
        turnoverNormDays,
      })
      // Показываем только товары у которых Д > 0 (реальный дефицит)
      return rfMetrics.deficit !== null && rfMetrics.deficit > 0
    })
  }

  return {
    products: filteredRows,
    turnoverNormDays,
  }
}

// ──────────────────────────────────────────────────────────────────
// Filter options для StockFilters компонента
// ──────────────────────────────────────────────────────────────────

export async function getStockFilterOptions() {
  const [brands, categories, subcategories] = await Promise.all([
    prisma.brand.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.subcategory.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ])

  return { brands, categories, subcategories }
}
