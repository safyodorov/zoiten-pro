// Phase 19+ 2026-05-22: метрики per-nmId для legend в expand-панели /prices/wb.
//
// Загружает в одном проходе:
//   • % выкупа per nmId (raw WbCardFunnelDaily.buyoutPercent за вчера, fallback на
//     взвешенное среднее по окну 7д, fallback null)
//   • ДРР per nmId — за вчера и за 7 дней
//   • ДРР per subcategoryId — за вчера и за 7 дней (агрегация всех nmId подкатегории)
//   • ДРР per categoryId — за вчера и за 7 дней (агрегация всех nmId категории)
//
// ДРР = spend / revenueAdjusted × 100, где:
//   spend = SUM(WbAdvertStatDaily.sum)             [есть nmId напрямую]
//   revenueAdjusted = SUM_per_(nmId,day)( ordersSumRub × buyoutPct(nmId,day) / 100 )
//   buyoutPct(nmId,day) = WbCardFunnelDaily.buyoutPercent (raw daily, fallback
//     на 7д weighted per nmId, fallback 90%)
//
// Отличается от /ads/wb chart, где spend берётся из WbAdvertSpendRow.updSum
// (ground truth) и применяется rolling 30d weighted buyout. Для quick-glance legend
// per-nmId сильнее важна доступность nmId в spend → используем WbAdvertStatDaily.

import { prisma } from "@/lib/prisma"

export interface NmIdLegendMetrics {
  buyoutPct: number | null
  drrYesterday: number | null
  drr7d: number | null
}

export interface GroupLegendMetrics {
  drrYesterday: number | null
  drr7d: number | null
}

export interface LegendMetrics {
  perNmId: Map<number, NmIdLegendMetrics>
  perSubcategoryId: Map<string, GroupLegendMetrics>
  perCategoryId: Map<string, GroupLegendMetrics>
}

const EMPTY_METRICS: LegendMetrics = {
  perNmId: new Map(),
  perSubcategoryId: new Map(),
  perCategoryId: new Map(),
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function safeDiv(num: number, den: number): number | null {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null
  return num / den
}

/** Загружает метрики легенды для всех nmId одним проходом.
 *
 *  @param scopeNmIds — полный набор nmId, по которому агрегируются под/категории.
 *    Должен включать ВСЕ nmId линкованных продуктов в подкатегориях/категориях
 *    раскрытых nmId, а не только видимые на странице.
 *  @param nmIdToSubcategoryId — карта nmId → subcategoryId продукта (или null)
 *  @param nmIdToCategoryId — карта nmId → categoryId продукта (или null)
 *  @param todayMsk — 00:00 MSK сегодня (как exclusive верхняя граница)
 */
export async function loadLegendMetrics(
  scopeNmIds: number[],
  nmIdToSubcategoryId: Map<number, string | null>,
  nmIdToCategoryId: Map<number, string | null>,
  todayMsk: Date,
): Promise<LegendMetrics> {
  if (scopeNmIds.length === 0) return EMPTY_METRICS

  // Окна: вчера = [today-1, today); 7д = [today-7, today)
  const yesterday = new Date(todayMsk.getTime() - 24 * 3600_000)
  const sevenDaysAgo = new Date(todayMsk.getTime() - 7 * 24 * 3600_000)
  const yesterdayKey = dateKey(yesterday)

  const [funnelRows, advertRows] = await Promise.all([
    prisma.wbCardFunnelDaily.findMany({
      where: {
        nmId: { in: scopeNmIds },
        date: { gte: sevenDaysAgo, lt: todayMsk },
      },
      select: {
        nmId: true,
        date: true,
        ordersSumRub: true,
        ordersCount: true,
        buyoutPercent: true,
      },
    }),
    prisma.wbAdvertStatDaily.findMany({
      where: {
        nmId: { in: scopeNmIds },
        date: { gte: sevenDaysAgo, lt: todayMsk },
      },
      select: { nmId: true, date: true, sum: true },
    }),
  ])

  // ── Резолвер % выкупа per (nmId, dateKey). Raw → 7d weighted (per nmId) → null
  type FunnelDay = {
    ordersSumRub: number
    ordersCount: number
    buyoutPercent: number | null
  }
  const funnelByNmDate = new Map<string, FunnelDay>()
  // Для 7d weighted fallback: per nmId накапливаем num=Σ(pct×orders), den=Σ(orders)
  const weightedAccByNm = new Map<number, { num: number; den: number }>()

  for (const r of funnelRows) {
    const key = `${r.nmId}_${dateKey(r.date)}`
    funnelByNmDate.set(key, {
      ordersSumRub: r.ordersSumRub,
      ordersCount: r.ordersCount,
      buyoutPercent: r.buyoutPercent,
    })
    if (r.buyoutPercent != null && r.ordersCount > 0) {
      const acc = weightedAccByNm.get(r.nmId) ?? { num: 0, den: 0 }
      acc.num += r.buyoutPercent * r.ordersCount
      acc.den += r.ordersCount
      weightedAccByNm.set(r.nmId, acc)
    }
  }

  const buyoutFallbackByNm = new Map<number, number>()
  for (const [nmId, acc] of weightedAccByNm) {
    if (acc.den > 0) buyoutFallbackByNm.set(nmId, acc.num / acc.den)
  }

  const resolveBuyout = (nmId: number, dKey: string): number | null => {
    const direct = funnelByNmDate.get(`${nmId}_${dKey}`)
    if (direct?.buyoutPercent != null) return direct.buyoutPercent
    return buyoutFallbackByNm.get(nmId) ?? null
  }

  // ── Spend per (nmId, dateKey)
  const spendByNmDate = new Map<string, number>()
  for (const r of advertRows) {
    const key = `${r.nmId}_${dateKey(r.date)}`
    spendByNmDate.set(key, (spendByNmDate.get(key) ?? 0) + r.sum)
  }

  // ── Helper: для конкретного набора nmId + окна вернуть {spend, revenueAdjusted}
  const aggregate = (
    nmIds: Iterable<number>,
    dayKeys: string[],
    hardBuyoutFallback = 90,
  ) => {
    let spend = 0
    let revenueAdj = 0
    for (const nmId of nmIds) {
      for (const dKey of dayKeys) {
        spend += spendByNmDate.get(`${nmId}_${dKey}`) ?? 0
        const fd = funnelByNmDate.get(`${nmId}_${dKey}`)
        if (!fd || fd.ordersSumRub <= 0) continue
        const pct =
          resolveBuyout(nmId, dKey) ?? hardBuyoutFallback
        revenueAdj += fd.ordersSumRub * (pct / 100)
      }
    }
    return { spend, revenueAdj }
  }

  // День-ключи окон
  const yesterdayKeys = [yesterdayKey]
  const sevenDayKeys: string[] = []
  for (let i = 7; i >= 1; i--) {
    sevenDayKeys.push(dateKey(new Date(todayMsk.getTime() - i * 24 * 3600_000)))
  }

  // ── Per-nmId
  const perNmId = new Map<number, NmIdLegendMetrics>()
  for (const nmId of scopeNmIds) {
    const yest = aggregate([nmId], yesterdayKeys)
    const week = aggregate([nmId], sevenDayKeys)
    const drrYesterday = safeDiv(yest.spend, yest.revenueAdj)
    const drr7d = safeDiv(week.spend, week.revenueAdj)

    // % выкупа: raw за вчера → 7d weighted fallback → null
    const buyoutPct = resolveBuyout(nmId, yesterdayKey)

    perNmId.set(nmId, {
      buyoutPct,
      drrYesterday: drrYesterday != null ? drrYesterday * 100 : null,
      drr7d: drr7d != null ? drr7d * 100 : null,
    })
  }

  // ── Per-subcategory: nmIds → группировка
  const nmIdsBySubId = new Map<string, Set<number>>()
  for (const nmId of scopeNmIds) {
    const subId = nmIdToSubcategoryId.get(nmId)
    if (!subId) continue
    if (!nmIdsBySubId.has(subId)) nmIdsBySubId.set(subId, new Set())
    nmIdsBySubId.get(subId)!.add(nmId)
  }
  const perSubcategoryId = new Map<string, GroupLegendMetrics>()
  for (const [subId, nmSet] of nmIdsBySubId) {
    const yest = aggregate(nmSet, yesterdayKeys)
    const week = aggregate(nmSet, sevenDayKeys)
    const drrYesterday = safeDiv(yest.spend, yest.revenueAdj)
    const drr7d = safeDiv(week.spend, week.revenueAdj)
    perSubcategoryId.set(subId, {
      drrYesterday: drrYesterday != null ? drrYesterday * 100 : null,
      drr7d: drr7d != null ? drr7d * 100 : null,
    })
  }

  // ── Per-category
  const nmIdsByCatId = new Map<string, Set<number>>()
  for (const nmId of scopeNmIds) {
    const catId = nmIdToCategoryId.get(nmId)
    if (!catId) continue
    if (!nmIdsByCatId.has(catId)) nmIdsByCatId.set(catId, new Set())
    nmIdsByCatId.get(catId)!.add(nmId)
  }
  const perCategoryId = new Map<string, GroupLegendMetrics>()
  for (const [catId, nmSet] of nmIdsByCatId) {
    const yest = aggregate(nmSet, yesterdayKeys)
    const week = aggregate(nmSet, sevenDayKeys)
    const drrYesterday = safeDiv(yest.spend, yest.revenueAdj)
    const drr7d = safeDiv(week.spend, week.revenueAdj)
    perCategoryId.set(catId, {
      drrYesterday: drrYesterday != null ? drrYesterday * 100 : null,
      drr7d: drr7d != null ? drr7d * 100 : null,
    })
  }

  return { perNmId, perSubcategoryId, perCategoryId }
}
