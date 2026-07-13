// lib/analytics/engine.ts
// Phase 30 (analytics) — чистый движок. БЕЗ prisma, БЕЗ fetch. Правила ТЗ §3.
// Паттерн pure-движка: lib/sales-plan/engine.ts, lib/finance-cashflow/engine.ts.
import {
  DAYS_IN_MONTH,
  WALLET_PRICE_FACTOR,
  type FunnelDayRaw,
  type FunnelMonthTotals,
  type FunnelAggregate,
  type PositionDay,
  type SortMode,
  type SkuCompletenessInput,
  type CompletenessResult,
} from "./types"

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)
/** Деление с защитой от /0 (пустой знаменатель → 0). */
const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b)

/**
 * Агрегирует воронку SKU за период (ТЗ §3).
 * Объёмы (показы/заказы/сумма) = месячное значение ÷ DAYS_IN_MONTH (КОНСТАНТА 30),
 * НЕ ÷ days.length. Источник месячного значения: monthly (byMonth) → иначе Σ(byDay).
 * Конверсии/выкуп — «от сумм» (Σ/Σ по byDay), НЕ среднее дневных процентов.
 * Медианная цена — СРЕДНЯЯ за период × 0.97 (это цена, не объём — Σ/n дней).
 */
export function aggregateFunnel(
  days: FunnelDayRaw[],
  monthly?: FunnelMonthTotals,
): FunnelAggregate {
  const sView = sum(days.map((d) => d.viewCount))
  const sOpen = sum(days.map((d) => d.openCard))
  const sCart = sum(days.map((d) => d.addToCart))
  const sOrd = sum(days.map((d) => d.orders))
  const sSum = sum(days.map((d) => d.ordersSum))
  const sBuy = sum(days.map((d) => d.buyoutCount))

  // Объёмы: месячное значение ÷ 30 (КОНСТАНТА). НЕ делить на days.length.
  const mViews = monthly?.viewCount ?? sView
  const mOrders = monthly?.orders ?? sOrd
  const mOrdersSum = monthly?.ordersSum ?? sSum

  // Цена — средняя за период (Σ/n дней), затем −3% на WB-Кошелёк.
  const prices = days.map((d) => d.medianPrice).filter((p) => Number.isFinite(p) && p > 0)
  const avgPrice = prices.length ? sum(prices) / prices.length : 0

  return {
    viewsPerDay: mViews / DAYS_IN_MONTH,
    ordersPerDay: mOrders / DAYS_IN_MONTH,
    ordersSumPerDay: mOrdersSum / DAYS_IN_MONTH,
    ctr: safeDiv(sOpen, sView),
    clickToCart: safeDiv(sCart, sOpen),
    cartToOrder: safeDiv(sOrd, sCart),
    clickToOrder: safeDiv(sOrd, sOpen),
    buyoutPct: safeDiv(sBuy, sOrd),
    medianPriceWallet: avgPrice * WALLET_PRICE_FACTOR,
  }
}

/**
 * Единая сортировка топ-30 (ANL-06): по выручке или по конверсии клик→заказ, desc.
 * Стабильный тай-брейк по nmId — идентичный порядок на всех вкладках и в PDF.
 */
export function sortSkus<
  T extends { nmId: number; revenue: number; funnel: { clickToOrder: number } },
>(skus: T[], mode: SortMode): T[] {
  const key = (s: T): number => (mode === "revenue" ? s.revenue : s.funnel.clickToOrder)
  return [...skus].sort((a, b) => {
    const d = key(b) - key(a)
    return d !== 0 ? d : a.nmId - b.nmId
  })
}

/**
 * Правило полноты по рангу выручки (ANL-07):
 * ранжируем по revenue desc; сбой (complete=false) в топ-10 → FAILED,
 * в рангах 11–30 → PARTIAL; всё собрано → OK.
 */
export function evaluateCompleteness(skus: SkuCompletenessInput[]): CompletenessResult {
  const ranked = [...skus].sort((a, b) => {
    const d = b.revenue - a.revenue
    return d !== 0 ? d : a.nmId - b.nmId
  })
  const failedInTop10: number[] = []
  const failedIn11to30: number[] = []
  ranked.forEach((s, i) => {
    if (s.complete) return
    if (i < 10) failedInTop10.push(s.nmId)
    else failedIn11to30.push(s.nmId)
  })
  const status: CompletenessResult["status"] =
    failedInTop10.length > 0 ? "FAILED" : failedIn11to30.length > 0 ? "PARTIAL" : "OK"
  return { status, failedInTop10, failedIn11to30 }
}

/**
 * Средняя органическая позиция по одному запросу (ANL-10):
 * дни organic===null (отсутствие в выдаче) исключаются — не входят в среднее и не штрафуют.
 * Все дни-прочерки → null.
 */
export function averagePositionByQuery(days: PositionDay[]): number | null {
  const present = days.map((d) => d.organic).filter((p): p is number => p !== null)
  if (present.length === 0) return null
  return sum(present) / present.length
}
