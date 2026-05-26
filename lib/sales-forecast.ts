// lib/sales-forecast.ts
// Прогноз выкупов до заданной даты per Product.
//
// Логика — единый источник правды (используется и /sales-plan дашбордом,
// и scripts/forecast-sales.ts через будущий рефактор).
//
// Модель:
//  • Baseline ставка заказов = avg за 7 дней (WbCardOrdersDaily.qty)
//  • plannedSalesPerDay (ProductIncoming) — target orders post-arrival, ramp 3 раб. дней
//  • Сток = WbCard.stockQty + приходы на expectedDate+1
//  • % выкупа — взвешенный 30d из WbCardFunnelDaily (buyouts/orders) → fallback на legacy WbCard.buyoutPercent → fallback на глобальный
//  • Выкупы засчитываются на T+3 от заказа, возвраты на T+6 пополняют сток.

import { prisma } from "@/lib/prisma"

// ── Константы модели ─────────────────────────────────────────────
export const ORDERS_LOOKBACK_DAYS = 7
export const FUNNEL_LOOKBACK_DAYS = 30
export const DELIVERY_TO_CUSTOMER_DAYS = 3
export const RETURN_FROM_CUSTOMER_DAYS = 3
export const RAMP_UP_WORKING_DAYS = 3
const RETURN_LAG = DELIVERY_TO_CUSTOMER_DAYS + RETURN_FROM_CUSTOMER_DAYS // 6

// ── Хелперы дат (UTC) ────────────────────────────────────────────
function parseDate(s: string): Date {
  return new Date(s + "T00:00:00Z")
}
function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}
export function addDays(s: string, n: number): string {
  const d = parseDate(s)
  d.setUTCDate(d.getUTCDate() + n)
  return toIso(d)
}
function diffDays(a: string, b: string): number {
  return Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / 86_400_000)
}
function isWorkingDay(s: string): boolean {
  const d = parseDate(s).getUTCDay()
  return d >= 1 && d <= 5
}
function workingDaysBetween(from: string, to: string): number {
  if (diffDays(to, from) <= 0) return 0
  let count = 0
  let cur = from
  while (cur !== to) {
    cur = addDays(cur, 1)
    if (isWorkingDay(cur)) count++
  }
  return count
}
function rangeIso(from: string, to: string): string[] {
  const out: string[] = []
  let cur = from
  while (cur <= to) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}
export function getMskTodayIso(): string {
  // MSK = UTC+3
  const now = new Date()
  const msk = new Date(now.getTime() + 3 * 60 * 60 * 1000)
  return msk.toISOString().slice(0, 10)
}

// ── Типы ─────────────────────────────────────────────────────────

export interface ForecastInput {
  endDate: string // YYYY-MM-DD включительно
  today?: string // YYYY-MM-DD; по умолчанию getMskTodayIso()
}

// Источник % выкупа:
//  own  — собственная funnel-история за 30 дней
//  legacy — legacy WbCard.buyoutPercent (агрегированная WB за месяц)
//  subcategory — среднее по подкатегории (взвешенное по объёму заказов)
//  global — глобальное среднее (последний fallback)
export type BuyoutSource = "own" | "legacy" | "subcategory" | "global"

export interface ProductForecast {
  productId: string
  sku: string
  name: string
  photoUrl: string | null
  brandId: string
  brandName: string
  directionId: string | null
  directionName: string | null
  categoryId: string | null
  categoryName: string | null
  subcategoryId: string | null
  subcategoryName: string | null
  nmIds: number[]
  stockNow: number
  baselineOrdersPerDay: number
  avgPrice: number
  buyoutPct: number
  buyoutSource: BuyoutSource
  buyoutFallback: boolean // true если source != "own"
  arrivalDate: string | null
  arrivalQty: number
  plannedTargetPerDay: number | null
  ordersUnits: number
  salesUnits: number
  salesRub: number
  // дневная кривая выкупов (для модалки)
  dailySales: Array<{ date: string; units: number; rub: number }>
}

export interface ForecastResult {
  today: string
  endDate: string
  globalBuyoutPct: number
  fallbackCount: number
  // Сколько товаров получили % выкупа из каждого источника
  bySource: Record<BuyoutSource, number>
  products: ProductForecast[]
}

// ── Внутренние ────────────────────────────────────────────────────

interface ProductMeta {
  productId: string
  sku: string
  name: string
  photoUrl: string | null
  brandId: string
  brandName: string
  directionId: string | null
  directionName: string | null
  categoryId: string | null
  categoryName: string | null
  subcategoryId: string | null
  subcategoryName: string | null
  nmIds: number[]
  stockNow: number
  baselineOrdersPerDay: number
  avgPrice: number
  buyoutPct: number
  buyoutSource: BuyoutSource
  arrivalDate: string | null
  arrivalQty: number
  plannedTargetPerDay: number | null
  seedOrders: Record<string, number>
}

// ── Основная функция ─────────────────────────────────────────────

export async function computeForecast(input: ForecastInput): Promise<ForecastResult> {
  const today = input.today ?? getMskTodayIso()
  const endDate = input.endDate

  // 1. Marketplace WB
  const wbMarketplace = await prisma.marketplace.findFirst({
    where: { slug: "wb" },
    select: { id: true },
  })
  if (!wbMarketplace) {
    return {
      today,
      endDate,
      globalBuyoutPct: 0,
      fallbackCount: 0,
      bySource: { own: 0, legacy: 0, subcategory: 0, global: 0 },
      products: [],
    }
  }

  // 2. Все активные товары
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    include: {
      brand: { include: { direction: true } },
      category: true,
      subcategory: true,
      articles: {
        where: { marketplaceId: wbMarketplace.id },
        select: { article: true },
      },
      incoming: true,
    },
  })

  // 3. Все nmIds
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

  // 4. WB carts
  const cards = await prisma.wbCard.findMany({
    where: { nmId: { in: allNmIds }, deletedAt: null },
    select: { nmId: true, stockQty: true, price: true, buyoutPercent: true },
  })
  const cardByNmId = new Map(cards.map((c) => [c.nmId, c]))

  // 5. Orders last 7d + seed last 3d
  const ordersFrom = addDays(today, -ORDERS_LOOKBACK_DAYS - DELIVERY_TO_CUSTOMER_DAYS)
  const ordersTo = addDays(today, -1)
  const orders = await prisma.wbCardOrdersDaily.findMany({
    where: {
      nmId: { in: allNmIds },
      date: { gte: parseDate(ordersFrom), lte: parseDate(ordersTo) },
    },
    select: { nmId: true, date: true, qty: true, buyerPrice: true },
  })

  // 6. Funnel rolling 30d
  const funnelFrom = addDays(today, -FUNNEL_LOOKBACK_DAYS)
  const funnel = await prisma.wbCardFunnelDaily.findMany({
    where: {
      nmId: { in: allNmIds },
      date: { gte: parseDate(funnelFrom), lte: parseDate(addDays(today, -1)) },
    },
    select: { nmId: true, date: true, ordersCount: true, buyoutsCount: true },
  })

  // 7. Агрегаты per nmId
  const ords7 = new Map<number, number>()
  const priceWeighted = new Map<number, { num: number; den: number }>()
  const seedByNmId = new Map<number, Map<string, number>>()
  const seedFrom = addDays(today, -DELIVERY_TO_CUSTOMER_DAYS)
  for (const o of orders) {
    const iso = toIso(o.date)
    const inLast7 =
      iso >= addDays(today, -ORDERS_LOOKBACK_DAYS) && iso <= addDays(today, -1)
    if (inLast7) {
      ords7.set(o.nmId, (ords7.get(o.nmId) ?? 0) + o.qty)
      if (o.buyerPrice != null && o.qty > 0) {
        const pw = priceWeighted.get(o.nmId) ?? { num: 0, den: 0 }
        pw.num += o.buyerPrice * o.qty
        pw.den += o.qty
        priceWeighted.set(o.nmId, pw)
      }
    }
    if (iso >= seedFrom && iso <= addDays(today, -1)) {
      if (!seedByNmId.has(o.nmId)) seedByNmId.set(o.nmId, new Map())
      const m = seedByNmId.get(o.nmId)!
      m.set(iso, (m.get(iso) ?? 0) + o.qty)
    }
  }

  const funnelByNmId = new Map<number, { orders: number; buyouts: number }>()
  let globalOrders = 0
  let globalBuyouts = 0
  for (const f of funnel) {
    const cur = funnelByNmId.get(f.nmId) ?? { orders: 0, buyouts: 0 }
    cur.orders += f.ordersCount ?? 0
    cur.buyouts += f.buyoutsCount ?? 0
    funnelByNmId.set(f.nmId, cur)
    globalOrders += f.ordersCount ?? 0
    globalBuyouts += f.buyoutsCount ?? 0
  }
  const globalBuyout = globalOrders > 0 ? globalBuyouts / globalOrders : 0

  // 7.1. Funnel per Subcategory — взвешенный по объёму заказов
  // (используется как fallback до глобального для товаров без собственной истории).
  // Маппинг: nmId → subcategoryId через Product.subcategoryId.
  const nmIdToSubcat = new Map<number, string | null>()
  for (const p of products) {
    const nmIds = productToNmIds.get(p.id) ?? []
    for (const nm of nmIds) nmIdToSubcat.set(nm, p.subcategoryId)
  }
  const funnelBySubcat = new Map<string, { orders: number; buyouts: number }>()
  for (const [nm, f] of funnelByNmId) {
    const subcatId = nmIdToSubcat.get(nm)
    if (!subcatId) continue
    const cur = funnelBySubcat.get(subcatId) ?? { orders: 0, buyouts: 0 }
    cur.orders += f.orders
    cur.buyouts += f.buyouts
    funnelBySubcat.set(subcatId, cur)
  }
  const subcatBuyout = new Map<string, number>()
  for (const [subcatId, f] of funnelBySubcat) {
    if (f.orders > 0) subcatBuyout.set(subcatId, f.buyouts / f.orders)
  }

  // 8. Сборка ProductMeta
  const metas: ProductMeta[] = []
  let fallbackCount = 0
  const bySource: Record<BuyoutSource, number> = {
    own: 0,
    legacy: 0,
    subcategory: 0,
    global: 0,
  }
  for (const p of products) {
    const nmIds = productToNmIds.get(p.id) ?? []

    let stockNow = 0
    let baseline = 0
    let priceNum = 0
    let priceDen = 0
    let cardPriceFallback = 0
    let cardPriceCount = 0
    let cardBuyoutFallback = 0
    let cardBuyoutCount = 0
    let funnelOrders = 0
    let funnelBuyouts = 0
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
      baseline += (ords7.get(nm) ?? 0) / ORDERS_LOOKBACK_DAYS
      const pw = priceWeighted.get(nm)
      if (pw) {
        priceNum += pw.num
        priceDen += pw.den
      }
      const f = funnelByNmId.get(nm)
      if (f) {
        funnelOrders += f.orders
        funnelBuyouts += f.buyouts
      }
      const sm = seedByNmId.get(nm)
      if (sm) {
        for (const [d, q] of sm) {
          seedOrders[d] = (seedOrders[d] ?? 0) + q
        }
      }
    }

    let avgPrice = 0
    if (priceDen > 0) avgPrice = priceNum / priceDen
    else if (cardPriceCount > 0) avgPrice = cardPriceFallback / cardPriceCount

    let buyoutPct = 0
    let buyoutSource: BuyoutSource = "global"
    if (funnelOrders > 0) {
      buyoutPct = funnelBuyouts / funnelOrders
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
    bySource[buyoutSource]++
    if (buyoutSource !== "own") fallbackCount++

    metas.push({
      productId: p.id,
      sku: p.sku,
      name: p.name,
      photoUrl: p.photoUrl,
      brandId: p.brandId,
      brandName: p.brand.name,
      directionId: p.brand.direction?.id ?? null,
      directionName: p.brand.direction?.name ?? null,
      categoryId: p.categoryId,
      categoryName: p.category?.name ?? null,
      subcategoryId: p.subcategoryId,
      subcategoryName: p.subcategory?.name ?? null,
      nmIds,
      stockNow,
      baselineOrdersPerDay: baseline,
      avgPrice,
      buyoutPct,
      buyoutSource,
      arrivalDate: p.incoming?.expectedDate
        ? toIso(p.incoming.expectedDate)
        : null,
      arrivalQty: p.incoming?.orderedQty ?? 0,
      plannedTargetPerDay: p.incoming?.plannedSalesPerDay ?? null,
      seedOrders,
    })
  }

  // 9. Симуляция per Product
  const results: ProductForecast[] = metas.map((m) =>
    simulateProduct(m, today, endDate),
  )

  return {
    today,
    endDate,
    globalBuyoutPct: globalBuyout,
    fallbackCount,
    bySource,
    products: results,
  }
}

function simulateProduct(
  p: ProductMeta,
  today: string,
  endDate: string,
): ProductForecast {
  const horizonStart = today
  const horizonEnd = endDate
  const simEnd = addDays(horizonEnd, DELIVERY_TO_CUSTOMER_DAYS + RETURN_LAG)
  const days = rangeIso(horizonStart, simEnd)

  const stock: Record<string, number> = {}
  const orders: Record<string, number> = {}
  const dailySalesUnits: Record<string, number> = {}
  const dailySalesRub: Record<string, number> = {}
  let salesUnits = 0
  let salesRub = 0
  let ordersUnits = 0

  stock[horizonStart] = p.stockNow

  function accrueSale(buyoutDate: string, units: number) {
    const rub = units * p.avgPrice
    salesUnits += units
    salesRub += rub
    dailySalesUnits[buyoutDate] = (dailySalesUnits[buyoutDate] ?? 0) + units
    dailySalesRub[buyoutDate] = (dailySalesRub[buyoutDate] ?? 0) + rub
  }

  // Seed выкупы от заказов в past 3 дня
  for (const [d, q] of Object.entries(p.seedOrders)) {
    const buyoutDate = addDays(d, DELIVERY_TO_CUSTOMER_DAYS)
    if (buyoutDate >= horizonStart && buyoutDate <= horizonEnd) {
      accrueSale(buyoutDate, q * p.buyoutPct)
    }
    const returnDate = addDays(d, RETURN_LAG)
    if (returnDate >= horizonStart && returnDate <= simEnd) {
      stock[returnDate] = (stock[returnDate] ?? 0) + q * (1 - p.buyoutPct)
    }
  }

  for (let i = 0; i < days.length; i++) {
    const d = days[i]
    if (i > 0) {
      const prev = days[i - 1]
      const inflow =
        p.arrivalDate && addDays(p.arrivalDate, 1) === d ? p.arrivalQty : 0
      const returnsToday = stock[d] ?? 0
      stock[d] = (stock[prev] ?? 0) - (orders[prev] ?? 0) + inflow + returnsToday
      if (stock[d] < 0) stock[d] = 0
    }

    let rate: number
    if (
      p.arrivalDate &&
      p.plannedTargetPerDay != null &&
      d >= addDays(p.arrivalDate, 1)
    ) {
      const wd = workingDaysBetween(addDays(p.arrivalDate, 1), d) + 1
      const factor = wd >= RAMP_UP_WORKING_DAYS ? 1 : wd / RAMP_UP_WORKING_DAYS
      rate =
        p.baselineOrdersPerDay +
        (p.plannedTargetPerDay - p.baselineOrdersPerDay) * factor
    } else {
      rate = p.baselineOrdersPerDay
    }

    const actual = Math.min(rate, stock[d] ?? 0)
    orders[d] = actual
    if (d <= horizonEnd) ordersUnits += actual

    const buyoutDate = addDays(d, DELIVERY_TO_CUSTOMER_DAYS)
    if (buyoutDate >= horizonStart && buyoutDate <= horizonEnd) {
      accrueSale(buyoutDate, actual * p.buyoutPct)
    }
    const returnDate = addDays(d, RETURN_LAG)
    if (returnDate <= simEnd) {
      stock[returnDate] =
        (stock[returnDate] ?? 0) + actual * (1 - p.buyoutPct)
    }
  }

  // Dailysales: сводим в массив отсортированных дней
  const dailySales: Array<{ date: string; units: number; rub: number }> = []
  for (const d of rangeIso(horizonStart, horizonEnd)) {
    dailySales.push({
      date: d,
      units: dailySalesUnits[d] ?? 0,
      rub: dailySalesRub[d] ?? 0,
    })
  }

  return {
    productId: p.productId,
    sku: p.sku,
    name: p.name,
    photoUrl: p.photoUrl,
    brandId: p.brandId,
    brandName: p.brandName,
    directionId: p.directionId,
    directionName: p.directionName,
    categoryId: p.categoryId,
    categoryName: p.categoryName,
    subcategoryId: p.subcategoryId,
    subcategoryName: p.subcategoryName,
    nmIds: p.nmIds,
    stockNow: p.stockNow,
    baselineOrdersPerDay: p.baselineOrdersPerDay,
    avgPrice: p.avgPrice,
    buyoutPct: p.buyoutPct,
    buyoutSource: p.buyoutSource,
    buyoutFallback: p.buyoutSource !== "own",
    arrivalDate: p.arrivalDate,
    arrivalQty: p.arrivalQty,
    plannedTargetPerDay: p.plannedTargetPerDay,
    ordersUnits,
    salesUnits,
    salesRub,
    dailySales,
  }
}
