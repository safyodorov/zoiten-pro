// lib/sales-plan/engine.ts
//
// Pure функции для симуляции плана продаж H2-2026.
// Используется и на сервере (RSC рендер таблицы), и на клиенте (realtime пересчёт в модалке).
//
// **Никаких side effects**: детерминированные, без импортов Prisma / React / Next.
// Golden test: tests/sales-plan-engine.test.ts
//   1 товар, 2 месяца, уровень + day override + 2 партии → T+3/T+6/ступенька/сток-лимит
//
// Механика перенесена из lib/sales-forecast.ts (проверенный алгоритм):
//   - T+3 выкупы, T+6 возвраты, clamp stock ≥ 0
//   - rateRequested = dayOverrides[d] ?? monthLevel.targetOrdersPerDay ?? baselineOrdersPerDay
//   - orders[d] = min(rateRequested, stock[d]) — сток-лимит
//   - Эволюция: массив arrivals вместо singleton, без ramp-up
//
// Phase 25 (План продаж v2, 2026-07)

import type {
  SalesPlanInputs,
  SalesPlanResult,
  ProductPlanInput,
  ProductPlanResult,
  PlanDayRow,
} from "./types"
import { addDays, eachDayIso } from "./dates"

// ── computeSalesPlan ─────────────────────────────────────────────────────────

/**
 * Запускает simulateProductPlan per товар, агрегирует company-level.
 */
export function computeSalesPlan(inputs: SalesPlanInputs): SalesPlanResult {
  const { today, horizonFrom, horizonTo, deliveryDays, returnDays, wbInboundLagDays, products } =
    inputs

  const productResults: ProductPlanResult[] = products.map((product) =>
    simulateProductPlan(product, {
      today,
      horizonFrom,
      horizonTo,
      deliveryDays,
      returnDays,
      wbInboundLagDays,
    }),
  )

  // Агрегация company-level (Σ по всем товарам per день)
  const dailyMap = new Map<
    string,
    { ordersUnits: number; buyoutsUnits: number; buyoutsRub: number; ordersRub: number }
  >()
  const monthlyMap = new Map<
    string,
    { ordersUnits: number; buyoutsUnits: number; buyoutsRub: number }
  >()

  for (const pr of productResults) {
    for (const day of pr.days) {
      const existing = dailyMap.get(day.date) ?? {
        ordersUnits: 0,
        buyoutsUnits: 0,
        buyoutsRub: 0,
        ordersRub: 0,
      }
      existing.ordersUnits += day.ordersUnits
      existing.buyoutsUnits += day.buyoutsUnits
      existing.buyoutsRub += day.buyoutsRub
      existing.ordersRub += day.ordersRub
      dailyMap.set(day.date, existing)
    }
    for (const mt of pr.monthTotals) {
      const existing = monthlyMap.get(mt.month) ?? {
        ordersUnits: 0,
        buyoutsUnits: 0,
        buyoutsRub: 0,
      }
      existing.ordersUnits += mt.ordersUnits
      existing.buyoutsUnits += mt.buyoutsUnits
      existing.buyoutsRub += mt.buyoutsRub
      monthlyMap.set(mt.month, existing)
    }
  }

  const horizonDays = eachDayIso(horizonFrom, horizonTo)
  const companyDaily = horizonDays.map((date) => {
    const d = dailyMap.get(date) ?? {
      ordersUnits: 0,
      buyoutsUnits: 0,
      buyoutsRub: 0,
      ordersRub: 0,
    }
    return { date, ...d }
  })

  const companyMonthly = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, vals]) => ({ month, ...vals }))

  return { products: productResults, companyDaily, companyMonthly }
}

// ── simulateProductPlan ──────────────────────────────────────────────────────

interface SimParams {
  today: string
  horizonFrom: string
  horizonTo: string
  deliveryDays: number
  returnDays: number
  wbInboundLagDays: number
}

/**
 * Симуляция дневного ряда для одного товара.
 *
 * Логика (§3.3 RESEARCH):
 *   для d от today до horizonTo + deliveryDays + returnDays:
 *     stock[d]  = stock[d−1] − orders[d−1] + Σinflow(d) + returns(d)  (clamp ≥ 0)
 *     orders[d] = min(rateRequested(d), stock[d])                       (сток-лимит)
 *     buyouts[d + deliveryDays] += orders[d] × buyoutPct(d)             (T+3)
 *     returns[d + deliveryDays + returnDays] += orders[d] × (1 − buyoutPct(d)) (T+6)
 *
 * Приход в сток: arrival.date — дата доступности (engine добавляет +1 для inflow).
 * Seed-заказы [today−3, today−1] дают выкупы первых дней горизонта.
 * Дни [horizonFrom .. today−1] НЕ симулируются (зона факта/версий).
 * Выход days: ровно [horizonFrom … horizonTo].
 */
function simulateProductPlan(product: ProductPlanInput, params: SimParams): ProductPlanResult {
  const { today, horizonFrom, horizonTo, deliveryDays, returnDays } = params

  // Расширенный горизонт симуляции для T+3+3 хвоста
  const simEnd = addDays(horizonTo, deliveryDays + returnDays)

  // Все дни симуляции от today до simEnd
  const allSimDays = eachDayIso(today, simEnd)

  // Arrival inflow: arrivals[date+1] → qty
  const inflowByDate = new Map<string, number>()
  for (const arrival of product.arrivals) {
    // Приход в сток на следующий день после даты доступности
    const inflowDate = addDays(arrival.date, 1)
    inflowByDate.set(inflowDate, (inflowByDate.get(inflowDate) ?? 0) + arrival.qty)
  }

  // Индексирование monthLevels по первому дню месяца (уже ISO "YYYY-MM-01")
  // Строим функцию выбора уровня для дня d
  function getMonthLevel(d: string) {
    // Ищем уровень, чей month ≤ d, берём последний (наибольший) подходящий
    const monthKey = d.slice(0, 7) + "-01" // "2026-07-15" → "2026-07-01"
    // Перебираем все levels, ищем точное совпадение с первым числом месяца
    let best = null
    for (const level of product.monthLevels) {
      if (level.month <= monthKey) {
        if (best === null || level.month > best.month) {
          best = level
        }
      }
    }
    return best
  }

  function getRateRequested(d: string): number {
    // 1. dayOverrides
    if (product.dayOverrides[d] !== undefined) return product.dayOverrides[d]
    // 2. monthLevel.targetOrdersPerDay
    const level = getMonthLevel(d)
    if (level?.targetOrdersPerDay != null) return level.targetOrdersPerDay
    // 3. baseline
    return product.baselineOrdersPerDay
  }

  function getPriceRub(d: string): number {
    const level = getMonthLevel(d)
    return level?.priceRub ?? product.avgPriceRub
  }

  function getBuyoutPct(d: string): number {
    const level = getMonthLevel(d)
    return level?.buyoutPct ?? product.buyoutPct
  }

  // Массивы выкупов и возвратов (индексированы по дате)
  const buyoutsMap = new Map<string, number>()
  const returnsMap = new Map<string, number>()

  // Заполняем seed-заказы [today−3, today−1] для выкупов первых дней.
  // Seed → ТОЛЬКО buyout-поток (T+3); return-поток НЕ инициализируется,
  // чтобы нулевой сток не получал артефактных пополнений из прошлых возвратов.
  for (const [seedDate, seedQty] of Object.entries(product.seedOrders)) {
    const buyoutDate = addDays(seedDate, deliveryDays)
    const buyoutPct = getBuyoutPct(seedDate)
    buyoutsMap.set(buyoutDate, (buyoutsMap.get(buyoutDate) ?? 0) + seedQty * buyoutPct)
  }

  // Симуляция
  // Инвариант: orders[d] = min(rateRequested[d], stockEnd[d-1])
  //            stockEnd[d] = stockEnd[d-1] - orders[d] + inflow[d] + returns[d]
  // Это гарантирует: orders[d] ≤ stockEnd[d-1] (сток-лимит)
  // Inflow на дату d означает: товар доступен с конца дня d (добавляется в stockEnd[d]),
  // можно заказывать со следующего дня.
  let stockEnd = product.stockNow
  const dayOutputs = new Map<string, PlanDayRow>()

  for (const d of allSimDays) {
    const rateRequested = getRateRequested(d)
    // orders ограничены предыдущим stockEnd — это invariant сток-лимита
    const orders = Math.min(rateRequested, stockEnd)
    const priceRub = getPriceRub(d)
    const buyoutPct = getBuyoutPct(d)

    // Приход товара в сток в конце дня (inflow[d] доступен с d+1 via stockEnd[d])
    const inflow = inflowByDate.get(d) ?? 0
    // Возвраты
    const returns = returnsMap.get(d) ?? 0

    // Новый stockEnd: предыдущий − заказы + приход + возвраты
    stockEnd = Math.max(0, stockEnd - orders + inflow + returns)

    // T+3 выкупы
    const buyoutDate = addDays(d, deliveryDays)
    buyoutsMap.set(buyoutDate, (buyoutsMap.get(buyoutDate) ?? 0) + orders * buyoutPct)

    // T+6 возвраты
    const returnDate = addDays(d, deliveryDays + returnDays)
    returnsMap.set(returnDate, (returnsMap.get(returnDate) ?? 0) + orders * (1 - buyoutPct))

    // Записываем только дни горизонта (horizonFrom..horizonTo)
    if (d >= horizonFrom && d <= horizonTo) {
      const buyoutsUnits = buyoutsMap.get(d) ?? 0
      const buyoutsRub = buyoutsUnits * getPriceRub(d)
      dayOutputs.set(d, {
        date: d,
        ordersUnits: orders,
        buyoutsUnits,
        buyoutsRub,
        ordersRub: orders * priceRub,
        stockEnd,
        rateRequested,
      })
    }
  }

  // Строим дневной ряд ровно [horizonFrom … horizonTo]
  const horizonDays = eachDayIso(horizonFrom, horizonTo)
  const days: PlanDayRow[] = horizonDays.map(
    (d) =>
      dayOutputs.get(d) ?? {
        date: d,
        ordersUnits: 0,
        buyoutsUnits: 0,
        buyoutsRub: 0,
        ordersRub: 0,
        stockEnd: 0,
        rateRequested: getRateRequested(d),
      },
  )

  // monthTotals
  const monthTotalsMap = new Map<string, { ordersUnits: number; buyoutsUnits: number; buyoutsRub: number }>()
  for (const day of days) {
    const monthKey = day.date.slice(0, 7) + "-01"
    const cur = monthTotalsMap.get(monthKey) ?? { ordersUnits: 0, buyoutsUnits: 0, buyoutsRub: 0 }
    cur.ordersUnits += day.ordersUnits
    cur.buyoutsUnits += day.buyoutsUnits
    cur.buyoutsRub += day.buyoutsRub
    monthTotalsMap.set(monthKey, cur)
  }
  const monthTotals = Array.from(monthTotalsMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, vals]) => ({ month, ...vals }))

  // firstStockoutDate — первый день нуля остатка в горизонте
  let firstStockoutDate: string | null = null
  let lostUnitsToStockout = 0
  let lostRubToStockout = 0
  for (const day of days) {
    const lost = Math.max(0, day.rateRequested - day.ordersUnits)
    lostUnitsToStockout += lost
    lostRubToStockout += lost * getPriceRub(day.date)
    if (firstStockoutDate === null && day.stockEnd === 0 && day.ordersUnits < day.rateRequested) {
      firstStockoutDate = day.date
    }
  }

  return {
    productId: product.productId,
    days,
    monthTotals,
    firstStockoutDate,
    lostUnitsToStockout,
    lostRubToStockout,
  }
}
