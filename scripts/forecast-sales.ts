// scripts/forecast-sales.ts
// Прогноз выкупов до 2026-06-30 включительно с учётом:
//  • Базовая ставка заказов = avg last 7 дней WbCardOrdersDaily.qty
//  • plannedSalesPerDay (ProductIncoming) — target orders, рамп-ап 3 раб. дней
//  • Остатки WbCard.stockQty + приходы (ProductIncoming.orderedQty) на expectedDate+1
//  • % выкупа — взвешенный 30d из WbCardFunnelDaily (buyouts/orders)
//  • Срок до клиента 3 дня + от клиента 3 дня (возвраты на T+6)
//  • Выкупы засчитываются на T+3 от заказа
//
// Запуск на VPS:
//   cd /opt/zoiten-pro
//   DATABASE_URL=$(grep DATABASE_URL /etc/zoiten.pro.env | cut -d= -f2-) \
//     npx tsx scripts/forecast-sales.ts

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// ── Параметры ─────────────────────────────────────────────────────
const END_DATE = "2026-06-30" // включительно
const TODAY = new Date().toISOString().slice(0, 10)
const ORDERS_LOOKBACK_DAYS = 7
const FUNNEL_LOOKBACK_DAYS = 30
const DELIVERY_TO_CUSTOMER_DAYS = 3
const RETURN_FROM_CUSTOMER_DAYS = 3
const RAMP_UP_WORKING_DAYS = 3
const RETURN_LAG = DELIVERY_TO_CUSTOMER_DAYS + RETURN_FROM_CUSTOMER_DAYS // 6
const DEFAULT_BUYOUT_PCT = 0 // если данных нет — консервативно 0

// ── Хелперы дат (UTC, чтобы избежать TZ-проблем) ─────────────────
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

function diffDays(a: string, b: string): number {
  const d = (parseDate(a).getTime() - parseDate(b).getTime()) / 86_400_000
  return Math.round(d)
}

function isWorkingDay(s: string): boolean {
  const d = parseDate(s).getUTCDay()
  return d >= 1 && d <= 5
}

// Возвращает количество рабочих дней между двумя датами (inclusive of `to`, exclusive of `from`).
// Используется для подсчёта «какой это рабочий день после прихода».
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

// ── Загрузка данных ───────────────────────────────────────────────

interface ProductMeta {
  id: string
  sku: string
  name: string
  nmIds: number[]
  stockNow: number // SUM WbCard.stockQty
  baselineOrdersPerDay: number // avg last 7 days
  avgPrice: number // взвеш. buyerPrice (₽)
  buyoutPct: number // 0..1
  arrivalDate: string | null
  arrivalQty: number
  plannedTargetPerDay: number | null // null = use baseline ramp-up; иначе ramp до target
  seedOrders: Record<string, number> // YYYY-MM-DD → orders (для seed выкупов в окно)
  buyoutFallback: boolean // true → buyoutPct = глобальный (нет истории)
}

async function loadData(): Promise<{ products: ProductMeta[]; globalBuyout: number; fallbackCount: number }> {
  console.error("→ Загрузка товаров…")
  const wbMarketplace = await prisma.marketplace.findFirst({
    where: { slug: "wb" },
    select: { id: true },
  })
  if (!wbMarketplace) throw new Error("Marketplace WB не найден")

  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    include: {
      articles: {
        where: { marketplaceId: wbMarketplace.id },
        select: { article: true },
      },
      incoming: true,
    },
  })
  console.error(`  ${products.length} активных товаров`)

  // Собираем все WB nmId
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
  console.error(`  ${allNmIds.length} WB-артикулов всего`)

  // Карточки WB
  console.error("→ Загрузка WbCard (stock, price)…")
  const cards = await prisma.wbCard.findMany({
    where: { nmId: { in: allNmIds }, deletedAt: null },
    select: { nmId: true, stockQty: true, price: true, buyoutPercent: true },
  })
  const cardByNmId = new Map(cards.map((c) => [c.nmId, c]))

  // Orders last 7d (включая последние 3 дня для seed)
  const ordersFrom = addDays(TODAY, -ORDERS_LOOKBACK_DAYS - 3)
  const ordersTo = addDays(TODAY, -1) // вчера
  console.error(
    `→ WbCardOrdersDaily ${ordersFrom}…${ordersTo} (${ORDERS_LOOKBACK_DAYS + 3}d)…`,
  )
  const orders = await prisma.wbCardOrdersDaily.findMany({
    where: {
      nmId: { in: allNmIds },
      date: { gte: parseDate(ordersFrom), lte: parseDate(ordersTo) },
    },
    select: { nmId: true, date: true, qty: true, buyerPrice: true },
  })

  // Funnel rolling 30d
  const funnelFrom = addDays(TODAY, -FUNNEL_LOOKBACK_DAYS)
  console.error(
    `→ WbCardFunnelDaily ${funnelFrom}…${addDays(TODAY, -1)} (${FUNNEL_LOOKBACK_DAYS}d)…`,
  )
  const funnel = await prisma.wbCardFunnelDaily.findMany({
    where: {
      nmId: { in: allNmIds },
      date: { gte: parseDate(funnelFrom), lte: parseDate(addDays(TODAY, -1)) },
    },
    select: {
      nmId: true,
      date: true,
      ordersCount: true,
      buyoutsCount: true,
    },
  })

  // ── Агрегаты per nmId ──
  // ords7[nmId] = sum(qty) last 7d
  // priceWeighted[nmId] = sum(buyerPrice * qty) / sum(qty)
  // seed[nmId] = { date → qty } для last 3 days
  const ords7 = new Map<number, number>()
  const priceWeighted = new Map<number, { num: number; den: number }>()
  const seedByNmId = new Map<number, Map<string, number>>()
  const seedFrom = addDays(TODAY, -DELIVERY_TO_CUSTOMER_DAYS)
  for (const o of orders) {
    const iso = toIso(o.date)
    const inLast7 =
      iso >= addDays(TODAY, -ORDERS_LOOKBACK_DAYS) && iso <= addDays(TODAY, -1)
    if (inLast7) {
      ords7.set(o.nmId, (ords7.get(o.nmId) ?? 0) + o.qty)
      if (o.buyerPrice != null && o.qty > 0) {
        const pw = priceWeighted.get(o.nmId) ?? { num: 0, den: 0 }
        pw.num += o.buyerPrice * o.qty
        pw.den += o.qty
        priceWeighted.set(o.nmId, pw)
      }
    }
    // seed для выкупов на T+3 после order date (включаем последние 3 дня before today)
    if (iso >= seedFrom && iso <= addDays(TODAY, -1)) {
      if (!seedByNmId.has(o.nmId)) seedByNmId.set(o.nmId, new Map())
      const m = seedByNmId.get(o.nmId)!
      m.set(iso, (m.get(iso) ?? 0) + o.qty)
    }
  }

  // Funnel agg per nmId
  const funnelByNmId = new Map<number, { orders: number; buyouts: number }>()
  for (const f of funnel) {
    const cur = funnelByNmId.get(f.nmId) ?? { orders: 0, buyouts: 0 }
    cur.orders += f.ordersCount ?? 0
    cur.buyouts += f.buyoutsCount ?? 0
    funnelByNmId.set(f.nmId, cur)
  }

  // Глобальный взвешенный % выкупа (для fallback на новые товары без истории)
  let globalOrders = 0
  let globalBuyouts = 0
  for (const f of funnel) {
    globalOrders += f.ordersCount ?? 0
    globalBuyouts += f.buyoutsCount ?? 0
  }
  const globalBuyout = globalOrders > 0 ? globalBuyouts / globalOrders : 0
  console.error(`  Global buyout (fallback): ${(globalBuyout * 100).toFixed(1)}%`)

  // ── Сборка per Product ──
  const result: ProductMeta[] = []
  let fallbackCount = 0
  for (const p of products) {
    const nmIds = productToNmIds.get(p.id) ?? []
    if (nmIds.length === 0) continue // нет WB-привязки — пропуск

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

    let buyoutPct = DEFAULT_BUYOUT_PCT
    let buyoutFallback = false
    if (funnelOrders > 0) buyoutPct = funnelBuyouts / funnelOrders
    else if (cardBuyoutCount > 0)
      buyoutPct = cardBuyoutFallback / cardBuyoutCount / 100 // legacy в процентах
    else {
      // Нет ни funnel-data, ни legacy WbCard.buyoutPercent → используем глобальный взвешенный
      buyoutPct = globalBuyout
      buyoutFallback = true
      fallbackCount++
    }

    const arrival = p.incoming?.expectedDate
      ? toIso(p.incoming.expectedDate)
      : null
    const arrivalQty = p.incoming?.orderedQty ?? 0
    const planned = p.incoming?.plannedSalesPerDay ?? null

    result.push({
      id: p.id,
      sku: p.sku,
      name: p.name,
      nmIds,
      stockNow,
      baselineOrdersPerDay: baseline,
      avgPrice,
      buyoutPct,
      arrivalDate: arrival,
      arrivalQty,
      plannedTargetPerDay: planned,
      seedOrders,
      buyoutFallback,
    })
  }

  return { products: result, globalBuyout, fallbackCount }
}

// ── Симуляция per product ─────────────────────────────────────────

interface SimResult {
  productId: string
  sku: string
  name: string
  stockNow: number
  baseline: number
  buyoutPct: number
  buyoutFallback: boolean
  avgPrice: number
  plannedTarget: number | null
  arrivalDate: string | null
  arrivalQty: number
  ordersUnits: number // всего заказано штук в окне (today..END_DATE)
  salesUnits: number // выкуплено штук (дата выкупа в окне)
  salesRub: number
  salesUnitsMay: number // только май (до END_MAY)
  salesRubMay: number
  salesUnitsJune: number // только июнь (01.06..30.06)
  salesRubJune: number
}

function simulateProduct(p: ProductMeta): SimResult {
  const horizonStart = TODAY
  const horizonEnd = END_DATE
  // расширяем сим. на 3 дня после END_DATE, чтобы успели сесть выкупы от заказов end-2/end-1/end
  // (но в outputUnit считаем только sales[D] где D <= END_DATE).
  const simEnd = addDays(horizonEnd, DELIVERY_TO_CUSTOMER_DAYS + RETURN_LAG)

  const days = rangeIso(horizonStart, simEnd)
  const stock: Record<string, number> = {}
  const orders: Record<string, number> = {}
  const sales: Record<string, number> = {} // выкуплено штук на эту дату
  let salesUnits = 0
  let salesRub = 0
  let ordersUnits = 0
  let salesUnitsMay = 0
  let salesRubMay = 0
  let salesUnitsJune = 0
  let salesRubJune = 0
  const MAY_END = "2026-05-31"
  function accrue(buyoutDate: string, units: number, rub: number) {
    salesUnits += units
    salesRub += rub
    if (buyoutDate <= MAY_END) {
      salesUnitsMay += units
      salesRubMay += rub
    } else {
      salesUnitsJune += units
      salesRubJune += rub
    }
  }

  stock[horizonStart] = p.stockNow

  // seed выкупы от заказов в past 3 дня (они засчитаются в окне форкаста)
  for (const [d, q] of Object.entries(p.seedOrders)) {
    const buyoutDate = addDays(d, DELIVERY_TO_CUSTOMER_DAYS)
    if (buyoutDate >= horizonStart && buyoutDate <= horizonEnd) {
      const buyoutUnits = q * p.buyoutPct
      accrue(buyoutDate, buyoutUnits, buyoutUnits * p.avgPrice)
      sales[buyoutDate] = (sales[buyoutDate] ?? 0) + buyoutUnits
    }
    // возврат от seed-заказа
    const returnDate = addDays(d, RETURN_LAG)
    if (returnDate >= horizonStart && returnDate <= simEnd) {
      const returnUnits = q * (1 - p.buyoutPct)
      stock[returnDate] = (stock[returnDate] ?? 0) + returnUnits
    }
  }

  for (let i = 0; i < days.length; i++) {
    const d = days[i]
    if (i > 0) {
      const prev = days[i - 1]
      const inflow =
        p.arrivalDate && addDays(p.arrivalDate, 1) === d ? p.arrivalQty : 0
      const returnsToday = stock[d] ?? 0 // уже накоплено через seed/будущие возвраты
      stock[d] = (stock[prev] ?? 0) - (orders[prev] ?? 0) + inflow + returnsToday
      if (stock[d] < 0) stock[d] = 0
    }

    // Эффективная ставка заказов на день D
    let rate: number
    if (
      p.arrivalDate &&
      p.plannedTargetPerDay != null &&
      d >= addDays(p.arrivalDate, 1)
    ) {
      const wd = workingDaysBetween(addDays(p.arrivalDate, 1), d) + 1 // первый раб. день после прихода = wd=1
      let factor: number
      if (wd >= RAMP_UP_WORKING_DAYS) factor = 1
      else factor = wd / RAMP_UP_WORKING_DAYS // 1/3, 2/3
      rate =
        p.baselineOrdersPerDay +
        (p.plannedTargetPerDay - p.baselineOrdersPerDay) * factor
    } else {
      rate = p.baselineOrdersPerDay
    }

    const actual = Math.min(rate, stock[d] ?? 0)
    orders[d] = actual
    if (d <= horizonEnd) ordersUnits += actual

    // Выкупы на T+3
    const buyoutDate = addDays(d, DELIVERY_TO_CUSTOMER_DAYS)
    if (buyoutDate >= horizonStart && buyoutDate <= horizonEnd) {
      const buyoutUnits = actual * p.buyoutPct
      accrue(buyoutDate, buyoutUnits, buyoutUnits * p.avgPrice)
      sales[buyoutDate] = (sales[buyoutDate] ?? 0) + buyoutUnits
    }

    // Возврат на T+6
    const returnDate = addDays(d, RETURN_LAG)
    if (returnDate <= simEnd) {
      const returnUnits = actual * (1 - p.buyoutPct)
      stock[returnDate] = (stock[returnDate] ?? 0) + returnUnits
    }
  }

  return {
    productId: p.id,
    sku: p.sku,
    name: p.name,
    stockNow: p.stockNow,
    baseline: p.baselineOrdersPerDay,
    buyoutPct: p.buyoutPct,
    buyoutFallback: p.buyoutFallback,
    avgPrice: p.avgPrice,
    plannedTarget: p.plannedTargetPerDay,
    arrivalDate: p.arrivalDate,
    arrivalQty: p.arrivalQty,
    ordersUnits,
    salesUnits,
    salesRub,
    salesUnitsMay,
    salesRubMay,
    salesUnitsJune,
    salesRubJune,
  }
}

// ── Форматирование ────────────────────────────────────────────────

function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + "%"
}

// ── main ──────────────────────────────────────────────────────────

async function main() {
  console.error(`\nПрогноз продаж ${TODAY} → ${END_DATE}\n`)
  const { products, globalBuyout, fallbackCount } = await loadData()
  console.error(`→ Симуляция ${products.length} товаров…\n`)
  console.error(
    `  Fallback на глобальный % выкупа применён к ${fallbackCount} товарам (нет funnel-истории)`,
  )
  console.error(`  Глобальный % выкупа: ${(globalBuyout * 100).toFixed(1)}%\n`)

  const results = products.map(simulateProduct)
  results.sort((a, b) => b.salesRub - a.salesRub)

  // Per-product
  const headers = [
    "SKU",
    "Название",
    "Стат",
    "База/день",
    "Цена",
    "Выкуп%",
    "План",
    "Приход",
    "Дата прих.",
    "Заказы шт",
    "Продажи шт",
    "Продажи ₽",
  ]
  const rows = results.map((r) => [
    r.sku,
    r.name.length > 40 ? r.name.slice(0, 38) + "…" : r.name,
    fmtNum(r.stockNow),
    fmtNum(r.baseline, 2),
    fmtNum(r.avgPrice),
    fmtPct(r.buyoutPct) + (r.buyoutFallback ? "*" : ""),
    r.plannedTarget != null ? fmtNum(r.plannedTarget, 1) : "—",
    r.arrivalQty > 0 ? fmtNum(r.arrivalQty) : "—",
    r.arrivalDate ?? "—",
    fmtNum(r.ordersUnits, 1),
    fmtNum(r.salesUnits, 1),
    fmtNum(r.salesRub),
  ])

  // Печать табличкой (TSV для удобства)
  console.log(headers.join("\t"))
  for (const row of rows) console.log(row.join("\t"))

  // Итог
  const totalSalesUnits = results.reduce((s, r) => s + r.salesUnits, 0)
  const totalSalesRub = results.reduce((s, r) => s + r.salesRub, 0)
  const totalOrders = results.reduce((s, r) => s + r.ordersUnits, 0)

  const totalMayUnits = results.reduce((s, r) => s + r.salesUnitsMay, 0)
  const totalMayRub = results.reduce((s, r) => s + r.salesRubMay, 0)
  const totalJuneUnits = results.reduce((s, r) => s + r.salesUnitsJune, 0)
  const totalJuneRub = results.reduce((s, r) => s + r.salesRubJune, 0)

  console.log("")
  console.log(`* — % выкупа = глобальный (нет funnel-истории по nmId)`)
  console.log("")
  console.log(
    `МАЙ-остаток (26-31.05): ${fmtNum(totalMayUnits, 1)} шт / ${fmtNum(totalMayRub)} ₽`,
  )
  console.log(
    `ИЮНЬ (01-30.06):        ${fmtNum(totalJuneUnits, 1)} шт / ${fmtNum(totalJuneRub)} ₽`,
  )
  console.log("")
  console.log(`ИТОГО ЗАКАЗОВ (шт):   ${fmtNum(totalOrders, 1)}`)
  console.log(`ИТОГО ВЫКУПОВ (шт):   ${fmtNum(totalSalesUnits, 1)}`)
  console.log(`ИТОГО ВЫРУЧКА (₽):    ${fmtNum(totalSalesRub)}`)
  console.log("")

  // Top-10 по продажам в ₽
  console.log("TOP-10 ПО ВЫРУЧКЕ:")
  for (let i = 0; i < Math.min(10, results.length); i++) {
    const r = results[i]
    console.log(
      `  ${i + 1}. ${r.sku} ${r.name.slice(0, 50)}: ${fmtNum(r.salesUnits, 1)} шт / ${fmtNum(r.salesRub)} ₽`,
    )
  }
}

main()
  .catch((err) => {
    console.error("ERROR:", err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
