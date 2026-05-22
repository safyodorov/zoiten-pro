// Temporary diagnostic 2026-05-22: сравнение spend/DRR для подкатегории через
// 2 метода — /ads/wb summary (naive SUM по advertId) и /prices/wb легенда
// (proportional split per nmId). Цель — понять hvostovoe расхождение.

import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getMskTodayDate } from "@/lib/wb-orders-chart"
import { loadBuyoutPctRolling30dMap } from "@/lib/wb-advert-spend-data"
import { loadLegendMetrics } from "@/lib/wb-legend-metrics"

export const dynamic = "force-dynamic"

const SUBCAT_ID = "cmnncn43a000jvhk0fyjuksmo" // Вакууматор

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function GET(): Promise<NextResponse> {
  const todayMsk = getMskTodayDate()
  const yesterday = new Date(todayMsk.getTime() - 24 * 3600_000)
  const sevenDaysAgo = new Date(todayMsk.getTime() - 7 * 24 * 3600_000)

  // 1) Vacuum-nmIds (active products only)
  const articles = await prisma.marketplaceArticle.findMany({
    where: {
      marketplace: { slug: "wb" },
      product: { deletedAt: null, subcategoryId: SUBCAT_ID },
    },
    select: { article: true },
  })
  const vacuumNmIds = articles
    .map((a) => parseInt(a.article, 10))
    .filter((n) => !Number.isNaN(n))

  // 2) Active targets advertId-ов для Vacuum
  const targetsVacuum = await prisma.wbAdvertTarget.findMany({
    where: { nmId: { in: vacuumNmIds }, active: true },
    select: { advertId: true },
  })
  const vacuumAdvertIds = Array.from(new Set(targetsVacuum.map((t) => t.advertId)))

  // 3) /ads/wb метод: SUM(updSum) WHERE advertId IN vacuumAdvertIds
  type SpendRow = { day: Date; spend: number }
  const adsWbSpend7d = vacuumAdvertIds.length > 0
    ? await prisma.$queryRaw<SpendRow[]>`
      SELECT DATE_TRUNC('day', "effectiveDate")::date AS day, SUM("updSum")::float AS spend
      FROM "WbAdvertSpendRow"
      WHERE "advertId" IN (${Prisma.join(vacuumAdvertIds)})
        AND "effectiveDate" >= ${sevenDaysAgo}
        AND "effectiveDate" < ${todayMsk}
      GROUP BY day
      ORDER BY day
    ` : []

  // 4) Per-(nmId, day) revenue для Vacuum
  const funnelRows = await prisma.wbCardFunnelDaily.findMany({
    where: { nmId: { in: vacuumNmIds }, date: { gte: sevenDaysAgo, lt: todayMsk } },
    select: { nmId: true, date: true, ordersSumRub: true },
  })

  // 5) Buyout resolver — 2 варианта: /ads/wb с фильтром (только Vacuum) и /prices/wb (все linked)
  const wbMp = await prisma.marketplace.findFirst({ where: { slug: "wb" } })
  const linkedArticles = await prisma.marketplaceArticle.findMany({
    where: { marketplaceId: wbMp!.id, product: { deletedAt: null } },
    select: { article: true },
  })
  const linkedNmIds = linkedArticles.map((a) => parseInt(a.article, 10)).filter((n) => !Number.isNaN(n))

  const resolverAdsWb = await loadBuyoutPctRolling30dMap(sevenDaysAgo, todayMsk, vacuumNmIds)
  const resolverPricesWb = await loadBuyoutPctRolling30dMap(sevenDaysAgo, todayMsk, linkedNmIds)

  // 6) RevAdj по двум резолверам (для подкатегории Vacuum — должны быть очень близки)
  const dayKeys: string[] = []
  for (let i = 7; i >= 1; i--) {
    dayKeys.push(dateKey(new Date(todayMsk.getTime() - i * 24 * 3600_000)))
  }
  const yKey = dateKey(yesterday)

  let revAdjAds7d = 0, revAdjAdsY = 0
  let revAdjPr7d = 0, revAdjPrY = 0
  for (const r of funnelRows) {
    const dKey = dateKey(r.date)
    const pctA = resolverAdsWb.resolve(r.nmId, dKey)
    const pctP = resolverPricesWb.resolve(r.nmId, dKey)
    if (dayKeys.includes(dKey)) {
      revAdjAds7d += r.ordersSumRub * (pctA / 100)
      revAdjPr7d += r.ordersSumRub * (pctP / 100)
    }
    if (dKey === yKey) {
      revAdjAdsY += r.ordersSumRub * (pctA / 100)
      revAdjPrY += r.ordersSumRub * (pctP / 100)
    }
  }

  // 7) /ads/wb spend totals
  const adsWbSpendByDay = new Map<string, number>()
  for (const r of adsWbSpend7d) adsWbSpendByDay.set(dateKey(r.day), r.spend)
  let adsWbSpend7dTotal = 0, adsWbSpendYTotal = 0
  for (const dKey of dayKeys) adsWbSpend7dTotal += adsWbSpendByDay.get(dKey) ?? 0
  adsWbSpendYTotal = adsWbSpendByDay.get(yKey) ?? 0

  // 8) /prices/wb легенда — используем loadLegendMetrics напрямую
  const nmIdToSubcategoryId = new Map<number, string | null>()
  const nmIdToCategoryId = new Map<number, string | null>()
  const linkedArticles2 = await prisma.marketplaceArticle.findMany({
    where: { marketplaceId: wbMp!.id, product: { deletedAt: null } },
    select: { article: true, product: { select: { subcategoryId: true, categoryId: true } } },
  })
  for (const a of linkedArticles2) {
    const n = parseInt(a.article, 10)
    if (Number.isNaN(n)) continue
    nmIdToSubcategoryId.set(n, a.product.subcategoryId ?? null)
    nmIdToCategoryId.set(n, a.product.categoryId ?? null)
  }
  const legend = await loadLegendMetrics(linkedNmIds, nmIdToSubcategoryId, nmIdToCategoryId, todayMsk)
  const subMetric = legend.perSubcategoryId.get(SUBCAT_ID)

  return NextResponse.json({
    SUBCAT_ID,
    vacuumNmIds_count: vacuumNmIds.length,
    vacuumNmIds,
    vacuumAdvertIds_count: vacuumAdvertIds.length,
    "/ads/wb method": {
      spend_yesterday: Math.round(adsWbSpendYTotal),
      spend_7d: Math.round(adsWbSpend7dTotal),
      revAdj_yesterday: Math.round(revAdjAdsY),
      revAdj_7d: Math.round(revAdjAds7d),
      DRR_yesterday: revAdjAdsY > 0 ? +(adsWbSpendYTotal / revAdjAdsY * 100).toFixed(2) : null,
      DRR_7d: revAdjAds7d > 0 ? +(adsWbSpend7dTotal / revAdjAds7d * 100).toFixed(2) : null,
    },
    "/prices/wb legend method (proportional split)": {
      DRR_yesterday: subMetric?.drrYesterday != null ? +subMetric.drrYesterday.toFixed(2) : null,
      DRR_7d: subMetric?.drr7d != null ? +subMetric.drr7d.toFixed(2) : null,
    },
    "/prices/wb manual aggregate (vacuum scope only)": {
      revAdj_yesterday: Math.round(revAdjPrY),
      revAdj_7d: Math.round(revAdjPr7d),
    },
    note: "Если DRR_yesterday отличается, источник spend разный. Если revAdj отличается между двумя резолверами — fallback расхождения.",
  })
}
