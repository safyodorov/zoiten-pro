// Phase 19+ 2026-05-20: data helpers для UI визуализации spend из /adv/v1/upd.
// Все запросы — pure server-side, results возвращаются в plain shapes для RSC.

import { prisma } from "@/lib/prisma"

export interface DailySpendPoint {
  date: string // YYYY-MM-DD
  spend: number // ₽ сумма за день
  count: number // количество списаний
}

export interface SpendSummaryData {
  totalSpend: number // ₽ за период
  totalCount: number // строк списаний
  avgDaily: number // ₽/день
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

/** Daily spend chart data за период. effectiveDate группировка в МСК.
 *  Возвращает массив с непрерывным диапазоном дат (нулевые дни тоже включены). */
export async function getDailySpend(periodDays: number): Promise<DailySpendPoint[]> {
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const from = new Date(today.getTime() - (periodDays - 1) * 24 * 3600_000)

  const rows = await prisma.$queryRaw<Array<{ day: Date; spend: number; cnt: bigint }>>`
    SELECT
      DATE_TRUNC('day', "effectiveDate")::date AS day,
      SUM("updSum")::float AS spend,
      COUNT(*)::bigint AS cnt
    FROM "WbAdvertSpendRow"
    WHERE "effectiveDate" >= ${from}
      AND "effectiveDate" < ${new Date(today.getTime() + 24 * 3600_000)}
    GROUP BY day
    ORDER BY day ASC
  `

  const byDate = new Map<string, { spend: number; count: number }>()
  for (const r of rows) {
    const key = r.day.toISOString().slice(0, 10)
    byDate.set(key, { spend: Number(r.spend), count: Number(r.cnt) })
  }

  // Заполняем непрерывный диапазон.
  const out: DailySpendPoint[] = []
  for (let i = 0; i < periodDays; i++) {
    const d = new Date(from.getTime() + i * 24 * 3600_000)
    const key = d.toISOString().slice(0, 10)
    const v = byDate.get(key)
    out.push({ date: key, spend: v?.spend ?? 0, count: v?.count ?? 0 })
  }
  return out
}

/** Summary за период: total, avg, breakdown по paymentType. */
export async function getSpendSummary(periodDays: number): Promise<SpendSummaryData> {
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const from = new Date(today.getTime() - (periodDays - 1) * 24 * 3600_000)
  const to = new Date(today.getTime() + 24 * 3600_000)

  const [totals, byType] = await Promise.all([
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
  ])

  const totalSpend = Number(totals._sum.updSum ?? 0)
  const totalCount = totals._count._all

  return {
    totalSpend,
    totalCount,
    avgDaily: periodDays > 0 ? totalSpend / periodDays : 0,
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
