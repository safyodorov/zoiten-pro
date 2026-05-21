// Phase 19+ 2026-05-20: data helpers для UI визуализации spend из /adv/v1/upd.
// Все запросы — pure server-side, results возвращаются в plain shapes для RSC.

import { prisma } from "@/lib/prisma"

export interface DailySpendPoint {
  date: string // YYYY-MM-DD
  spend: number // ₽ сумма за день
  count: number // количество списаний
  revenue: number // ₽ выручка по заказам (WbCardFunnelDaily.ordersSumRub суммарно)
  drrPct: number | null // ДРР = (spend / revenue) × 100%; null если revenue = 0
}

export interface SpendSummaryData {
  totalSpend: number // ₽ за период
  totalCount: number // строк списаний
  totalRevenue: number // ₽ выручка за период
  avgDaily: number // ₽/день spend
  avgDailyRevenue: number // ₽/день revenue
  drrPct: number | null // overall ДРР = total spend / total revenue × 100%
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

/** Daily spend + revenue + DRR chart data за период.
 *  Spend из WbAdvertSpendRow (по effectiveDate), revenue из WbCardFunnelDaily
 *  (ordersSumRub, агрегированно по всем nmId за день).
 *  ДРР = spend / revenue × 100%; null если revenue=0 (нет данных WB Funnel за день). */
export async function getDailySpend(periodDays: number): Promise<DailySpendPoint[]> {
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const from = new Date(today.getTime() - (periodDays - 1) * 24 * 3600_000)
  const to = new Date(today.getTime() + 24 * 3600_000)

  const [spendRows, revenueRows] = await Promise.all([
    prisma.$queryRaw<Array<{ day: Date; spend: number; cnt: bigint }>>`
      SELECT
        DATE_TRUNC('day', "effectiveDate")::date AS day,
        SUM("updSum")::float AS spend,
        COUNT(*)::bigint AS cnt
      FROM "WbAdvertSpendRow"
      WHERE "effectiveDate" >= ${from} AND "effectiveDate" < ${to}
      GROUP BY day
      ORDER BY day ASC
    `,
    prisma.$queryRaw<Array<{ day: Date; revenue: number }>>`
      SELECT
        "date" AS day,
        SUM("ordersSumRub")::float AS revenue
      FROM "WbCardFunnelDaily"
      WHERE "date" >= ${from} AND "date" < ${to}
      GROUP BY "date"
      ORDER BY "date" ASC
    `,
  ])

  const spendByDate = new Map<string, { spend: number; count: number }>()
  for (const r of spendRows) {
    const key = r.day.toISOString().slice(0, 10)
    spendByDate.set(key, { spend: Number(r.spend), count: Number(r.cnt) })
  }
  const revenueByDate = new Map<string, number>()
  for (const r of revenueRows) {
    const key = r.day.toISOString().slice(0, 10)
    revenueByDate.set(key, Number(r.revenue))
  }

  const out: DailySpendPoint[] = []
  for (let i = 0; i < periodDays; i++) {
    const d = new Date(from.getTime() + i * 24 * 3600_000)
    const key = d.toISOString().slice(0, 10)
    const s = spendByDate.get(key)
    const revenue = revenueByDate.get(key) ?? 0
    const spend = s?.spend ?? 0
    const drrPct = revenue > 0 ? (spend / revenue) * 100 : null
    out.push({
      date: key,
      spend,
      count: s?.count ?? 0,
      revenue,
      drrPct,
    })
  }
  return out
}

/** Summary за период: total spend, total revenue, ДРР, breakdown по paymentType. */
export async function getSpendSummary(periodDays: number): Promise<SpendSummaryData> {
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const from = new Date(today.getTime() - (periodDays - 1) * 24 * 3600_000)
  const to = new Date(today.getTime() + 24 * 3600_000)

  const [totals, byType, revenueAgg] = await Promise.all([
    prisma.wbAdvertSpendRow.aggregate({
      where: { effectiveDate: { gte: from, lt: to } },
      _sum: { updSum: true },
      _count: { _all: true },
    }),
    prisma.wbAdvertSpendRow.groupBy({
      by: ["paymentType"],
      where: { effectiveDate: { gte: from, lt: to } },
      _sum: { updSum: true },
      _count: { _all: true },
      orderBy: { _sum: { updSum: "desc" } },
    }),
    prisma.wbCardFunnelDaily.aggregate({
      where: { date: { gte: from, lt: to } },
      _sum: { ordersSumRub: true },
    }),
  ])

  const totalSpend = Number(totals._sum.updSum ?? 0)
  const totalCount = totals._count._all
  const totalRevenue = Number(revenueAgg._sum.ordersSumRub ?? 0)
  const drrPct = totalRevenue > 0 ? (totalSpend / totalRevenue) * 100 : null

  return {
    totalSpend,
    totalCount,
    totalRevenue,
    avgDaily: periodDays > 0 ? totalSpend / periodDays : 0,
    avgDailyRevenue: periodDays > 0 ? totalRevenue / periodDays : 0,
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
export async function getTopCampaigns(periodDays: number, limit = 10): Promise<TopCampaign[]> {
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const from = new Date(today.getTime() - (periodDays - 1) * 24 * 3600_000)
  const to = new Date(today.getTime() + 24 * 3600_000)

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
