// Phase 19+ 2026-05-20: data helpers для UI визуализации spend из /adv/v1/upd.
// Все запросы — pure server-side, results возвращаются в plain shapes для RSC.
//
// 2026-05-21: ДРР учитывает процент выкупа per-nmId.
// Раньше: ДРР = spend / SUM(WbCardFunnelDaily.ordersSumRub) — оборот по заказам.
// Это завышенное «знаменательное» — выкупается не 100% заказов, а ~85-92% для
// одежды. Сейчас: revenue_adjusted = SUM(ordersSumRub × buyoutPct(nmId) / 100),
// где buyoutPct берётся из WbCard.buyoutPercent (monthly avg per nmId из Analytics
// API). Если поле null — используется global avg по карточкам у которых есть данные.

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

/** Опциональные фильтры для всех функций модуля.
 *  - advertIds: ограничить spend выбранными кампаниями (нужно если фильтр
 *    направления/бренда/категории применён → spend идёт через advertId).
 *  - nmIds: ограничить revenue выбранными nmId.
 *  Если поле undefined / пустой массив → не фильтруем по этому измерению. */
export interface SpendFilter {
  advertIds?: number[]
  nmIds?: number[]
}

export interface DailySpendPoint {
  date: string // YYYY-MM-DD
  spend: number // ₽ сумма за день
  count: number // количество списаний
  /** ₽ оборот по заказам за день (WbCardFunnelDaily.ordersSumRub суммарно). */
  revenue: number
  /** ₽ выручка с учётом выкупа = Σ(ordersSumRub × buyoutPct(nmId)/100). */
  revenueAdjusted: number
  /** ДРР = spend / revenueAdjusted × 100%; null если revenueAdjusted = 0. */
  drrPct: number | null
}

export interface SpendSummaryData {
  totalSpend: number // ₽ за период
  totalCount: number // строк списаний
  /** ₽ оборот по заказам за период. */
  totalRevenue: number
  /** ₽ выручка с учётом выкупа per-nmId. */
  totalRevenueAdjusted: number
  avgDaily: number // ₽/день spend
  avgDailyRevenue: number // ₽/день revenue (оборот)
  avgDailyRevenueAdjusted: number // ₽/день выручка с учётом выкупа
  /** Средневзвешенный применённый процент выкупа: totalRevenueAdjusted / totalRevenue × 100%. */
  appliedBuyoutPct: number | null
  /** ДРР с учётом выкупа = total spend / total revenueAdjusted × 100%. */
  drrPct: number | null
  byPaymentType: Array<{ paymentType: string; spend: number; count: number }>
  periodDays: number
}

export interface TopCampaign {
  advertId: number
  campName: string
  advertType: number
  advertStatus: number
  spend: number
  count: number
}

/** Загрузить взвешенный buyoutPct per-nmId + global fallback.
 *
 *  Источник: WbCardFunnelDaily.buyoutPercent — per-day % выкупа от WB Funnel API
 *  (WB сам учитывает лаг между заказом и выкупом). Взвешиваем по ordersCount
 *  чтобы дни с малым объёмом не искажали среднее.
 *
 *  Окно — последние 30 дней. «Процент выкупа за месяц» — стабильная per-nmId
 *  характеристика, рабочее число для юнит-экономики (соответствует тому что
 *  показывает кабинет WB Аналитика → Воронка продаж).
 *
 *  WbCard.buyoutPercent (Analytics API monthly avg) НЕ используется — на 226
 *  карточках 0 заполнено (Analytics cap 3/сутки + ошибки парсинга CSV).
 *
 *  @returns
 *    - buyoutByNmId: per-nmId взвешенный % (только для nmId с заказами)
 *    - globalAvgBuyout: глобальный взвешенный % по всем funnel rows за окно
 *      (fallback для nmId без funnel-данных, должен быть редким случаем)
 */
async function loadBuyoutPctMap(nmIdsFilter?: number[]): Promise<{
  buyoutByNmId: Map<number, number>
  globalAvgBuyout: number
}> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600_000)
  // SQL fragment для фильтра по nmId — если не задан, передаём NO-OP условие.
  const nmFilterSql =
    nmIdsFilter && nmIdsFilter.length > 0
      ? Prisma.sql`AND "nmId" IN (${Prisma.join(nmIdsFilter)})`
      : Prisma.sql``

  const [perNmId, globalRow] = await Promise.all([
    prisma.$queryRaw<Array<{ nmId: number; weighted: number | null }>>`
      SELECT
        "nmId",
        (SUM("buyoutPercent" * "ordersCount") / NULLIF(SUM("ordersCount"), 0))::float AS weighted
      FROM "WbCardFunnelDaily"
      WHERE "buyoutPercent" IS NOT NULL
        AND "ordersCount" > 0
        AND "date" >= ${thirtyDaysAgo}
        ${nmFilterSql}
      GROUP BY "nmId"
    `,
    prisma.$queryRaw<Array<{ weighted: number | null }>>`
      SELECT
        (SUM("buyoutPercent" * "ordersCount") / NULLIF(SUM("ordersCount"), 0))::float AS weighted
      FROM "WbCardFunnelDaily"
      WHERE "buyoutPercent" IS NOT NULL
        AND "ordersCount" > 0
        AND "date" >= ${thirtyDaysAgo}
        ${nmFilterSql}
    `,
  ])

  const buyoutByNmId = new Map<number, number>()
  for (const r of perNmId) {
    if (r.weighted != null && r.weighted > 0) {
      buyoutByNmId.set(r.nmId, r.weighted)
    }
  }
  // Fallback 90% если в БД нет funnel-данных вообще (первый запуск, до cron-backfill).
  const globalAvgBuyout = globalRow[0]?.weighted ?? 90
  return { buyoutByNmId, globalAvgBuyout }
}

/** Daily spend + revenue + DRR chart data за период.
 *  Spend из WbAdvertSpendRow (по effectiveDate).
 *  Revenue (оборот) — SUM(WbCardFunnelDaily.ordersSumRub).
 *  RevenueAdjusted — Σ_per_nmId(ordersSumRub × buyoutPct(nmId)/100), buyoutPct
 *  per-nmId стабильный из WbCard.buyoutPercent (Analytics monthly avg), null →
 *  global avg по карточкам с данными.
 *  ДРР = spend / revenueAdjusted × 100%; null если revenueAdjusted = 0. */
export async function getDailySpend(
  periodDays: number,
  filter?: SpendFilter,
): Promise<DailySpendPoint[]> {
  // Окно — periodDays ПОЛНЫХ прошедших дней, заканчивая вчера.
  // Текущий день исключаем: данные неполные (utm/funnel cron утром, spend
  // /adv/v1/upd за час назад), показывать их рядом с полными днями обманчиво.
  // Соответствует getPeriodRange() в wb-advert-aggregations.ts.
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const to = today // exclusive (= вчера 23:59:59 включительно)
  const from = new Date(today.getTime() - periodDays * 24 * 3600_000)

  const { buyoutByNmId, globalAvgBuyout } = await loadBuyoutPctMap(filter?.nmIds)

  // Динамические фильтры для $queryRaw. Если списка нет — NO-OP fragment.
  const spendAdvertFilter =
    filter?.advertIds && filter.advertIds.length > 0
      ? Prisma.sql`AND "advertId" IN (${Prisma.join(filter.advertIds)})`
      : Prisma.sql``

  const [spendRows, revenueRows] = await Promise.all([
    prisma.$queryRaw<Array<{ day: Date; spend: number; cnt: bigint }>>`
      SELECT
        DATE_TRUNC('day', "effectiveDate")::date AS day,
        SUM("updSum")::float AS spend,
        COUNT(*)::bigint AS cnt
      FROM "WbAdvertSpendRow"
      WHERE "effectiveDate" >= ${from} AND "effectiveDate" < ${to}
        ${spendAdvertFilter}
      GROUP BY day
      ORDER BY day ASC
    `,
    // Per-(nmId, day) — JS код применит buyoutPct и сгруппирует. Это даёт
    // правильную per-nmId коррекцию и при этом избегает JOIN'а с WbCard в SQL
    // (Prisma $queryRaw не любит дин. JOIN, плюс buyoutByNmId уже в памяти).
    prisma.wbCardFunnelDaily.findMany({
      where: {
        date: { gte: from, lt: to },
        ...(filter?.nmIds && filter.nmIds.length > 0
          ? { nmId: { in: filter.nmIds } }
          : {}),
      },
      select: { nmId: true, date: true, ordersSumRub: true },
    }),
  ])

  const spendByDate = new Map<string, { spend: number; count: number }>()
  for (const r of spendRows) {
    const key = r.day.toISOString().slice(0, 10)
    spendByDate.set(key, { spend: Number(r.spend), count: Number(r.cnt) })
  }

  // Per-day агрегация: revenue (оборот) + revenueAdjusted (с выкупом per-nmId).
  type DayAgg = { revenue: number; revenueAdjusted: number }
  const aggByDate = new Map<string, DayAgg>()
  for (const r of revenueRows) {
    const key = r.date.toISOString().slice(0, 10)
    const buyoutPct = buyoutByNmId.get(r.nmId) ?? globalAvgBuyout
    const a = aggByDate.get(key) ?? { revenue: 0, revenueAdjusted: 0 }
    a.revenue += r.ordersSumRub
    a.revenueAdjusted += r.ordersSumRub * (buyoutPct / 100)
    aggByDate.set(key, a)
  }

  const out: DailySpendPoint[] = []
  for (let i = 0; i < periodDays; i++) {
    const d = new Date(from.getTime() + i * 24 * 3600_000)
    const key = d.toISOString().slice(0, 10)
    const s = spendByDate.get(key)
    const agg = aggByDate.get(key) ?? { revenue: 0, revenueAdjusted: 0 }
    const spend = s?.spend ?? 0
    const drrPct =
      agg.revenueAdjusted > 0 ? (spend / agg.revenueAdjusted) * 100 : null
    out.push({
      date: key,
      spend,
      count: s?.count ?? 0,
      revenue: agg.revenue,
      revenueAdjusted: agg.revenueAdjusted,
      drrPct,
    })
  }
  return out
}

/** Summary за период: total spend, total revenue (оборот + с учётом выкупа),
 *  ДРР с коррекцией на выкуп, breakdown по paymentType.
 *
 *  Выкуп применяется per-nmId (стабильное значение из WbCard.buyoutPercent —
 *  monthly avg из Analytics API). Per-day buyoutPercent НЕ используется —
 *  на свежих днях он 0 (выкупы ещё не вернулись), это искажает ДРР. */
export async function getSpendSummary(
  periodDays: number,
  filter?: SpendFilter,
): Promise<SpendSummaryData> {
  // Окно — periodDays ПОЛНЫХ прошедших дней, заканчивая вчера.
  // Текущий день исключаем: данные неполные (utm/funnel cron утром, spend
  // /adv/v1/upd за час назад), показывать их рядом с полными днями обманчиво.
  // Соответствует getPeriodRange() в wb-advert-aggregations.ts.
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const to = today // exclusive (= вчера 23:59:59 включительно)
  const from = new Date(today.getTime() - periodDays * 24 * 3600_000)

  const { buyoutByNmId, globalAvgBuyout } = await loadBuyoutPctMap(filter?.nmIds)

  // Prisma where фильтры для spend / revenue.
  const spendWhere: Prisma.WbAdvertSpendRowWhereInput = {
    effectiveDate: { gte: from, lt: to },
    ...(filter?.advertIds && filter.advertIds.length > 0
      ? { advertId: { in: filter.advertIds } }
      : {}),
  }
  const revenueWhere: Prisma.WbCardFunnelDailyWhereInput = {
    date: { gte: from, lt: to },
    ...(filter?.nmIds && filter.nmIds.length > 0
      ? { nmId: { in: filter.nmIds } }
      : {}),
  }

  const [totals, byType, revenueRows] = await Promise.all([
    prisma.wbAdvertSpendRow.aggregate({
      where: spendWhere,
      _sum: { updSum: true },
      _count: { _all: true },
    }),
    prisma.wbAdvertSpendRow.groupBy({
      by: ["paymentType"],
      where: spendWhere,
      _sum: { updSum: true },
      _count: { _all: true },
      orderBy: { _sum: { updSum: "desc" } },
    }),
    // Per-nmId агрегация оборота за период (sum через JS чтобы применить
    // buyoutPct per-nmId).
    prisma.wbCardFunnelDaily.groupBy({
      by: ["nmId"],
      where: revenueWhere,
      _sum: { ordersSumRub: true },
    }),
  ])

  const totalSpend = Number(totals._sum.updSum ?? 0)
  const totalCount = totals._count._all

  let totalRevenue = 0
  let totalRevenueAdjusted = 0
  for (const r of revenueRows) {
    const oborot = Number(r._sum.ordersSumRub ?? 0)
    const buyoutPct = buyoutByNmId.get(r.nmId) ?? globalAvgBuyout
    totalRevenue += oborot
    totalRevenueAdjusted += oborot * (buyoutPct / 100)
  }

  const drrPct =
    totalRevenueAdjusted > 0 ? (totalSpend / totalRevenueAdjusted) * 100 : null
  const appliedBuyoutPct =
    totalRevenue > 0 ? (totalRevenueAdjusted / totalRevenue) * 100 : null

  return {
    totalSpend,
    totalCount,
    totalRevenue,
    totalRevenueAdjusted,
    avgDaily: periodDays > 0 ? totalSpend / periodDays : 0,
    avgDailyRevenue: periodDays > 0 ? totalRevenue / periodDays : 0,
    avgDailyRevenueAdjusted:
      periodDays > 0 ? totalRevenueAdjusted / periodDays : 0,
    appliedBuyoutPct,
    drrPct,
    byPaymentType: byType.map(r => ({
      paymentType: r.paymentType,
      spend: Number(r._sum.updSum ?? 0),
      count: r._count._all,
    })),
    periodDays,
  }
}

/** Top N кампаний по spend за период. */
export async function getTopCampaigns(
  periodDays: number,
  limit = 10,
  filter?: SpendFilter,
): Promise<TopCampaign[]> {
  // Окно — periodDays ПОЛНЫХ прошедших дней, заканчивая вчера.
  // Текущий день исключаем: данные неполные (utm/funnel cron утром, spend
  // /adv/v1/upd за час назад), показывать их рядом с полными днями обманчиво.
  // Соответствует getPeriodRange() в wb-advert-aggregations.ts.
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const to = today // exclusive (= вчера 23:59:59 включительно)
  const from = new Date(today.getTime() - periodDays * 24 * 3600_000)

  const advertFilter =
    filter?.advertIds && filter.advertIds.length > 0
      ? Prisma.sql`AND "advertId" IN (${Prisma.join(filter.advertIds)})`
      : Prisma.sql``

  const rows = await prisma.$queryRaw<Array<{
    advertId: number
    campName: string
    advertType: number
    advertStatus: number
    spend: number
    cnt: bigint
  }>>`
    SELECT
      "advertId",
      MAX("campName") AS "campName",
      MAX("advertType") AS "advertType",
      MAX("advertStatus") AS "advertStatus",
      SUM("updSum")::float AS spend,
      COUNT(*)::bigint AS cnt
    FROM "WbAdvertSpendRow"
    WHERE "effectiveDate" >= ${from}
      AND "effectiveDate" < ${to}
      ${advertFilter}
    GROUP BY "advertId"
    ORDER BY spend DESC
    LIMIT ${limit}
  `

  return rows.map(r => ({
    advertId: r.advertId,
    campName: r.campName,
    advertType: r.advertType,
    advertStatus: r.advertStatus,
    spend: Number(r.spend),
    count: Number(r.cnt),
  }))
}
