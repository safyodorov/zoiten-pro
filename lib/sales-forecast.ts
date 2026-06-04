// lib/sales-forecast.ts
// Прогноз выкупов до заданной даты per Product.
//
// Логика — единый источник правды (используется и /sales-plan дашбордом,
// и scripts/forecast-sales.ts через будущий рефактор).
//
// Модель:
//  • Baseline ставка заказов = avg за 7 дней (WbCardOrdersDaily.qty)
//  • plannedSalesPerDay (ProductIncoming) — target orders post-arrival, ramp 3 раб. дней
//  • Сток = WbCard.stockQty (ВБ) + Product.ivanovoStock (Иваново) + приходы на expectedDate+1
//  • % выкупа — взвешенный 30d из WbCardFunnelDaily (buyouts/orders) → fallback на legacy WbCard.buyoutPercent → fallback на глобальный
//  • Выкупы засчитываются на T+3 от заказа, возвраты на T+6 пополняют сток.

import { prisma } from "@/lib/prisma"
import { PRODUCT_HIERARCHY_ORDER_BY } from "@/lib/product-order"

// ── Константы модели ─────────────────────────────────────────────
export const ORDERS_LOOKBACK_DAYS = 7
export const FUNNEL_LOOKBACK_DAYS = 30
// КРИТИЧНО: funnel-окно сдвигается на FUNNEL_SETTLE_LAG_DAYS назад.
// Причина: WbCardFunnelDaily.ordersCount на день D — заказы дня D, а
// buyoutsCount на тот же D — выкупы дня D (которые были заказаны ~3 дня назад).
// При SUM по «свежему» окну [-30, -1] заказы за последние 3 дня попадают в
// знаменатель, а соответствующие им выкупы ещё не материализовались —
// % выкупа искусственно занижается на 15-20 п.п. Сдвиг на 7 дней даёт
// «settled» окно где и заказы, и их выкупы полностью внутри.
export const FUNNEL_SETTLE_LAG_DAYS = 7
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
  endDate: string // YYYY-MM-DD включительно — горизонт учёта (KPI/totals/leftover)
  today?: string // YYYY-MM-DD; по умолчанию getMskTodayIso()
  // Горизонт дневной кривой выкупов (dailySales[]). По умолчанию = endDate.
  chartEndDate?: string
  // Пользовательские корректировки baseline-заказов per Product (productId → orders/day).
  baselineOverrides?: Record<string, number>
  // Пользовательские корректировки цены выкупа per Product (productId → цена ₽).
  // Перекрывают расчётную avgPrice — влияют на выручку и остаток в деньгах.
  priceOverrides?: Record<string, number>
  // Кастомные lead times (по умолчанию DELIVERY_TO_CUSTOMER_DAYS / RETURN_FROM_CUSTOMER_DAYS).
  // Используются для what-if сценариев. Целые числа >= 0.
  deliveryDaysOverride?: number
  returnDaysOverride?: number
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
  // Override-семантика:
  //   • Если plannedTargetPerDay задан → override меняет ПЛАН (post-arrival).
  //     baselineUsed остаётся = baselineOrdersPerDay (что есть сейчас).
  //   • Если plannedTargetPerDay не задан → override меняет baseline.
  // `overrideAppliesTo` явно показывает, на что повлиял override.
  // `effectiveRate` — то, что показываем в колонке «Зак/день» (план если есть,
  // иначе baseline) — оба с применённым override.
  rateOverride: number | null
  overrideAppliesTo: "planned" | "baseline" | null
  baselineUsed: number
  plannedTargetUsed: number | null
  effectiveRate: number
  ordersUnits: number
  salesUnits: number
  salesRub: number
  // Остаток на endDate+1 (наутро после окончания учётного периода).
  // Деньги — по той же avgPrice что и для salesRub.
  endStockUnits: number
  endStockRub: number
  // дневная кривая выкупов (для модалки и общего графика — может выходить
  // за endDate, если chartEndDate был передан)
  dailySales: Array<{ date: string; units: number; rub: number }>
}

export interface ForecastResult {
  today: string
  endDate: string
  chartEndDate: string
  globalBuyoutPct: number
  fallbackCount: number
  // Сколько товаров получили % выкупа из каждого источника
  bySource: Record<BuyoutSource, number>
  products: ProductForecast[]
  // Lead times использованные в симуляции (с учётом override)
  deliveryDays: number
  returnDays: number
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
  // Дата последнего изменения плана (ProductIncoming.updatedAt) — ISO YYYY-MM-DD.
  // Для товара без даты прихода план применяется через 3 дня после этой даты.
  plannedSetDate: string | null
  seedOrders: Record<string, number>
}

// ── Основная функция ─────────────────────────────────────────────

export async function computeForecast(input: ForecastInput): Promise<ForecastResult> {
  const today = input.today ?? getMskTodayIso()
  const endDate = input.endDate
  const chartEndDate =
    input.chartEndDate && input.chartEndDate > endDate
      ? input.chartEndDate
      : endDate
  // Lead-times с override-ами
  const deliveryDays =
    typeof input.deliveryDaysOverride === "number" &&
    Number.isFinite(input.deliveryDaysOverride) &&
    input.deliveryDaysOverride >= 0
      ? Math.round(input.deliveryDaysOverride)
      : DELIVERY_TO_CUSTOMER_DAYS
  const returnDays =
    typeof input.returnDaysOverride === "number" &&
    Number.isFinite(input.returnDaysOverride) &&
    input.returnDaysOverride >= 0
      ? Math.round(input.returnDaysOverride)
      : RETURN_FROM_CUSTOMER_DAYS
  const returnLagRuntime = deliveryDays + returnDays

  // 1. Marketplace WB
  const wbMarketplace = await prisma.marketplace.findFirst({
    where: { slug: "wb" },
    select: { id: true },
  })
  if (!wbMarketplace) {
    return {
      today,
      endDate,
      chartEndDate,
      globalBuyoutPct: 0,
      fallbackCount: 0,
      bySource: { own: 0, legacy: 0, subcategory: 0, global: 0 },
      products: [],
      deliveryDays,
      returnDays,
    }
  }

  // 2. Все активные товары — в иерархическом порядке (Направление → Бренд →
  // Категория → Подкатегория → name), как в /prices/wb и /products.
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
    orderBy: PRODUCT_HIERARCHY_ORDER_BY,
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

  // 5. Funnel — единственный источник истины (analytics API).
  // WbCardOrdersDaily (sales API) систематически underreport'ит ~40% — не используем.
  //   • Settled окно [today-37, today-7] → buyout%, avgPrice
  //   • Окно [today-7, today-1] → baseline (avg orders/day)
  //   • Окно [today-3, today-1] → seed (orders → выкупы в первые дни прогноза)
  const settledTo = addDays(today, -FUNNEL_SETTLE_LAG_DAYS) // today-7
  const settledFrom = addDays(settledTo, -FUNNEL_LOOKBACK_DAYS) // today-37
  const yesterday = addDays(today, -1)
  // Берём шире — settledFrom .. yesterday — покрывает все три окна одним запросом.
  const funnel = await prisma.wbCardFunnelDaily.findMany({
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
      // Используется как primary источник % выкупа — это WB-собственное число
      // (учитывает cancelCount, не равно buyoutsCount/ordersCount). NULL для
      // дней, по которым WB ещё не закрыл статистику.
      buyoutPercent: true,
    },
  })

  // 7. Агрегаты per nmId (все три окна — из одного funnel-запроса).
  // ords7 хранит сумму заказов last 7d per nmId — используется и как baseline,
  // и как вес при расчёте per-product % выкупа.
  const ords7 = new Map<number, number>()
  const priceWeighted = new Map<number, { num: number; den: number }>() // avgPrice
  const seedByNmId = new Map<number, Map<string, number>>()
  const seed7dStart = addDays(today, -DELIVERY_TO_CUSTOMER_DAYS) // today-3
  const last7dStart = addDays(today, -ORDERS_LOOKBACK_DAYS) // today-7

  // Per-nmId аккумулятор % выкупа: SUM(buyoutPercent × ordersCount) / SUM(ordersCount)
  // — та же формула что в /prices/wb (loadBuyoutPctRolling30dMap), use WB-own
  // buyoutPercent (учитывает cancelCount + null для unsettled дней).
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

    // Settled окно для buyout% и price — [today-37, today-7]
    if (iso >= settledFrom && iso <= settledTo) {
      const cur =
        funnelByNmId.get(f.nmId) ?? { pctNum: 0, pctDen: 0, orders: 0, buyouts: 0 }
      cur.orders += ords
      cur.buyouts += byts
      // % выкупа — только settled-дни (где WB подтянул buyoutPercent).
      if (buyPctDaily !== null && ords > 0) {
        cur.pctNum += buyPctDaily * ords
        cur.pctDen += ords
        globalPctNum += buyPctDaily * ords
        globalPctDen += ords
      }
      funnelByNmId.set(f.nmId, cur)
      // avgPrice: взвешенная по выкуплено-rubli / выкуплено-штук
      if (byts > 0) {
        const pw = priceWeighted.get(f.nmId) ?? { num: 0, den: 0 }
        pw.num += bytRub
        pw.den += byts
        priceWeighted.set(f.nmId, pw)
      }
    }

    // Last 7d для baseline — [today-7, today-1]
    if (iso >= last7dStart && iso <= yesterday) {
      ords7.set(f.nmId, (ords7.get(f.nmId) ?? 0) + ords)
    }

    // Seed [today-3, today-1] — заказы прошлой недели → выкупы T+3 в окне прогноза
    if (iso >= seed7dStart && iso <= yesterday) {
      if (!seedByNmId.has(f.nmId)) seedByNmId.set(f.nmId, new Map())
      const m = seedByNmId.get(f.nmId)!
      m.set(iso, (m.get(iso) ?? 0) + ords)
    }
  }

  // Глобальный % выкупа: взвешенная средняя buyoutPercent по всем nmId+settled-дням
  const globalBuyout = globalPctDen > 0 ? globalPctNum / globalPctDen / 100 : 0

  // 7.1. Funnel per Subcategory — взвешенный по объёму заказов
  // (используется как fallback до глобального для товаров без собственной истории).
  // Маппинг: nmId → subcategoryId через Product.subcategoryId.
  const nmIdToSubcat = new Map<number, string | null>()
  for (const p of products) {
    const nmIds = productToNmIds.get(p.id) ?? []
    for (const nm of nmIds) nmIdToSubcat.set(nm, p.subcategoryId)
  }
  // Subcategory rate: та же weighted формула (SUM(pct × orders) / SUM(orders)).
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
    // Взвешенный по 7-дневным заказам per-nmId buyout.
    // Каждой WB-карточке товара даём вес = её ords7d. Карточка с funnel-историей,
    // но без свежих продаж (мало-продающая), получит вес 0 → не тащит средний вниз.
    let buyoutWeightedNum = 0 // Σ rate(nm) × ords7(nm)
    let buyoutWeightedDen = 0 // Σ ords7(nm) для nm с funnel-историей
    // То же для avgPrice: per-nmId средняя цена выкупа × вес ords7d
    let priceWeightedNum = 0 // Σ price(nm) × ords7(nm)
    let priceWeightedDen = 0 // Σ ords7(nm) для nm с funnel-buyouts историей
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
      if (pw) {
        // Старая сумма-by-сумма агрегация — используется как fallback,
        // если ни у одной из карточек нет свежих ords7.
        priceNum += pw.num
        priceDen += pw.den
        // Per-nmId средняя цена выкупа (rub/buyout) × вес ords7
        if (pw.den > 0) {
          const nmAvgPrice = pw.num / pw.den
          priceWeightedNum += nmAvgPrice * nmOrds7
          priceWeightedDen += nmOrds7
        }
      }
      const f = funnelByNmId.get(nm)
      if (f) {
        funnelOrders += f.orders
        funnelBuyouts += f.buyouts
        // Per-nmId weighted buyout% за settled 30d (по той же формуле что /prices/wb).
        if (f.pctDen > 0) {
          const nmRate = f.pctNum / f.pctDen / 100
          buyoutWeightedNum += nmRate * nmOrds7
          buyoutWeightedDen += nmOrds7
        }
      }
      const sm = seedByNmId.get(nm)
      if (sm) {
        for (const [d, q] of sm) {
          seedOrders[d] = (seedOrders[d] ?? 0) + q
        }
      }
    }

    // Сток к продаже = остаток на WB (sum по nmId) + остаток на складе Иваново.
    stockNow += p.ivanovoStock ?? 0

    let avgPrice = 0
    if (priceWeightedDen > 0) {
      // Основной случай: per-nmId avg-buyout-price взвешенный по 7д заказам.
      avgPrice = priceWeightedNum / priceWeightedDen
    } else if (priceDen > 0) {
      // Резерв: нет ords7 ни у одной карточки — sum/sum по settled buyouts.
      avgPrice = priceNum / priceDen
    } else if (cardPriceCount > 0) {
      avgPrice = cardPriceFallback / cardPriceCount
    }

    // Пользовательский override цены (per-user) перекрывает расчётную avgPrice.
    if (input.priceOverrides) {
      const ov = input.priceOverrides[p.id]
      if (typeof ov === "number" && Number.isFinite(ov) && ov > 0) {
        avgPrice = ov
      }
    }

    // Считаем product-level pctDen/Num для fallback'а когда нет ords7
    let pctNumSum = 0
    let pctDenSum = 0
    for (const nm of nmIds) {
      const f = funnelByNmId.get(nm)
      if (f) {
        pctNumSum += f.pctNum
        pctDenSum += f.pctDen
      }
    }

    let buyoutPct = 0
    let buyoutSource: BuyoutSource = "global"
    if (buyoutWeightedDen > 0) {
      // Основной случай: есть свежие 7д заказы по карточкам с funnel-историей.
      // Взвешенное среднее per-nmId rates по объёму свежих заказов.
      buyoutPct = buyoutWeightedNum / buyoutWeightedDen
      buyoutSource = "own"
    } else if (pctDenSum > 0) {
      // Резерв: 7д заказов нет, но funnel-история есть — используем 30d-веса.
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
      plannedSetDate: p.incoming?.updatedAt ? toIso(p.incoming.updatedAt) : null,
      seedOrders,
    })
  }

  // 9. Симуляция per Product (с применением user-overrides если есть)
  const overrides = input.baselineOverrides ?? {}
  const results: ProductForecast[] = metas.map((m) =>
    simulateProduct(
      m,
      today,
      endDate,
      chartEndDate,
      overrides[m.productId],
      deliveryDays,
      returnLagRuntime,
    ),
  )

  return {
    today,
    endDate,
    chartEndDate,
    globalBuyoutPct: globalBuyout,
    fallbackCount,
    bySource,
    products: results,
    deliveryDays,
    returnDays,
  }
}

function simulateProduct(
  p: ProductMeta,
  today: string,
  endDate: string,
  chartEndDate: string,
  rawOverride?: number,
  deliveryDays: number = DELIVERY_TO_CUSTOMER_DAYS,
  returnLag: number = DELIVERY_TO_CUSTOMER_DAYS + RETURN_FROM_CUSTOMER_DAYS,
): ProductForecast {
  const horizonStart = today
  const horizonEnd = endDate
  const innerEnd = chartEndDate > endDate ? chartEndDate : endDate
  const simEnd = addDays(innerEnd, deliveryDays + returnLag)
  const days = rangeIso(horizonStart, simEnd)

  // Применение override:
  //   • Если есть plannedTargetPerDay → override меняет ПЛАН.
  //   • Иначе → override меняет baseline.
  const hasOverride =
    typeof rawOverride === "number" &&
    Number.isFinite(rawOverride) &&
    rawOverride >= 0
  const hasPlanned = p.plannedTargetPerDay !== null
  let baselineUsed = p.baselineOrdersPerDay
  let plannedTargetUsed = p.plannedTargetPerDay
  let overrideAppliesTo: "planned" | "baseline" | null = null
  if (hasOverride) {
    if (hasPlanned) {
      plannedTargetUsed = rawOverride!
      overrideAppliesTo = "planned"
    } else {
      baselineUsed = rawOverride!
      overrideAppliesTo = "baseline"
    }
  }
  // effectiveRate — что показывать в таблице как «Зак/день»
  const effectiveRate =
    plannedTargetUsed !== null ? plannedTargetUsed : baselineUsed

  const stock: Record<string, number> = {}
  const orders: Record<string, number> = {}
  const dailySalesUnits: Record<string, number> = {}
  const dailySalesRub: Record<string, number> = {}
  let salesUnits = 0
  let salesRub = 0
  let ordersUnits = 0

  stock[horizonStart] = p.stockNow

  // KPI накопители — только в пределах [horizonStart, endDate].
  // Daily-кривая — расширена до chartEndDate (для общего графика).
  function accrueDaily(buyoutDate: string, units: number) {
    const rub = units * p.avgPrice
    dailySalesUnits[buyoutDate] = (dailySalesUnits[buyoutDate] ?? 0) + units
    dailySalesRub[buyoutDate] = (dailySalesRub[buyoutDate] ?? 0) + rub
    if (buyoutDate <= horizonEnd) {
      salesUnits += units
      salesRub += rub
    }
  }

  // Seed выкупы от заказов в past N дней (N = deliveryDays)
  for (const [d, q] of Object.entries(p.seedOrders)) {
    const buyoutDate = addDays(d, deliveryDays)
    if (buyoutDate >= horizonStart && buyoutDate <= chartEndDate) {
      accrueDaily(buyoutDate, q * p.buyoutPct)
    }
    const returnDate = addDays(d, returnLag)
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
      plannedTargetUsed !== null &&
      d >= addDays(p.arrivalDate, 1)
    ) {
      const wd = workingDaysBetween(addDays(p.arrivalDate, 1), d) + 1
      const factor = wd >= RAMP_UP_WORKING_DAYS ? 1 : wd / RAMP_UP_WORKING_DAYS
      rate = baselineUsed + (plannedTargetUsed - baselineUsed) * factor
    } else if (plannedTargetUsed !== null && !p.arrivalDate) {
      // План задан, но приход не ожидается (дата прихода пуста) — товар уже в наличии.
      // Применяем план через 3 дня после внесения плана (deliveryDays): заказы по новому
      // плану станут выкупами через T+3, до этого выкупы идут с исторической базы.
      const planStart = p.plannedSetDate
        ? addDays(p.plannedSetDate, deliveryDays)
        : horizonStart
      rate = d >= planStart ? plannedTargetUsed : baselineUsed
    } else {
      rate = baselineUsed
    }

    const actual = Math.min(rate, stock[d] ?? 0)
    orders[d] = actual
    if (d <= horizonEnd) ordersUnits += actual

    const buyoutDate = addDays(d, deliveryDays)
    if (buyoutDate >= horizonStart && buyoutDate <= chartEndDate) {
      accrueDaily(buyoutDate, actual * p.buyoutPct)
    }
    const returnDate = addDays(d, returnLag)
    if (returnDate <= simEnd) {
      stock[returnDate] =
        (stock[returnDate] ?? 0) + actual * (1 - p.buyoutPct)
    }
  }

  // Dailysales: сводим в массив отсортированных дней (до chartEndDate)
  const dailySales: Array<{ date: string; units: number; rub: number }> = []
  for (const d of rangeIso(horizonStart, chartEndDate)) {
    dailySales.push({
      date: d,
      units: dailySalesUnits[d] ?? 0,
      rub: dailySalesRub[d] ?? 0,
    })
  }

  // Остаток на endDate+1 — то, что физически на складе наутро после
  // окончания учётного периода (заказы дня endDate уже уехали, возвраты
  // от этих заказов ещё не пришли — это T+6, т.е. endDate+6).
  const endStockDate = addDays(horizonEnd, 1)
  const endStockUnits = Math.max(0, stock[endStockDate] ?? 0)
  const endStockRub = endStockUnits * p.avgPrice

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
    rateOverride: hasOverride ? rawOverride! : null,
    overrideAppliesTo,
    baselineUsed,
    plannedTargetUsed,
    effectiveRate,
    ordersUnits,
    salesUnits,
    salesRub,
    endStockUnits,
    endStockRub,
    dailySales,
  }
}
