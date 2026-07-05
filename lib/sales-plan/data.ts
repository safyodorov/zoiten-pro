// lib/sales-plan/data.ts
//
// Prisma-загрузчик для плана продаж v2.
// Мост между БД и pure-движком (computeSalesPlan).
//
// DI-паттерн: функции принимают `db: PrismaClient`, не импортируют глобальный prisma.
// Ноль импортов React / Next.
//
// Экспортирует:
//   loadSalesPlanInputs(db, params)  — всё для computeSalesPlan (ProductPlanInput[] + параметры)
//   loadFactDaily(db, from, to)      — факт двумя разрезами (company + byProduct)
//
// Phase 25 (План продаж v2, 2026-07)

import type { PrismaClient } from "@prisma/client"
import { PRODUCT_HIERARCHY_ORDER_BY } from "@/lib/product-order"
import type { SalesPlanInputs, ProductPlanInput, BuyoutSource } from "./types"
import { resolveArrivalBatches } from "./arrivals"
import type { ArrivalBatchesInput } from "./arrivals"

// ── Константы (повторяют sales-forecast.ts, но локальные — нет cross-import) ──

const FUNNEL_SETTLE_LAG_DAYS = 7     // settled-окно [today−37; today−7]
const FUNNEL_LOOKBACK_DAYS = 30      // длина settled-окна
const ORDERS_LOOKBACK_DAYS = 7       // baseline last-7d
const SEED_DAYS = 3                  // seed [today−3; today−1]

// ── Вспомогательные хелперы дат (UTC) ──────────────────────────────────────

function parseDate(s: string): Date {
  return new Date(s + "T00:00:00Z")
}
function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function addDays(s: string, n: number): string {
  const d = parseDate(s)
  d.setUTCDate(d.getUTCDate() + n)
  return toIso(d)
}

// ── Параметры загрузчика ────────────────────────────────────────────────────

export interface LoadSalesPlanParams {
  today: string          // "2026-07-01"
  horizonFrom: string    // "2026-07-01"
  horizonTo: string      // "2026-12-31"
  deliveryDays: number   // T+3 (из AppSetting salesPlan.leadTimes2)
  returnDays: number     // T+3 возвраты
  wbInboundLagDays: number
  transitDays: number
  defaultLeadTimeDays: number
  safetyStockDays: number
  vpCoverDays: number
}

// ── Основной загрузчик ──────────────────────────────────────────────────────

/**
 * Собирает SalesPlanInputs для computeSalesPlan.
 *
 * Включает:
 *  - активные товары с иерархией + WB-артикулами + monthLevels + dayOverrides + virtualPurchases
 *  - funnel-агрегаты per товар: baselineOrdersPerDay, avgPriceRub, buyoutPct + buyoutSource
 *  - stockNow = Σ WbCard.stockQty + ivanovoStock
 *  - arrivals через resolveArrivalBatches (реальные закупки PLANNED/ACTIVE + virtual)
 *  - seedOrders [today−3; today−1]
 */
export async function loadSalesPlanInputs(
  db: PrismaClient,
  params: LoadSalesPlanParams,
): Promise<SalesPlanInputs> {
  const {
    today,
    horizonFrom,
    horizonTo,
    deliveryDays,
    returnDays,
    wbInboundLagDays,
    transitDays,
    defaultLeadTimeDays,
  } = params

  // ── 1. Marketplace WB id ─────────────────────────────────────────────────
  const wbMarketplace = await db.marketplace.findFirst({
    where: { slug: "wb" },
    select: { id: true },
  })

  // ── 2. Активные товары с иерархией + WB-артикулами + новые отношения v2 ─
  const products = await db.product.findMany({
    where: { deletedAt: null },
    include: {
      brand: { include: { direction: true } },
      category: true,
      subcategory: true,
      articles: wbMarketplace
        ? { where: { marketplaceId: wbMarketplace.id }, select: { article: true } }
        : { select: { article: true } },
      incoming: true,
      salesPlanMonthLevels: true,
      salesPlanDayOverrides: true,
      virtualPurchases: {
        where: { status: { in: ["SUGGESTED", "ACCEPTED"] } },
        select: {
          id: true,
          qty: true,
          expectedArrivalDate: true,
          status: true,
        },
      },
    },
    orderBy: PRODUCT_HIERARCHY_ORDER_BY,
  })

  // ── 3. nmIds per товар ──────────────────────────────────────────────────
  const productToNmIds = new Map<string, number[]>()
  const allNmIds: number[] = []
  for (const p of products) {
    const ids: number[] = []
    for (const a of p.articles) {
      const n = parseInt(a.article, 10)
      if (Number.isFinite(n)) ids.push(n)
    }
    productToNmIds.set(p.id, ids)
    allNmIds.push(...ids)
  }

  // ── 4. WbCard: stockQty + price (fallback для avgPrice) ────────────────
  const cards = await db.wbCard.findMany({
    where: { nmId: { in: allNmIds }, deletedAt: null },
    select: { nmId: true, stockQty: true, price: true, buyoutPercent: true },
  })
  const cardByNmId = new Map(cards.map((c) => [c.nmId, c]))

  // ── 5. Funnel — единый запрос, три окна ────────────────────────────────
  //   settled [today−37; today−7]: buyout%, avgPrice
  //   last7d  [today−7;  today−1]: baseline
  //   seed    [today−3;  today−1]: seedOrders для T+3
  const settledTo = addDays(today, -FUNNEL_SETTLE_LAG_DAYS)         // today−7
  const settledFrom = addDays(settledTo, -FUNNEL_LOOKBACK_DAYS)     // today−37
  const yesterday = addDays(today, -1)
  const last7dStart = addDays(today, -ORDERS_LOOKBACK_DAYS)         // today−7
  const seed7dStart = addDays(today, -SEED_DAYS)                    // today−3

  const funnel =
    allNmIds.length > 0
      ? await db.wbCardFunnelDaily.findMany({
          where: {
            nmId: { in: allNmIds },
            date: { gte: parseDate(settledFrom), lte: parseDate(yesterday) },
          },
          select: {
            nmId: true,
            date: true,
            ordersCount: true,
            buyoutsCount: true,
            buyoutsSumRub: true,
            buyoutPercent: true,
          },
        })
      : []

  // ── 6. Агрегаты funnel per nmId ─────────────────────────────────────────
  const ords7 = new Map<number, number>()                                 // baseline
  const priceWeighted = new Map<number, { num: number; den: number }>()   // avgPrice settled
  const seedByNmId = new Map<number, Map<string, number>>()               // seed orders
  const funnelByNmId = new Map<
    number,
    { pctNum: number; pctDen: number; orders: number; buyouts: number }
  >()
  let globalPctNum = 0
  let globalPctDen = 0

  for (const f of funnel) {
    const iso = toIso(f.date)
    const ords = f.ordersCount ?? 0
    const byts = f.buyoutsCount ?? 0
    const bytRub = f.buyoutsSumRub ?? 0
    const buyPctDaily = f.buyoutPercent // 0..100 или null

    // Settled окно [today−37; today−7]
    if (iso >= settledFrom && iso <= settledTo) {
      const cur = funnelByNmId.get(f.nmId) ?? { pctNum: 0, pctDen: 0, orders: 0, buyouts: 0 }
      cur.orders += ords
      cur.buyouts += byts
      if (buyPctDaily !== null && ords > 0) {
        cur.pctNum += buyPctDaily * ords
        cur.pctDen += ords
        globalPctNum += buyPctDaily * ords
        globalPctDen += ords
      }
      funnelByNmId.set(f.nmId, cur)
      if (byts > 0) {
        const pw = priceWeighted.get(f.nmId) ?? { num: 0, den: 0 }
        pw.num += bytRub
        pw.den += byts
        priceWeighted.set(f.nmId, pw)
      }
    }

    // Last 7d для baseline [today−7; today−1]
    if (iso >= last7dStart && iso <= yesterday) {
      ords7.set(f.nmId, (ords7.get(f.nmId) ?? 0) + ords)
    }

    // Seed [today−3; today−1]
    if (iso >= seed7dStart && iso <= yesterday) {
      if (!seedByNmId.has(f.nmId)) seedByNmId.set(f.nmId, new Map())
      const m = seedByNmId.get(f.nmId)!
      m.set(iso, (m.get(iso) ?? 0) + ords)
    }
  }

  // Глобальный % выкупа (последний fallback)
  const globalBuyout = globalPctDen > 0 ? globalPctNum / globalPctDen / 100 : 0

  // Subcategory % выкупа (предпоследний fallback)
  const nmIdToSubcat = new Map<number, string | null>()
  for (const p of products) {
    const nmIds = productToNmIds.get(p.id) ?? []
    for (const nm of nmIds) nmIdToSubcat.set(nm, p.subcategoryId)
  }
  const funnelBySubcat = new Map<string, { pctNum: number; pctDen: number }>()
  for (const [nm, f] of funnelByNmId) {
    const subcatId = nmIdToSubcat.get(nm)
    if (!subcatId) continue
    const cur = funnelBySubcat.get(subcatId) ?? { pctNum: 0, pctDen: 0 }
    cur.pctNum += f.pctNum
    cur.pctDen += f.pctDen
    funnelBySubcat.set(subcatId, cur)
  }
  const subcatBuyout = new Map<string, number>()
  for (const [subcatId, f] of funnelBySubcat) {
    if (f.pctDen > 0) subcatBuyout.set(subcatId, f.pctNum / f.pctDen / 100)
  }

  // ── 7. Закупки PLANNED/ACTIVE с позициями и этапами (для resolveArrivalBatches) ─
  const purchases = await db.purchase.findMany({
    where: { status: { in: ["PLANNED", "ACTIVE"] } },
    select: {
      id: true,
      plannedArrivalDate: true,
      createdAt: true,
      items: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          stages: {
            select: { stage: true, quantity: true, date: true },
          },
          // SupplierProductLink — через поставщика закупки
        },
      },
    },
  })

  // leadTimeDays per (supplierId, productId) из SupplierProductLink
  const supplierProductLinks = await db.supplierProductLink.findMany({
    select: { supplierId: true, productId: true, leadTimeDays: true },
  })
  // Обобщённый маппинг productId → min(leadTimeDays) среди всех поставщиков
  const minLeadTimeByProduct = new Map<string, number>()
  for (const link of supplierProductLinks) {
    if (link.leadTimeDays == null || link.productId == null) continue
    const cur = minLeadTimeByProduct.get(link.productId)
    if (cur == null || link.leadTimeDays < cur) {
      minLeadTimeByProduct.set(link.productId, link.leadTimeDays)
    }
  }

  // Сгруппируем закупки по productId: список PurchaseInput per товар
  type PurchaseInputForProduct = {
    id: string
    plannedArrivalDate: string | null
    createdAt: string | null
    qtyRemaining: number
    transitQty: number
    transitDate: string | null
    leadTimeDays: number | null
  }
  const purchasesByProductId = new Map<string, PurchaseInputForProduct[]>()

  for (const purchase of purchases) {
    for (const item of purchase.items) {
      const productId = item.productId
      // qtyRemaining = max(0, item.quantity − WAREHOUSE.qty)
      const warehouseStage = item.stages.find((s) => s.stage === "WAREHOUSE")
      const warehouseQty = warehouseStage?.quantity ?? 0
      const qtyRemaining = Math.max(0, item.quantity - warehouseQty)
      if (qtyRemaining <= 0) continue

      // TRANSIT
      const transitStage = item.stages.find((s) => s.stage === "TRANSIT")
      const transitQty = transitStage?.quantity ?? 0
      const transitDate = transitStage?.date ? toIso(transitStage.date) : null

      const arr = purchasesByProductId.get(productId) ?? []
      arr.push({
        id: purchase.id,
        plannedArrivalDate: purchase.plannedArrivalDate ? toIso(purchase.plannedArrivalDate) : null,
        createdAt: purchase.createdAt ? toIso(purchase.createdAt) : null,
        qtyRemaining,
        transitQty,
        transitDate,
        leadTimeDays: minLeadTimeByProduct.get(productId) ?? null,
      })
      purchasesByProductId.set(productId, arr)
    }
  }

  // ── 8. Сборка ProductPlanInput[] ────────────────────────────────────────
  const productInputs: ProductPlanInput[] = []

  for (const p of products) {
    const nmIds = productToNmIds.get(p.id) ?? []

    // Сток и baseline из карточек
    let stockNow = 0
    let baseline = 0
    let cardPriceFallback = 0
    let cardPriceCount = 0
    let cardBuyoutFallback = 0
    let cardBuyoutCount = 0
    // Weighted price per ords7
    let priceWeightedNum = 0
    let priceWeightedDen = 0
    // Weighted buyout per ords7
    let buyoutWeightedNum = 0
    let buyoutWeightedDen = 0
    // Fallback buyout для случая без свежих ords7
    let pctNumSum = 0
    let pctDenSum = 0
    const seedOrders: Record<string, number> = {}

    for (const nm of nmIds) {
      const card = cardByNmId.get(nm)
      if (card) {
        stockNow += card.stockQty ?? 0
        if (card.price != null) {
          cardPriceFallback += card.price
          cardPriceCount++
        }
        if (card.buyoutPercent != null) {
          cardBuyoutFallback += card.buyoutPercent
          cardBuyoutCount++
        }
      }
      const nmOrds7 = ords7.get(nm) ?? 0
      baseline += nmOrds7 / ORDERS_LOOKBACK_DAYS

      const pw = priceWeighted.get(nm)
      if (pw && pw.den > 0) {
        const nmAvgPrice = pw.num / pw.den
        priceWeightedNum += nmAvgPrice * nmOrds7
        priceWeightedDen += nmOrds7
      }

      const f = funnelByNmId.get(nm)
      if (f && f.pctDen > 0) {
        const nmRate = f.pctNum / f.pctDen / 100
        buyoutWeightedNum += nmRate * nmOrds7
        buyoutWeightedDen += nmOrds7
        pctNumSum += f.pctNum
        pctDenSum += f.pctDen
      }

      const sm = seedByNmId.get(nm)
      if (sm) {
        for (const [d, q] of sm) {
          seedOrders[d] = (seedOrders[d] ?? 0) + q
        }
      }
    }

    // Иваново
    stockNow += p.ivanovoStock ?? 0

    // avgPriceRub
    let avgPriceRub = 0
    if (priceWeightedDen > 0) {
      avgPriceRub = priceWeightedNum / priceWeightedDen
    } else if (cardPriceCount > 0) {
      avgPriceRub = cardPriceFallback / cardPriceCount
    }

    // buyoutPct — 4-уровневая цепочка (own → legacy → subcategory → global)
    let buyoutPct = 0
    let buyoutSource: BuyoutSource = "global"
    if (buyoutWeightedDen > 0) {
      buyoutPct = buyoutWeightedNum / buyoutWeightedDen
      buyoutSource = "own"
    } else if (pctDenSum > 0) {
      buyoutPct = pctNumSum / pctDenSum / 100
      buyoutSource = "own"
    } else if (cardBuyoutCount > 0) {
      buyoutPct = cardBuyoutFallback / cardBuyoutCount / 100
      buyoutSource = "legacy"
    } else if (p.subcategoryId && subcatBuyout.has(p.subcategoryId)) {
      buyoutPct = subcatBuyout.get(p.subcategoryId)!
      buyoutSource = "subcategory"
    } else {
      buyoutPct = globalBuyout
      buyoutSource = "global"
    }

    // monthLevels — сериализуем (Date → ISO string, Float остаётся number)
    const monthLevels = p.salesPlanMonthLevels.map((ml) => ({
      month: toIso(ml.month),
      targetOrdersPerDay: ml.targetOrdersPerDay ?? null,
      priceRub: ml.priceRub ?? null,
      // buyoutPct хранится как 0..100 (% от 100), движку нужно 0..1
      buyoutPct: ml.buyoutPct != null ? ml.buyoutPct / 100 : null,
    }))

    // dayOverrides — сериализуем
    const dayOverrides: Record<string, number> = {}
    for (const ov of p.salesPlanDayOverrides) {
      dayOverrides[toIso(ov.date)] = ov.ordersPerDay
    }

    // arrivals через resolveArrivalBatches
    const arrivalInput: ArrivalBatchesInput = {
      productId: p.id,
      purchases: purchasesByProductId.get(p.id) ?? [],
      virtualPurchases: p.virtualPurchases.map((vp) => ({
        id: vp.id,
        qty: vp.qty,
        expectedArrivalDate: toIso(vp.expectedArrivalDate),
        status: vp.status as "SUGGESTED" | "ACCEPTED" | "DISMISSED" | "CONVERTED",
      })),
      legacyIncoming:
        p.incoming?.expectedDate != null
          ? { expectedDate: toIso(p.incoming.expectedDate), qty: p.incoming.orderedQty ?? 0 }
          : null,
      wbInboundLagDays,
      transitDays,
      defaultLeadTimeDays,
    }
    const arrivals = resolveArrivalBatches(arrivalInput)

    productInputs.push({
      productId: p.id,
      sku: p.sku,
      name: p.name,
      brandId: p.brandId ?? null,
      brandName: p.brand?.name ?? null,
      directionId: p.brand?.direction?.id ?? null,
      directionName: p.brand?.direction?.name ?? null,
      categoryId: p.categoryId ?? null,
      categoryName: p.category?.name ?? null,
      subcategoryId: p.subcategoryId ?? null,
      subcategoryName: p.subcategory?.name ?? null,
      nmIds,
      stockNow,
      baselineOrdersPerDay: baseline,
      buyoutPct,
      buyoutSource,
      avgPriceRub,
      monthLevels,
      dayOverrides,
      arrivals,
      seedOrders,
      // Phase 27: скалярные поля грузятся через include автоматически (не select → не нужны явно)
      abcStatus: p.abcStatus ?? null,
      orderEnabled: p.orderEnabled,
    })
  }

  return {
    today,
    horizonFrom,
    horizonTo,
    deliveryDays,
    returnDays,
    wbInboundLagDays,
    products: productInputs,
  }
}

// ── loadFactDaily ────────────────────────────────────────────────────────────

export interface FactDailyRow {
  buyoutsRub: number
  ordersRub: number
  buyoutsUnits: number
  ordersUnits: number
}

export interface FactDailyResult {
  /** (а) company-level: SUM по ВСЕМ nmId в funnel (включая непривязанных) GROUP BY date */
  company: Map<string, FactDailyRow>
  /** (б) product-level: через MarketplaceArticle — nmId → productId */
  byProduct: Map<string, Map<string, FactDailyRow>>
  /** Дни строго <= settledThroughIso считаются settled (выкупы финализированы WB) */
  settledThroughIso: string
  /** Redemption-факт по дате РЕАЛИЗАЦИИ (WbSalesDaily) — company-level.
   *  buyoutsRub = НЕТТО = выкупы − возвраты (кабинетный «Фактический оборот» WB). */
  redemptionCompany: Map<string, FactDailyRow>
  /** Redemption-факт по товарам (productId → date → row); buyoutsRub = нетто (выкупы − возвраты). */
  redemptionByProduct: Map<string, Map<string, FactDailyRow>>
  /** Дни <= этой даты считаются settled для redemption (today−2, НЕ today−7) */
  redemptionSettledThroughIso: string
}

/**
 * Загружает факт продаж из WbCardFunnelDaily за период [from; to] двумя разрезами.
 *
 * Company-level — для сравнения с ИУ (весь кабинет, включая 73 непривязанных nmId).
 * Product-level — для строк товаров (через MarketplaceArticle join).
 * settledThroughIso = today−7 (дни свежее помечаются unsettled на стороне потребителя).
 */
export async function loadFactDaily(
  db: PrismaClient,
  from: string,
  to: string,
): Promise<FactDailyResult> {
  // Settle-лаг: сегодня = текущий день MSK
  const nowMsk = new Date(Date.now() + 3 * 60 * 60 * 1000)
  const todayMsk = nowMsk.toISOString().slice(0, 10)
  const settledThroughIso = addDays(todayMsk, -FUNNEL_SETTLE_LAG_DAYS) // today−7

  // (а) Company-level: все nmId кабинета за период
  const companyFunnel = await db.wbCardFunnelDaily.findMany({
    where: {
      date: { gte: parseDate(from), lte: parseDate(to) },
    },
    select: {
      date: true,
      ordersCount: true,
      ordersSumRub: true,
      buyoutsCount: true,
      buyoutsSumRub: true,
    },
  })

  const company = new Map<string, FactDailyRow>()
  for (const f of companyFunnel) {
    const iso = toIso(f.date)
    const cur = company.get(iso) ?? { buyoutsRub: 0, ordersRub: 0, buyoutsUnits: 0, ordersUnits: 0 }
    cur.buyoutsRub += f.buyoutsSumRub ?? 0
    cur.ordersRub += f.ordersSumRub ?? 0
    cur.buyoutsUnits += f.buyoutsCount ?? 0
    cur.ordersUnits += f.ordersCount ?? 0
    company.set(iso, cur)
  }

  // (б) Product-level: MarketplaceArticle join (канонический паттерн sales-forecast.ts:219-265)
  const wbMarketplace = await db.marketplace.findFirst({
    where: { slug: "wb" },
    select: { id: true },
  })

  const byProduct = new Map<string, Map<string, FactDailyRow>>()
  // Объявляем в общем scope для переиспользования в redemption-блоке
  const nmIdToProductId = new Map<number, string>()

  if (wbMarketplace) {
    // Загружаем все WB-артикулы с привязкой к товарам
    const articles = await db.marketplaceArticle.findMany({
      where: {
        marketplaceId: wbMarketplace.id,
        product: { deletedAt: null },
      },
      select: { article: true, productId: true },
    })

    // nmId → productId
    const linkedNmIds: number[] = []
    for (const a of articles) {
      const nmId = parseInt(a.article, 10)
      if (Number.isFinite(nmId)) {
        nmIdToProductId.set(nmId, a.productId)
        linkedNmIds.push(nmId)
      }
    }

    if (linkedNmIds.length > 0) {
      const productFunnel = await db.wbCardFunnelDaily.findMany({
        where: {
          nmId: { in: linkedNmIds },
          date: { gte: parseDate(from), lte: parseDate(to) },
        },
        select: {
          nmId: true,
          date: true,
          ordersCount: true,
          ordersSumRub: true,
          buyoutsCount: true,
          buyoutsSumRub: true,
        },
      })

      for (const f of productFunnel) {
        const productId = nmIdToProductId.get(f.nmId)
        if (!productId) continue
        const iso = toIso(f.date)

        if (!byProduct.has(productId)) byProduct.set(productId, new Map())
        const productMap = byProduct.get(productId)!
        const cur = productMap.get(iso) ?? { buyoutsRub: 0, ordersRub: 0, buyoutsUnits: 0, ordersUnits: 0 }
        cur.buyoutsRub += f.buyoutsSumRub ?? 0
        cur.ordersRub += f.ordersSumRub ?? 0
        cur.buyoutsUnits += f.buyoutsCount ?? 0
        cur.ordersUnits += f.ordersCount ?? 0
        productMap.set(iso, cur)
      }
    }
  }

  // ── Redemption (дата реализации, WbSalesDaily) ──────────────────────────────
  // settledThrough = today−2 (выкупы финализируются быстрее когортного funnel)
  const redemptionSettledThroughIso = addDays(todayMsk, -2)

  const salesRows = await db.wbSalesDaily.findMany({
    where: { date: { gte: parseDate(from), lte: parseDate(to) } },
    select: { nmId: true, date: true, buyoutsRub: true, returnsRub: true, buyoutsCount: true },
  })

  // company-level: суммируем все nmId кабинета (включая непривязанных к товарам).
  // buyoutsRub = НЕТТО = выкупы + возвраты (returnsRub отрицательный) = кабинетный «Фактический оборот».
  const redemptionCompany = new Map<string, FactDailyRow>()
  for (const s of salesRows) {
    const iso = toIso(s.date)
    const cur = redemptionCompany.get(iso) ?? { buyoutsRub: 0, ordersRub: 0, buyoutsUnits: 0, ordersUnits: 0 }
    cur.buyoutsRub += (s.buyoutsRub ?? 0) + (s.returnsRub ?? 0)
    cur.buyoutsUnits += s.buyoutsCount ?? 0
    redemptionCompany.set(iso, cur)
  }

  // product-level: тот же nmId→productId join (nmIdToProductId собран выше)
  const redemptionByProduct = new Map<string, Map<string, FactDailyRow>>()
  if (wbMarketplace) {
    for (const s of salesRows) {
      const productId = nmIdToProductId.get(s.nmId)
      if (!productId) continue
      const iso = toIso(s.date)
      if (!redemptionByProduct.has(productId)) redemptionByProduct.set(productId, new Map())
      const m = redemptionByProduct.get(productId)!
      const cur = m.get(iso) ?? { buyoutsRub: 0, ordersRub: 0, buyoutsUnits: 0, ordersUnits: 0 }
      cur.buyoutsRub += (s.buyoutsRub ?? 0) + (s.returnsRub ?? 0) // нетто (выкупы − возвраты)
      cur.buyoutsUnits += s.buyoutsCount ?? 0
      m.set(iso, cur)
    }
  }

  return {
    company,
    byProduct,
    settledThroughIso,
    redemptionCompany,
    redemptionByProduct,
    redemptionSettledThroughIso,
  }
}
