// Phase 19+ 2026-05-22: метрики per-nmId для legend в expand-панели /prices/wb.
//
// v2 (2026-05-22): переписано чтобы числа совпадали с /ads/wb. Источники:
//   spend  = WbAdvertSpendRow.updSum (ground truth) фильтруется по advertIds,
//            targeting nmId через WbAdvertTarget. ВАЖНО: если один advertId
//            таргетит несколько nmId, его spend полностью атрибутируется каждому
//            из них (overcount на per-nmId уровне). Это сознательно — пользователь
//            видит «во сколько обходится этот товар, учитывая кампании в которых
//            он участвует». Для per-subcategory/category агрегации advertIds
//            дедуплицируются через Set, overcount устраняется.
//
//   revenue_adj = SUM_per_(nmId,day)( ordersSumRub × buyout_rolling30d / 100 )
//   buyout_rolling30d = loadBuyoutPctRolling30dMap (та же функция что в /ads/wb)
//
//   ДРР = spend / revenue_adj × 100
//
// «% выкупа» в легенде — отдельный расчёт: per-nmId rolling 30d weighted ENDING
// YESTERDAY. Без fallback'ов на global/hardcoded — если для nmId нет funnel-данных
// за 30д → null (UI покажет «—»). Прежний raw daily давал шум 0/100 на низких
// объёмах.

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
  //   7 дней  = [today - 7d, today)  — 7 ПОЛНЫХ прошедших дней, согласовано с /ads/wb
  //   30 дней = [today - 30d, today) — для «% выкупа» weighted
  const yesterday = new Date(todayMsk.getTime() - 24 * 3600_000)
  const sevenDaysAgo = new Date(todayMsk.getTime() - 7 * 24 * 3600_000)
  const thirtyDaysAgo = new Date(todayMsk.getTime() - 30 * 24 * 3600_000)
  const yesterdayKey = dateKey(yesterday)

  // ── 1. WbAdvertTarget: nmId → Set<advertId>, и весь union advertIds для spend
  const targets = await prisma.wbAdvertTarget.findMany({
    where: { nmId: { in: scopeNmIds } },
    select: { nmId: true, advertId: true },
  })
  const advertIdsByNmId = new Map<number, Set<number>>()
  const allAdvertIds = new Set<number>()
  for (const t of targets) {
    if (t.nmId < 0) continue // sentinel -1
    let s = advertIdsByNmId.get(t.nmId)
    if (!s) {
      s = new Set()
      advertIdsByNmId.set(t.nmId, s)
    }
    s.add(t.advertId)
    allAdvertIds.add(t.advertId)
  }

  // ── 2. spend per (advertId, day) для окна 7д
  type SpendRow = { advertId: number; day: Date; spend: number }
  const spendRows: SpendRow[] =
    allAdvertIds.size > 0
      ? await prisma.$queryRaw<SpendRow[]>`
        SELECT
          "advertId",
          DATE_TRUNC('day', "effectiveDate")::date AS day,
          SUM("updSum")::float AS spend
        FROM "WbAdvertSpendRow"
        WHERE "advertId" IN (${Prisma.join([...allAdvertIds])})
          AND "effectiveDate" >= ${sevenDaysAgo}
          AND "effectiveDate" < ${todayMsk}
        GROUP BY "advertId", day
      `
      : []
  const spendByAdvertDay = new Map<string, number>()
  for (const r of spendRows) {
    spendByAdvertDay.set(`${r.advertId}_${dateKey(r.day)}`, r.spend)
  }

  // ── 3. Buyout resolver — та же логика, что в /ads/wb (rolling 30d weighted
  //    per-nmId с fallback'ами per-date/global). Используется для DRR-revenue.
  const buyoutResolver = await loadBuyoutPctRolling30dMap(
    sevenDaysAgo,
    todayMsk,
    scopeNmIds,
  )

  // ── 4. funnel revenue per (nmId, day) → пересчитываем в revenueAdj через resolver
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
    const adj = r.ordersSumRub * (pct / 100)
    revenueAdjByNmDay.set(`${r.nmId}_${dKey}`, adj)
  }

  // ── 5. «% выкупа» display — per-nmId rolling 30d weighted, без fallback'ов
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

  // ── 6. Универсальный агрегатор: spend (с dedup advertIds) + revenueAdj
  const sevenDayKeys: string[] = []
  for (let i = 7; i >= 1; i--) {
    sevenDayKeys.push(dateKey(new Date(todayMsk.getTime() - i * 24 * 3600_000)))
  }
  const yesterdayKeys = [yesterdayKey]

  function aggregate(nmIds: Iterable<number>, dayKeys: string[]) {
    const advIds = new Set<number>()
    for (const nmId of nmIds) {
      const s = advertIdsByNmId.get(nmId)
      if (s) for (const id of s) advIds.add(id)
    }
    let spend = 0
    for (const advId of advIds) {
      for (const dKey of dayKeys) {
        spend += spendByAdvertDay.get(`${advId}_${dKey}`) ?? 0
      }
    }
    let revAdj = 0
    for (const nmId of nmIds) {
      for (const dKey of dayKeys) {
        revAdj += revenueAdjByNmDay.get(`${nmId}_${dKey}`) ?? 0
      }
    }
    const drr = revAdj > 0 ? (spend / revAdj) * 100 : null
    return { spend, revAdj, drr }
  }

  // ── 7. per-nmId
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

  // ── 8. per-subcategory / per-category — группируем nmIds, агрегируем
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
