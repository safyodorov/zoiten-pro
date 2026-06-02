// lib/finance-model/engine.ts
//
// Чистый детерминированный движок финансовой модели.
// Посуточная симуляция (год + прогрев лид-тайма) → агрегация в месяцы.
// Используется на сервере (RSC) и на клиенте (реалтайм-пересчёт). Без side effects.
//
// Логика (см. docs/superpowers/specs/2026-06-01-finance-models-design.md):
//  • Реализация = Заказы × Выкуп (D×S); только выкупленные дают выручку и расходуют товар.
//  • Выручка = Реализация × Цена; Чистая прибыль = U × Выручка (U — all-in маржа).
//  • Платёж поставщику 20/50/30: при заказе / +I+J / +I+J+K.
//  • Деньги от WB: понедельник-отчёт за неделю продажи + 4 недели.
//  • Из прибыли реинвест 30%, 70% выводится собственнику (всегда, даже при кредите).
//  • Кредит: дефицит ДС → добор траншами кратно creditStepRub (мин. 5 млн).
//    Мин. срок ≥ 1 год → в пределах горизонта досрочного гашения нет; 25%/год помесячно.

import type {
  CashFlowMonthRow,
  CreditAssessment,
  GlobalParams,
  ModelResult,
  ProductInput,
  ProductMetrics,
  ProfitMonthRow,
  VariantConfig,
  VariantResult,
} from "./types"
import { DEFAULT_PARAMS, DEFAULT_VARIANTS, PRODUCTS } from "./inputs"

const MS_PER_DAY = 86_400_000

const MONTH_NAMES_RU = [
  "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
  "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
]

/** UTC-полночь из ISO 'YYYY-MM-DD'. */
function parseUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Подпись месяца по индексу от старта, напр. «Июн’26». */
function monthLabel(startMs: number, monthIndex: number): string {
  const d = new Date(startMs)
  const total = d.getUTCMonth() + monthIndex
  const year = d.getUTCFullYear() + Math.floor(total / 12)
  const month = ((total % 12) + 12) % 12
  return `${MONTH_NAMES_RU[month]}’${String(year).slice(2)}`
}

/** Индекс месяца (0-based от старта) для дня day. */
function monthIndexOfDay(startMs: number, day: number): number {
  const start = new Date(startMs)
  const cur = new Date(startMs + day * MS_PER_DAY)
  return (
    (cur.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (cur.getUTCMonth() - start.getUTCMonth())
  )
}

/**
 * День прихода денег от WB за продажу в день saleDay.
 * Отчёт WB — по понедельникам за прошедшую неделю (Пн–Вс); деньги через wbPayoutWeeks недель
 * после понедельника-отчёта. reportMonday = понедельник недели продажи + 7 дней.
 */
function wbCashDay(startMs: number, saleDay: number, payoutWeeks: number): number {
  const date = new Date(startMs + saleDay * MS_PER_DAY)
  // getUTCDay: 0=Вс..6=Сб → смещение до понедельника текущей недели
  const dow = date.getUTCDay()
  const daysSinceMonday = (dow + 6) % 7
  const weekMonday = saleDay - daysSinceMonday
  const reportMonday = weekMonday + 7
  return reportMonday + payoutWeeks * 7
}

/** Длина горизонта в днях (от старта до конца horizonMonths месяцев). */
function horizonDays(startMs: number, horizonMonths: number): number {
  const d = new Date(startMs)
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + horizonMonths, d.getUTCDate())
  return Math.round((end - startMs) / MS_PER_DAY)
}

/** Доступность товара к продаже от дня заказа: I+J+K+L+M+N+O. */
function leadToAvailability(p: ProductInput): number {
  return (
    p.productionDays + p.inspectionDays + p.chinaLogisticsDays +
    p.customsToIvanovoDays + p.ivanovoReceiveDays + p.shipToMpDays + p.mpReceiveDays
  )
}

/**
 * Симуляция одного варианта финансирования.
 */
export function simulateVariant(
  products: ProductInput[],
  params: GlobalParams,
  variant: VariantConfig,
): VariantResult {
  const startMs = parseUtc(params.startDate)
  const nDays = horizonDays(startMs, params.horizonMonths)
  const nMonths = params.horizonMonths

  // Посуточные потоки на горизонте [0, nDays)
  const procurementOut = new Float64Array(nDays) // платежи поставщикам
  const wbReceiptIn = new Float64Array(nDays)     // приход на р/с (себест + прибыль)
  const profitArriving = new Float64Array(nDays)  // прибыль в составе прихода (для вывода 70%)

  // Accrual-агрегаты модели прибыли — по месяцу продажи
  const mRevenue = new Float64Array(nMonths)
  const mCogs = new Float64Array(nMonths)
  const mProfit = new Float64Array(nMonths)

  const split = params.paymentSplit

  for (const p of products) {
    const soldPerDay = p.ordersPerDay * p.buyoutRate
    const effMargin = Math.max(0, p.marginPct + variant.marginDeltaPct)
    const avail = leadToAvailability(p)
    const beforeShipOffset = p.productionDays + p.inspectionDays
    const atCustomsOffset = p.productionDays + p.inspectionDays + p.chinaLogisticsDays

    // ── Закупка: заказы партии каждые batchQty/soldPerDay дней, старт t=0 ──
    const orderInterval = p.batchQty / soldPerDay
    const batchCost = p.batchQty * p.costPerUnit
    for (let k = 0; ; k++) {
      const orderDay = Math.round(k * orderInterval)
      if (orderDay >= nDays) break
      const d0 = orderDay
      const d1 = orderDay + beforeShipOffset
      const d2 = orderDay + atCustomsOffset
      if (d0 < nDays) procurementOut[d0] += batchCost * split.onOrder
      if (d1 < nDays) procurementOut[d1] += batchCost * split.beforeShip
      if (d2 < nDays) procurementOut[d2] += batchCost * split.atCustoms
    }

    // ── Продажи: с дня доступности, soldPerDay шт/день ──
    const dailyRevenue = soldPerDay * p.price
    const dailyCogs = soldPerDay * p.costPerUnit
    const dailyProfit = effMargin * dailyRevenue
    for (let d = avail; d < nDays; d++) {
      // Accrual — модель прибыли по месяцу продажи
      const mi = monthIndexOfDay(startMs, d)
      if (mi >= 0 && mi < nMonths) {
        mRevenue[mi] += dailyRevenue
        mCogs[mi] += dailyCogs
        mProfit[mi] += dailyProfit
      }
      // Cash — приход от WB
      const cashDay = wbCashDay(startMs, d, params.wbPayoutWeeks)
      if (cashDay < nDays) {
        wbReceiptIn[cashDay] += dailyCogs + dailyProfit
        profitArriving[cashDay] += dailyProfit
      }
    }
  }

  // ── Операционные потоки помесячно (агрегация дневных массивов) ──
  const cfWbReceipts = new Float64Array(nMonths)
  const cfProcurement = new Float64Array(nMonths)
  const cfWithdrawal = new Float64Array(nMonths)
  for (let d = 0; d < nDays; d++) {
    const mi = monthIndexOfDay(startMs, d)
    if (mi < 0 || mi >= nMonths) continue
    cfWbReceipts[mi] += wbReceiptIn[d]
    cfWithdrawal[mi] += profitArriving[d] * (1 - params.reinvestRate)
    cfProcurement[mi] += procurementOut[d]
  }

  // ── Финансовый слой: помесячно, кредит траншами кратно creditStep (мин. 5 млн),
  //    дифференцированное гашение каждого транша: тело равными долями за creditMinTermMonths,
  //    проценты на остаток долга транша (убывающие). ──
  const monthlyRate = params.creditAnnualRate / 12
  const creditStep = params.creditStepRub > 0 ? params.creditStepRub : 0
  const termMonths = Math.max(1, Math.round(params.creditMinTermMonths))

  const cfInterest = new Float64Array(nMonths)
  const cfCreditDrawn = new Float64Array(nMonths)
  const cfPrincipalRepaid = new Float64Array(nMonths)
  const creditBalanceEnd = new Float64Array(nMonths)
  const cashBalanceEnd = new Float64Array(nMonths)

  // Транши: остаток тела, ежемесячное тело, осталось платежей, месяц привлечения.
  const tranches: { remaining: number; principalPerMonth: number; monthsLeft: number; drawMonth: number }[] = []

  let cash = variant.ownFunds
  let peakCredit = 0
  let peakMonth = 0
  let creditMonthSum = 0

  for (let mi = 0; mi < nMonths; mi++) {
    // 1) Операционный поток месяца
    cash += cfWbReceipts[mi] - cfProcurement[mi] - cfWithdrawal[mi]

    // 2) Платёж по кредиту (по траншам, привлечённым в прошлые месяцы): проценты + тело
    let interestM = 0
    let principalM = 0
    for (const t of tranches) {
      if (t.monthsLeft <= 0 || t.drawMonth >= mi) continue
      const interest = t.remaining * monthlyRate
      const principal = Math.min(t.principalPerMonth, t.remaining)
      interestM += interest
      principalM += principal
      t.remaining -= principal
      t.monthsLeft -= 1
    }
    cash -= interestM + principalM
    cfInterest[mi] = interestM
    cfPrincipalRepaid[mi] = principalM

    // 3) Дефицит → новый транш кратно creditStep
    if (cash < -1e-6) {
      const deficit = -cash
      const draw = creditStep > 0 ? Math.ceil(deficit / creditStep) * creditStep : deficit
      tranches.push({
        remaining: draw,
        principalPerMonth: draw / termMonths,
        monthsLeft: termMonths,
        drawMonth: mi,
      })
      cash += draw
      cfCreditDrawn[mi] = draw
    }

    // 4) Остатки на конец месяца
    const creditBalance = tranches.reduce((a, t) => a + t.remaining, 0)
    creditBalanceEnd[mi] = creditBalance
    cashBalanceEnd[mi] = cash
    if (creditBalance > peakCredit) {
      peakCredit = creditBalance
      peakMonth = mi
    }
    creditMonthSum += creditBalance
  }

  // ── Сборка строк ──
  const profit: ProfitMonthRow[] = []
  let tRevenue = 0, tCogs = 0, tOpex = 0, tProfit = 0, tReinv = 0, tWith = 0
  for (let mi = 0; mi < nMonths; mi++) {
    const revenue = mRevenue[mi]
    const cogs = mCogs[mi]
    const netProfit = mProfit[mi]
    const opex = revenue - cogs - netProfit
    const reinvested = netProfit * params.reinvestRate
    const withdrawn = netProfit * (1 - params.reinvestRate)
    profit.push({
      monthIndex: mi, monthLabel: monthLabel(startMs, mi),
      revenue, cogs, opex, netProfit, reinvested, withdrawn,
    })
    tRevenue += revenue; tCogs += cogs; tOpex += opex
    tProfit += netProfit; tReinv += reinvested; tWith += withdrawn
  }

  const cashFlow: CashFlowMonthRow[] = []
  for (let mi = 0; mi < nMonths; mi++) {
    const netCashFlow =
      cfWbReceipts[mi] - cfProcurement[mi] - cfInterest[mi] - cfWithdrawal[mi]
    cashFlow.push({
      monthIndex: mi, monthLabel: monthLabel(startMs, mi),
      wbReceipts: cfWbReceipts[mi],
      procurement: cfProcurement[mi],
      interest: cfInterest[mi],
      ownerWithdrawal: cfWithdrawal[mi],
      netCashFlow,
      creditDrawn: cfCreditDrawn[mi],
      creditPrincipalRepaid: cfPrincipalRepaid[mi],
      creditBalanceEnd: creditBalanceEnd[mi],
      cashBalanceEnd: cashBalanceEnd[mi],
    })
  }

  const totalInterest = cfInterest.reduce((a, b) => a + b, 0)
  const creditAssessment: CreditAssessment = {
    peakCredit,
    peakMonthIndex: peakMonth,
    peakMonthLabel: monthLabel(startMs, peakMonth),
    totalInterest,
    avgCredit: creditMonthSum / nMonths,
    endingCredit: creditBalanceEnd[nMonths - 1],
    ownFundsSufficient: peakCredit < 1,
    peakCapitalNeed: variant.ownFunds + peakCredit,
  }

  return {
    config: variant,
    profit,
    cashFlow,
    credit: creditAssessment,
    profitTotals: {
      revenue: tRevenue, cogs: tCogs, opex: tOpex,
      netProfit: tProfit, reinvested: tReinv, withdrawn: tWith,
    },
    profitAfterInterest: tProfit - totalInterest,
  }
}

/**
 * Метрики по каждому товару за горизонт (на базовой марже, без дельты варианта).
 * Оборотный капитал = пик/средн. суммы «вложено в товар, ещё не вернулось деньгами»
 * (накопленные платежи поставщикам − накопленный возврат себестоимости от WB).
 */
export function computeProductMetrics(
  products: ProductInput[],
  params: GlobalParams,
): ProductMetrics[] {
  const startMs = parseUtc(params.startDate)
  const nDays = horizonDays(startMs, params.horizonMonths)
  const nMonths = params.horizonMonths
  const split = params.paymentSplit

  return products.map((p) => {
    const soldPerDay = p.ordersPerDay * p.buyoutRate
    const avail = leadToAvailability(p)
    const beforeShipOffset = p.productionDays + p.inspectionDays
    const atCustomsOffset = p.productionDays + p.inspectionDays + p.chinaLogisticsDays

    const procOut = new Float64Array(nDays)
    const cogsRecovered = new Float64Array(nDays)

    // Закупка
    const orderInterval = p.batchQty / soldPerDay
    const batchCost = p.batchQty * p.costPerUnit
    for (let k = 0; ; k++) {
      const orderDay = Math.round(k * orderInterval)
      if (orderDay >= nDays) break
      const d1 = orderDay + beforeShipOffset
      const d2 = orderDay + atCustomsOffset
      if (orderDay < nDays) procOut[orderDay] += batchCost * split.onOrder
      if (d1 < nDays) procOut[d1] += batchCost * split.beforeShip
      if (d2 < nDays) procOut[d2] += batchCost * split.atCustoms
    }

    // Продажи (accrual) + возврат себестоимости (cash)
    const dailyRevenue = soldPerDay * p.price
    const dailyCogs = soldPerDay * p.costPerUnit
    const dailyProfit = p.marginPct * dailyRevenue
    let annualRevenue = 0, annualCogs = 0, annualProfit = 0
    for (let d = avail; d < nDays; d++) {
      const mi = monthIndexOfDay(startMs, d)
      if (mi >= 0 && mi < nMonths) {
        annualRevenue += dailyRevenue
        annualCogs += dailyCogs
        annualProfit += dailyProfit
      }
      const cashDay = wbCashDay(startMs, d, params.wbPayoutWeeks)
      if (cashDay < nDays) cogsRecovered[cashDay] += dailyCogs
    }

    // Оборотный капитал = накопленная закупка − накопленный возврат себестоимости
    let cumProc = 0, cumRec = 0
    let peakWC = 0, sumWC = 0
    for (let d = 0; d < nDays; d++) {
      cumProc += procOut[d]
      cumRec += cogsRecovered[d]
      const wc = cumProc - cumRec
      if (wc > peakWC) peakWC = wc
      sumWC += wc
    }
    const avgWC = sumWC / nDays
    const capitalTurnsPerYear = avgWC > 0 ? annualCogs / avgWC : 0
    const cashCycleDays = capitalTurnsPerYear > 0 ? 365 / capitalTurnsPerYear : 0
    const returnOnWorkingCapital = avgWC > 0 ? annualProfit / avgWC : 0

    return {
      name: p.name,
      ordersPerDay: p.ordersPerDay,
      batchQty: p.batchQty,
      marginPct: p.marginPct,
      // ROI считаем из маржи для консистентности при редактировании параметров.
      roi: p.costPerUnit > 0 ? (p.marginPct * p.price) / p.costPerUnit : 0,
      cashCycleDays,
      annualRevenue,
      annualCogs,
      annualProfit,
      peakWorkingCapital: peakWC,
      avgWorkingCapital: avgWC,
      capitalTurnsPerYear,
      returnOnWorkingCapital,
    }
  })
}

/** Полный прогон всех вариантов. */
export function runModel(
  products: ProductInput[] = PRODUCTS,
  params: GlobalParams = DEFAULT_PARAMS,
  variants: VariantConfig[] = DEFAULT_VARIANTS,
): ModelResult {
  return {
    params,
    variants: variants.map((v) => simulateVariant(products, params, v)),
    productMetrics: computeProductMetrics(products, params),
  }
}
