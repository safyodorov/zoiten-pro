// Phase 19+ 2026-05-22: метрики per-nmId для legend в expand-панели /prices/wb.
//
// v3 (2026-05-22): пропорциональная атрибуция spend per nmId.
//
// Раньше (v2) делал SUM(WbAdvertSpendRow.updSum WHERE advertId IN targets(nmId))
// — это сильно overcount'ит per-nmId, если один advertId таргетит несколько nmId
// (его ВЕСЬ spend атрибутировался КАЖДОМУ). Пример: advertId 35135014 таргетит
// 7 nmId, его 5000₽/день добавлялись к каждому из 7 → суммарно 35000₽ вместо 5000.
//
// Теперь: для каждого (advertId, day) ground truth (WbAdvertSpendRow.updSum)
// делится между nmId пропорционально WbAdvertStatDaily.sum. Fallback на равное
// деление, если у advertId нет stats данных (новая кампания / пробелы /fullstats).
// Суммы сохраняются: SUM_по_всем_nmId attributed_spend ≡ ground truth.
//
// revenue_adj per (nmId, day) = ordersSumRub × rolling30dWeightedBuyout / 100
// — та же формула, что использует /ads/wb (loadBuyoutPctRolling30dMap).
//
// «% выкупа» в легенде — отдельный per-nmId rolling 30d weighted ending yesterday
// без fallback'ов (null если для nmId нет funnel-данных).

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { loadBuyoutPctRolling30dMap } from "@/lib/wb-advert-spend-data"

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

export async function loadLegendMetrics(
  scopeNmIds: number[],
  nmIdToSubcategoryId: Map<number, string | null>,
  nmIdToCategoryId: Map<number, string | null>,
  todayMsk: Date,
): Promise<LegendMetrics> {
  if (scopeNmIds.length === 0) return EMPTY_METRICS

  // Окна:
  //   вчера   = [today - 1d, today)
  //   7 дней  = [today - 7d, today)  — 7 ПОЛНЫХ прошедших дней
  //   30 дней = [today - 30d, today) — для «% выкупа» weighted
  const yesterday = new Date(todayMsk.getTime() - 24 * 3600_000)
  const sevenDaysAgo = new Date(todayMsk.getTime() - 7 * 24 * 3600_000)
  const thirtyDaysAgo = new Date(todayMsk.getTime() - 30 * 24 * 3600_000)

  // ── 1. WbAdvertTarget: nmId → Set<advertId> для scope + ВСЕ targets каждого
  //    advertId (включая nmId вне scope) — нужны для equal-split fallback.
  //    Фильтр active=true — кампания таргетит nmId в кабинете СЕЙЧАС (cron
  //    wb-adv-targets-backfill ведёт это поле). Inactive — историческое.
  const scopeTargets = await prisma.wbAdvertTarget.findMany({
    where: { nmId: { in: scopeNmIds }, active: true },
    select: { nmId: true, advertId: true },
  })
  const allAdvertIds = new Set<number>()
  for (const t of scopeTargets) {
    if (t.nmId < 0) continue // sentinel (-1, active=false по схеме, но защитимся)
    allAdvertIds.add(t.advertId)
  }
  const allAdvertIdsArr = [...allAdvertIds]

  // Все active targets для этих advertIds — для fallback equal-split.
  const allTargets =
    allAdvertIdsArr.length > 0
      ? await prisma.wbAdvertTarget.findMany({
          where: { advertId: { in: allAdvertIdsArr }, active: true },
          select: { advertId: true, nmId: true },
        })
      : []
  const targetsByAdvertId = new Map<number, Set<number>>()
  for (const t of allTargets) {
    if (t.nmId < 0) continue
    let s = targetsByAdvertId.get(t.advertId)
    if (!s) {
      s = new Set()
      targetsByAdvertId.set(t.advertId, s)
    }
    s.add(t.nmId)
  }

  // Set scopeNmIds для быстрой проверки членства
  const scopeSet = new Set(scopeNmIds)

  // ── 2. Ground-truth spend per (advertId, day) для окна 7д
  type SpendRow = { advertId: number; day: Date; spend: number }
  const spendRows: SpendRow[] =
    allAdvertIdsArr.length > 0
      ? await prisma.$queryRaw<SpendRow[]>`
        SELECT
          "advertId",
          DATE_TRUNC('day', "effectiveDate")::date AS day,
          SUM("updSum")::float AS spend
        FROM "WbAdvertSpendRow"
        WHERE "advertId" IN (${Prisma.join(allAdvertIdsArr)})
          AND "effectiveDate" >= ${sevenDaysAgo}
          AND "effectiveDate" < ${todayMsk}
        GROUP BY "advertId", day
      `
      : []

  // ── 3. WbAdvertStatDaily per (advertId, day, nmId) — для пропорционального split
  type StatsRow = { advertId: number; day: Date; nmId: number; statsSum: number }
  const statsRows: StatsRow[] =
    allAdvertIdsArr.length > 0
      ? await prisma.$queryRaw<StatsRow[]>`
        SELECT
          "advertId",
          "date"::date AS day,
          "nmId",
          SUM("sum")::float AS "statsSum"
        FROM "WbAdvertStatDaily"
        WHERE "advertId" IN (${Prisma.join(allAdvertIdsArr)})
          AND "date" >= ${sevenDaysAgo}
          AND "date" < ${todayMsk}
        GROUP BY "advertId", day, "nmId"
      `
      : []

  // Map (advertId, day) → Map<nmId, statsSum> + total
  const statsByAdvertDay = new Map<string, Map<number, number>>()
  const statsTotalByAdvertDay = new Map<string, number>()
  for (const r of statsRows) {
    const k = `${r.advertId}_${dateKey(r.day)}`
    let m = statsByAdvertDay.get(k)
    if (!m) {
      m = new Map()
      statsByAdvertDay.set(k, m)
    }
    m.set(r.nmId, (m.get(r.nmId) ?? 0) + r.statsSum)
    statsTotalByAdvertDay.set(k, (statsTotalByAdvertDay.get(k) ?? 0) + r.statsSum)
  }

  // ── 4. Пропорциональная атрибуция: spendByNmDay[nmId, dayKey]
  const spendByNmDay = new Map<string, number>()
  const addSpend = (nmId: number, dKey: string, amount: number) => {
    if (!scopeSet.has(nmId)) return // outside scope — теряем (correct attribution)
    const k = `${nmId}_${dKey}`
    spendByNmDay.set(k, (spendByNmDay.get(k) ?? 0) + amount)
  }
  for (const sr of spendRows) {
    if (sr.spend <= 0) continue
    const dKey = dateKey(sr.day)
    const advDayKey = `${sr.advertId}_${dKey}`
    const statsTotal = statsTotalByAdvertDay.get(advDayKey) ?? 0

    if (statsTotal > 0) {
      // Пропорциональный split по WbAdvertStatDaily.sum
      const perNmIdStats = statsByAdvertDay.get(advDayKey)!
      for (const [nmId, nmStats] of perNmIdStats) {
        const share = nmStats / statsTotal
        addSpend(nmId, dKey, sr.spend * share)
      }
    } else {
      // Fallback: равное деление между ВСЕМИ известными targets advertId
      const targets = targetsByAdvertId.get(sr.advertId)
      if (!targets || targets.size === 0) continue
      const perTarget = sr.spend / targets.size
      for (const nmId of targets) {
        addSpend(nmId, dKey, perTarget)
      }
    }
  }

  // ── 5. Buyout resolver — та же логика, что в /ads/wb
  const buyoutResolver = await loadBuyoutPctRolling30dMap(
    sevenDaysAgo,
    todayMsk,
    scopeNmIds,
  )

  // ── 6. funnel revenue per (nmId, day) → revenueAdj через resolver
  const funnelRows = await prisma.wbCardFunnelDaily.findMany({
    where: {
      nmId: { in: scopeNmIds },
      date: { gte: sevenDaysAgo, lt: todayMsk },
    },
    select: { nmId: true, date: true, ordersSumRub: true },
  })
  const revenueAdjByNmDay = new Map<string, number>()
  for (const r of funnelRows) {
    const dKey = dateKey(r.date)
    const pct = buyoutResolver.resolve(r.nmId, dKey)
    revenueAdjByNmDay.set(
      `${r.nmId}_${dKey}`,
      r.ordersSumRub * (pct / 100),
    )
  }

  // ── 7. «% выкупа» display — per-nmId 30d weighted ending yesterday, без fallback
  const buyout30dRows = await prisma.$queryRaw<
    Array<{ nmId: number; weighted: number | null }>
  >`
    SELECT
      "nmId",
      (SUM("buyoutPercent" * "ordersCount") / NULLIF(SUM("ordersCount"), 0))::float AS weighted
    FROM "WbCardFunnelDaily"
    WHERE "nmId" IN (${Prisma.join(scopeNmIds)})
      AND "date" >= ${thirtyDaysAgo}
      AND "date" < ${todayMsk}
      AND "buyoutPercent" IS NOT NULL
      AND "ordersCount" > 0
    GROUP BY "nmId"
  `
  const buyoutPctByNmId = new Map<number, number>()
  for (const r of buyout30dRows) {
    if (r.weighted != null && r.weighted > 0) {
      buyoutPctByNmId.set(r.nmId, r.weighted)
    }
  }

  // ── 8. Универсальный агрегатор
  const sevenDayKeys: string[] = []
  for (let i = 7; i >= 1; i--) {
    sevenDayKeys.push(dateKey(new Date(todayMsk.getTime() - i * 24 * 3600_000)))
  }
  const yesterdayKey = dateKey(yesterday)
  const yesterdayKeys = [yesterdayKey]

  function aggregate(nmIds: Iterable<number>, dayKeys: string[]) {
    let spend = 0
    let revAdj = 0
    for (const nmId of nmIds) {
      for (const dKey of dayKeys) {
        spend += spendByNmDay.get(`${nmId}_${dKey}`) ?? 0
        revAdj += revenueAdjByNmDay.get(`${nmId}_${dKey}`) ?? 0
      }
    }
    const drr = revAdj > 0 ? (spend / revAdj) * 100 : null
    return { spend, revAdj, drr }
  }

  // ── 9. per-nmId
  const perNmId = new Map<number, NmIdLegendMetrics>()
  for (const nmId of scopeNmIds) {
    const yest = aggregate([nmId], yesterdayKeys)
    const week = aggregate([nmId], sevenDayKeys)
    perNmId.set(nmId, {
      buyoutPct: buyoutPctByNmId.get(nmId) ?? null,
      drrYesterday: yest.drr,
      drr7d: week.drr,
    })
  }

  // ── 10. per-subcategory / per-category
  const nmIdsBySubId = new Map<string, Set<number>>()
  const nmIdsByCatId = new Map<string, Set<number>>()
  for (const nmId of scopeNmIds) {
    const subId = nmIdToSubcategoryId.get(nmId)
    if (subId) {
      let s = nmIdsBySubId.get(subId)
      if (!s) {
        s = new Set()
        nmIdsBySubId.set(subId, s)
      }
      s.add(nmId)
    }
    const catId = nmIdToCategoryId.get(nmId)
    if (catId) {
      let s = nmIdsByCatId.get(catId)
      if (!s) {
        s = new Set()
        nmIdsByCatId.set(catId, s)
      }
      s.add(nmId)
    }
  }

  const perSubcategoryId = new Map<string, GroupLegendMetrics>()
  for (const [subId, nmSet] of nmIdsBySubId) {
    const yest = aggregate(nmSet, yesterdayKeys)
    const week = aggregate(nmSet, sevenDayKeys)
    perSubcategoryId.set(subId, {
      drrYesterday: yest.drr,
      drr7d: week.drr,
    })
  }

  const perCategoryId = new Map<string, GroupLegendMetrics>()
  for (const [catId, nmSet] of nmIdsByCatId) {
    const yest = aggregate(nmSet, yesterdayKeys)
    const week = aggregate(nmSet, sevenDayKeys)
    perCategoryId.set(catId, {
      drrYesterday: yest.drr,
      drr7d: week.drr,
    })
  }

  return { perNmId, perSubcategoryId, perCategoryId }
}
