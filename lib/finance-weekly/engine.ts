// lib/finance-weekly/engine.ts
//
// PURE детерминированный движок понедельного WB фин-отчёта (/finance/weekly, §4.3).
// Ноль импортов Prisma / React / Next. НЕ импортирует calculatePricing из
// движка юнит-экономики /prices/wb — модель другая (там per-product overrides):
// здесь движок data-agnostic, N_std и хранение приходят как ВХОД от слоя страницы.
//
// Что делает: для каждого артикула (nmId) считает недельную юнит-экономику
// в ДВУХ сценариях комиссии (ИУ и Оферта) с распределением недельных
// затратных пулов пропорционально выручке (revenue-share), в ДВУХ
// непересекающихся мирах затрат (appliances / clothing). Одежда НЕ получает
// проценты по кредиту (§2.2 guard). Возвращает per-article строки + роллап
// (Σ per universe + grand total) + водопад затрат (Σ бакетов × H).
//
// Формулы выведены из Excel-листа «Показатели» (§2 дизайн-спеки).
// Golden-тест: tests/finance-weekly-engine.test.ts (nmId 165967746, ±0.5 ₽).
//
// Phase quick-260710-e7h (2026-07-10)

import {
  DEFAULT_WEEKLY_CONSTANTS,
  type ArticleResult,
  type CostBreakdown,
  type CostWaterfall,
  type ScenarioResult,
  type ScenarioRollup,
  type Universe,
  type UniversePools,
  type WeeklyArticleInput,
  type WeeklyConstants,
  type WeeklyFinReportInputs,
  type WeeklyFinReportOutput,
  type WeeklyRollup,
  type WeeklyWaterfall,
} from "./types"

// ── Хелпер распределения пула (revenue-share) ─────────────────────────────────
//
// Доля выручки артикула × сумма пула. Zero-guard: baseRevenue ≤ 0 → 0
// (не даёт NaN/Infinity при пустой базе).
//   poolPerUnit(K, baseRevenue, poolTotal) = (K / baseRevenue) × poolTotal
export function poolPerUnit(
  grossPricePerUnit: number,
  baseRevenue: number,
  poolTotal: number,
): number {
  return baseRevenue > 0 ? (grossPricePerUnit / baseRevenue) * poolTotal : 0
}

// ── Пустой водопад (аккумулятор) ──────────────────────────────────────────────

function emptyWaterfall(): CostWaterfall {
  return {
    cost: 0,
    ad: 0,
    review: 0,
    logistics: 0,
    delivery: 0,
    credit: 0,
    overhead: 0,
    acceptance: 0,
    storage: 0,
    defect: 0,
    jem: 0,
    tax: 0,
    acquiring: 0,
  }
}

// ── Per-unit разбивка затрат одного сценария ──────────────────────────────────
//
// Все per-unit статьи одного артикула для конкретного сценария. Различие
// между ИУ и Оферта — только в комиссии (J → I) и логистике (N). Пул-статьи
// (delivery/credit/overhead/acceptance/storage) от сценария не зависят.
interface ScenarioBreakdown {
  cutPricePerUnit: number  // I
  commissionPct: number    // J — комиссия % (различается ИУ/Оферта)
  logisticsPerUnit: number // N
  costPerUnit: number      // O
  adPerUnit: number        // L/H
  reviewPerUnit: number    // M/H
  defectPerUnit: number    // брак
  jemPerUnit: number       // джем
  taxPerUnit: number       // налог
  acquiringPerUnit: number // эквайринг
  deliveryPerUnit: number  // доставка (пул)
  creditPerUnit: number    // кредит (пул, 0 для clothing)
  overheadPerUnit: number  // общие (пул)
  acceptancePerUnit: number// приёмка (пул)
  storagePerUnit: number   // хранение (пул или override)
  profitPerUnit: number    // AA
}

// Общие для обоих сценариев per-unit статьи (пулы + брак/джем/налог/эквайринг).
interface CommonPerUnit {
  costPerUnit: number
  adPerUnit: number
  reviewPerUnit: number
  defectPerUnit: number
  jemPerUnit: number
  taxPerUnit: number
  acquiringPerUnit: number
  deliveryPerUnit: number
  creditPerUnit: number
  overheadPerUnit: number
  acceptancePerUnit: number
  storagePerUnit: number
}

// Резолвит per-unit статьи, не зависящие от сценария комиссии.
function resolveCommon(
  article: WeeklyArticleInput,
  pools: UniversePools,
  c: WeeklyConstants,
): CommonPerUnit {
  const { qtyOrders: H, grossPricePerUnit: K, costPerUnit: O } = article

  const adPerUnit = H > 0 ? article.adSpendTotal / H : 0
  const reviewPerUnit = H > 0 ? article.reviewWriteoffTotal / H : 0
  const defectPerUnit = (O * c.defectPct) / 100
  const jemPerUnit = (K * c.jemPct) / 100
  const taxPerUnit = (K * c.taxPct) / 100
  const acquiringPerUnit = (K * c.acquiringPct) / 100

  const deliveryPerUnit = poolPerUnit(K, pools.deliveryToMp.baseRevenue, pools.deliveryToMp.total)
  // ⚠ GUARD (§2.2): проценты по кредиту распределяются ТОЛЬКО на бытовую технику.
  // Одежда (clothing) НИКОГДА не получает кредит, даже если пул передан во входе.
  const creditPerUnit =
    article.universe === "clothing"
      ? 0
      : poolPerUnit(K, pools.creditInterest.baseRevenue, pools.creditInterest.total)
  const overheadPerUnit = poolPerUnit(K, pools.overhead.baseRevenue, pools.overhead.total)
  const acceptancePerUnit = poolPerUnit(K, pools.acceptance.baseRevenue, pools.acceptance.total)
  const storagePerUnit =
    article.storagePerUnit ?? poolPerUnit(K, pools.storage.baseRevenue, pools.storage.total)

  return {
    costPerUnit: O,
    adPerUnit,
    reviewPerUnit,
    defectPerUnit,
    jemPerUnit,
    taxPerUnit,
    acquiringPerUnit,
    deliveryPerUnit,
    creditPerUnit,
    overheadPerUnit,
    acceptancePerUnit,
    storagePerUnit,
  }
}

// Считает один сценарий: J и N подставляются извне (ИУ или Оферта).
function computeScenario(
  article: WeeklyArticleInput,
  common: CommonPerUnit,
  commPct: number,
  logisticsPerUnit: number,
): ScenarioBreakdown {
  const { grossPricePerUnit: K } = article

  // I = K × (100 − J) / 100 — цена минус комиссия / ед.
  const cutPricePerUnit = (K * (100 - commPct)) / 100

  // AA = I − N − O − реклама − отзывы − брак − джем − налог − эквайринг
  //        − доставка − кредит − общие − приёмка − хранение.
  // Полная точность внутри — промежуточные значения НЕ округляем.
  const profitPerUnit =
    cutPricePerUnit -
    logisticsPerUnit -
    common.costPerUnit -
    common.adPerUnit -
    common.reviewPerUnit -
    common.defectPerUnit -
    common.jemPerUnit -
    common.taxPerUnit -
    common.acquiringPerUnit -
    common.deliveryPerUnit -
    common.creditPerUnit -
    common.overheadPerUnit -
    common.acceptancePerUnit -
    common.storagePerUnit

  return {
    cutPricePerUnit,
    commissionPct: commPct,
    logisticsPerUnit,
    ...common,
    profitPerUnit,
  }
}

// Собирает публичный ScenarioResult (перемножает per-unit на H).
function toScenarioResult(article: WeeklyArticleInput, b: ScenarioBreakdown): ScenarioResult {
  const { qtyOrders: H, grossPricePerUnit: K, costPerUnit: O } = article
  const revenue = K * H
  const profit = b.profitPerUnit * H
  const costTotal = O * H

  // Пооперационная per-unit разбивка — все значения УЖЕ посчитаны в b (additive).
  const breakdown: CostBreakdown = {
    pricePerUnit: K,
    commissionPct: b.commissionPct,
    netOfCommissionPerUnit: b.cutPricePerUnit,
    costPerUnit: b.costPerUnit,
    adPerUnit: b.adPerUnit,
    reviewPerUnit: b.reviewPerUnit,
    logisticsPerUnit: b.logisticsPerUnit,
    deliveryPerUnit: b.deliveryPerUnit,
    creditPerUnit: b.creditPerUnit,
    overheadPerUnit: b.overheadPerUnit,
    acceptancePerUnit: b.acceptancePerUnit,
    storagePerUnit: b.storagePerUnit,
    defectPerUnit: b.defectPerUnit,
    jemPerUnit: b.jemPerUnit,
    taxPerUnit: b.taxPerUnit,
    acquiringPerUnit: b.acquiringPerUnit,
  }

  return {
    cutPricePerUnit: b.cutPricePerUnit,
    profitPerUnit: b.profitPerUnit,
    revenue,
    profit,
    rePct: revenue > 0 ? profit / revenue : 0,
    roi: costTotal > 0 ? profit / costTotal : 0,
    breakdown,
  }
}

// Аккумулирует бакеты водопада (× H) из per-unit разбивки сценария.
function addToWaterfall(acc: CostWaterfall, b: ScenarioBreakdown, H: number): void {
  acc.cost += b.costPerUnit * H
  acc.ad += b.adPerUnit * H
  acc.review += b.reviewPerUnit * H
  acc.logistics += b.logisticsPerUnit * H
  acc.delivery += b.deliveryPerUnit * H
  acc.credit += b.creditPerUnit * H
  acc.overhead += b.overheadPerUnit * H
  acc.acceptance += b.acceptancePerUnit * H
  acc.storage += b.storagePerUnit * H
  acc.defect += b.defectPerUnit * H
  acc.jem += b.jemPerUnit * H
  acc.tax += b.taxPerUnit * H
  acc.acquiring += b.acquiringPerUnit * H
}

// Финализирует роллап-бакет (Re из накопленных profit/revenue).
function finalizeRollup(revenue: number, profit: number): ScenarioRollup {
  return {
    revenue,
    profit,
    rePct: revenue > 0 ? profit / revenue : 0,
  }
}

// ── Публичная точка входа ─────────────────────────────────────────────────────

export function computeWeeklyFinReport(
  inputs: WeeklyFinReportInputs,
): WeeklyFinReportOutput {
  const c: WeeklyConstants = { ...DEFAULT_WEEKLY_CONSTANTS, ...inputs.constants }

  const articles: ArticleResult[] = []

  // Аккумуляторы роллапа: per universe (iu/std revenue+profit) + grand.
  const uniAcc: Record<Universe, { iuRev: number; iuProfit: number; stdRev: number; stdProfit: number }> = {
    appliances: { iuRev: 0, iuProfit: 0, stdRev: 0, stdProfit: 0 },
    clothing: { iuRev: 0, iuProfit: 0, stdRev: 0, stdProfit: 0 },
  }
  const seenUniverse: Record<Universe, boolean> = { appliances: false, clothing: false }

  const waterfall: WeeklyWaterfall = { iu: emptyWaterfall(), std: emptyWaterfall() }

  for (const article of inputs.articles) {
    const universe: Universe = article.universe
    const pools = inputs.pools[universe]
    const common = resolveCommon(article, pools, c)

    const iuBreakdown = computeScenario(article, common, article.commIuPct, article.logisticsIuPerUnit)
    const stdBreakdown = computeScenario(article, common, article.commStdPct, article.logisticsStdPerUnit)

    const iu = toScenarioResult(article, iuBreakdown)
    const std = toScenarioResult(article, stdBreakdown)

    articles.push({ nmId: article.nmId, universe, qtyOrders: article.qtyOrders, iu, std })

    // Роллап
    seenUniverse[universe] = true
    uniAcc[universe].iuRev += iu.revenue
    uniAcc[universe].iuProfit += iu.profit
    uniAcc[universe].stdRev += std.revenue
    uniAcc[universe].stdProfit += std.profit

    // Водопад
    addToWaterfall(waterfall.iu, iuBreakdown, article.qtyOrders)
    addToWaterfall(waterfall.std, stdBreakdown, article.qtyOrders)
  }

  // Сборка роллапа: только присутствующие миры, в стабильном порядке.
  const universeOrder: Universe[] = ["appliances", "clothing"]
  const byUniverse = universeOrder
    .filter((u) => seenUniverse[u])
    .map((u) => ({
      universe: u,
      iu: finalizeRollup(uniAcc[u].iuRev, uniAcc[u].iuProfit),
      std: finalizeRollup(uniAcc[u].stdRev, uniAcc[u].stdProfit),
    }))

  const grandIuRev = uniAcc.appliances.iuRev + uniAcc.clothing.iuRev
  const grandIuProfit = uniAcc.appliances.iuProfit + uniAcc.clothing.iuProfit
  const grandStdRev = uniAcc.appliances.stdRev + uniAcc.clothing.stdRev
  const grandStdProfit = uniAcc.appliances.stdProfit + uniAcc.clothing.stdProfit

  const rollup: WeeklyRollup = {
    byUniverse,
    grand: {
      iu: finalizeRollup(grandIuRev, grandIuProfit),
      std: finalizeRollup(grandStdRev, grandStdProfit),
    },
  }

  return { articles, rollup, waterfall }
}
