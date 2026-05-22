// Temporary diagnostic — sanity check legend formula on prod data.
// 2026-05-22 — выяснить почему «вчерашние» ДРР в legend в 2× от SQL-симуляции.
import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { loadBuyoutPctRolling30dMap } from "@/lib/wb-advert-spend-data"
import { getMskTodayDate } from "@/lib/wb-orders-chart"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function GET(): Promise<NextResponse> {
  const todayMsk = getMskTodayDate()
  const sevenDaysAgo = new Date(todayMsk.getTime() - 7 * 24 * 3600_000)
  const target = 61929251

  // Загружаем всех linkedNmIds (как делает /prices/wb)
  const wbMp = await prisma.marketplace.findFirst({ where: { slug: "wb" } })
  if (!wbMp) return NextResponse.json({ error: "no wb" })
  const linkedArticles = await prisma.marketplaceArticle.findMany({
    where: { marketplaceId: wbMp.id, product: { deletedAt: null } },
    select: { article: true },
  })
  const linkedNmIds = linkedArticles
    .map((a) => parseInt(a.article, 10))
    .filter((n) => !Number.isNaN(n))

  // 1) buyout resolver
  const resolver = await loadBuyoutPctRolling30dMap(sevenDaysAgo, todayMsk, linkedNmIds)
  const dayKeys: string[] = []
  for (let i = 7; i >= 1; i--) {
    dayKeys.push(dateKey(new Date(todayMsk.getTime() - i * 24 * 3600_000)))
  }
  const buyoutPerDay = dayKeys.map((dKey) => ({ dKey, buyout: resolver.resolve(target, dKey) }))

  // 2) funnel revenue per day
  const funnelRows = await prisma.wbCardFunnelDaily.findMany({
    where: { nmId: target, date: { gte: sevenDaysAgo, lt: todayMsk } },
    select: { date: true, ordersSumRub: true, buyoutPercent: true, ordersCount: true },
    orderBy: { date: "asc" },
  })

  // 3) advertId targeting 61929251 active
  const targets = await prisma.wbAdvertTarget.findMany({
    where: { nmId: target, active: true },
    select: { advertId: true },
  })
  const advertIds = targets.map((t) => t.advertId)

  // 4) spend per (advertId, day) for these advertIds
  const spendRows = advertIds.length > 0
    ? await prisma.$queryRaw<Array<{ advertId: number; day: Date; spend: number }>>`
      SELECT "advertId", DATE_TRUNC('day', "effectiveDate")::date AS day, SUM("updSum")::float AS spend
      FROM "WbAdvertSpendRow"
      WHERE "advertId" IN (${Prisma.join(advertIds)})
        AND "effectiveDate" >= ${sevenDaysAgo} AND "effectiveDate" < ${todayMsk}
      GROUP BY "advertId", day
      ORDER BY day, "advertId"
    `
    : []

  // 5) For each spend row, simulate attribution (proportional via stats / equal split)
  const allActiveTargets = await prisma.wbAdvertTarget.findMany({
    where: { advertId: { in: advertIds }, active: true, nmId: { gt: 0 } },
    select: { advertId: true, nmId: true },
  })
  const tByAdvert = new Map<number, Set<number>>()
  for (const t of allActiveTargets) {
    let s = tByAdvert.get(t.advertId)
    if (!s) { s = new Set(); tByAdvert.set(t.advertId, s) }
    s.add(t.nmId)
  }

  const statsRows = advertIds.length > 0
    ? await prisma.$queryRaw<Array<{ advertId: number; day: Date; nmId: number; statsSum: number }>>`
      SELECT "advertId", "date"::date AS day, "nmId", SUM("sum")::float AS "statsSum"
      FROM "WbAdvertStatDaily"
      WHERE "advertId" IN (${Prisma.join(advertIds)})
        AND "date" >= ${sevenDaysAgo} AND "date" < ${todayMsk}
      GROUP BY "advertId", day, "nmId"
    `
    : []
  const statsByAdvertDay = new Map<string, Map<number, number>>()
  for (const r of statsRows) {
    const k = `${r.advertId}_${dateKey(r.day)}`
    let m = statsByAdvertDay.get(k)
    if (!m) { m = new Map(); statsByAdvertDay.set(k, m) }
    m.set(r.nmId, (m.get(r.nmId) ?? 0) + r.statsSum)
  }

  const attribByDay = new Map<string, number>()
  for (const sr of spendRows) {
    const dKey = dateKey(sr.day)
    const active = tByAdvert.get(sr.advertId)
    if (!active || active.size === 0) continue
    const perStats = statsByAdvertDay.get(`${sr.advertId}_${dKey}`)
    let activeStatsTotal = 0
    if (perStats) {
      for (const [nm, ns] of perStats) if (active.has(nm)) activeStatsTotal += ns
    }
    let attrib: number
    if (activeStatsTotal > 0 && perStats) {
      const myStats = active.has(target) ? (perStats.get(target) ?? 0) : 0
      attrib = sr.spend * (myStats / activeStatsTotal)
    } else if (active.has(target)) {
      attrib = sr.spend / active.size
    } else {
      attrib = 0
    }
    attribByDay.set(dKey, (attribByDay.get(dKey) ?? 0) + attrib)
  }

  return NextResponse.json({
    target,
    todayMsk: todayMsk.toISOString(),
    sevenDaysAgo: sevenDaysAgo.toISOString(),
    yesterdayKey: dateKey(new Date(todayMsk.getTime() - 24 * 3600_000)),
    funnelRows: funnelRows.map((r) => ({
      dKey: dateKey(r.date),
      ordersSumRub: r.ordersSumRub,
      ordersCount: r.ordersCount,
      buyoutPercent: r.buyoutPercent,
    })),
    buyoutPerDay,
    spendByDay: Object.fromEntries(attribByDay),
    revenueAdjByDay: Object.fromEntries(funnelRows.map((r) => {
      const dKey = dateKey(r.date)
      const pct = resolver.resolve(target, dKey)
      return [dKey, { ordersSumRub: r.ordersSumRub, buyoutAppliedPct: pct, revAdj: r.ordersSumRub * pct / 100 }]
    })),
    advertIds_count: advertIds.length,
  })
}
