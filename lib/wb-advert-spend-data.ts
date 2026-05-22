// Phase 19+ 2026-05-20: data helpers для UI визуализации spend из /adv/v1/upd.
// Все запросы — pure server-side, results возвращаются в plain shapes для RSC.
//
// 2026-05-21 (v2): процент выкупа применяется per-(nmId, day) как взвешенное
// среднее rolling 30d. Раньше брался один pct per nmId за всё окно — в сезон
// одежды текущий выкуп выше старого, поэтому натягивать одно среднее на все
// дни периода искажало выручку (старые дни завышались, свежие занижались).
// Теперь для каждого (nmId, date) считаем взвешенный buyoutPercent по окну
// [date-30d ; date] из WbCardFunnelDaily, и применяем его к ordersSumRub
// именно этого дня. Двойной fallback chain: per-(nmId,date) → per-date global
// (rolling 30d) → final global (всё окно).

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

/** YYYY-MM-DD из Date (UTC). Используется как ключ Map'ов. */
function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Резолвер выкупа per-(nmId, day). Возвращает % с гарантированным fallback'ом. */
export interface BuyoutResolver {
  resolve(nmId: number, dateKey: string): number
}

/** Rolling 30d weighted buyout% per (nmId, date) + per-date global + final global.
 *
 *  Берём WbCardFunnelDaily.buyoutPercent (что показано в кабинете WB
 *  «Аналитика → По дням» за конкретный день), но к ordersSumRub дня применяем
 *  не сам raw per-day процент (шумно при малых объёмах: 1 заказ → 0% или 100%),
 *  а взвешенное среднее за окно [date-30d ; date] для данного nmId. Это даёт:
 *   • устойчивость к шуму малых выборок,
 *   • реакцию на сезонные сдвиги (в сезон одежды свежее окно отражает рост выкупа),
 *   • независимость от единого «среднемесячного» pct, который раньше натягивался
 *     на весь 28-дневный период отчёта.
 *
 *  Fallback chain в resolve():
 *    1) per-(nmId, date) — основной источник
 *    2) per-date global rolling 30d — для (nmId, date) у которых нет funnel-данных
 *       в окне (например, новый артикул)
 *    3) finalGlobal — взвешенное среднее по всему [from-30d ; to) окну (для дней
 *       у которых вообще не оказалось funnel-данных в БД)
 *    4) 90% — hard fallback, только если БД совсем пустая
 *
 *  @param from начало отчётного окна (включительно, UTC midnight)
 *  @param to конец отчётного окна (exclusive, UTC midnight)
 *  @param nmIdsFilter ограничить выборку перечисленными nmId
 */
export async function loadBuyoutPctRolling30dMap(
  from: Date,
  to: Date,
  nmIdsFilter?: number[],
): Promise<BuyoutResolver> {
  // Чтобы для самой ранней даты окна было доступно «прошлое 30 дней»,
  // расширяем загрузку на 30 дней назад.
  const lookbackFrom = new Date(from.getTime() - 30 * 24 * 3600_000)
  const nmFilterSql =
    nmIdsFilter && nmIdsFilter.length > 0
      ? Prisma.sql`AND "nmId" IN (${Prisma.join(nmIdsFilter)})`
      : Prisma.sql``

  // 1) Per-(nmId, date) rolling 30d weighted. Window function поверх
  // отфильтрованной выборки (только строки с buyoutPercent IS NOT NULL и
  // ordersCount > 0 — иначе в weighting нет смысла).
  // RANGE BETWEEN INTERVAL '29 days' PRECEDING AND CURRENT ROW = 30 календарных
  // дней включая текущий, устойчиво к пропускам строк.
  // 2) Per-date global rolling 30d — для fallback по дате (когда у nmId нет
  // данных в окне). Считаем через CTE: daily totals → rolling sum через window.
  // 3) Final global — одно число по всему [lookbackFrom; to) окну.
  const [perNmDate, perDate, finalGlobalRow] = await Promise.all([
    prisma.$queryRaw<Array<{ nmId: number; date: Date; weighted: number | null }>>`
      WITH base AS (
        SELECT "nmId", "date", "buyoutPercent", "ordersCount"
        FROM "WbCardFunnelDaily"
        WHERE "date" >= ${lookbackFrom} AND "date" < ${to}
          AND "buyoutPercent" IS NOT NULL
          AND "ordersCount" > 0
          ${nmFilterSql}
      )
      SELECT "nmId", "date",
        (
          SUM("buyoutPercent" * "ordersCount") OVER (
            PARTITION BY "nmId" ORDER BY "date"
            RANGE BETWEEN INTERVAL '29 days' PRECEDING AND CURRENT ROW
          )
          / NULLIF(
              SUM("ordersCount") OVER (
                PARTITION BY "nmId" ORDER BY "date"
                RANGE BETWEEN INTERVAL '29 days' PRECEDING AND CURRENT ROW
              ), 0
            )
        )::float AS weighted
      FROM base
      WHERE "date" >= ${from}
    `,
    prisma.$queryRaw<Array<{ date: Date; weighted: number | null }>>`
      WITH base AS (
        SELECT "date", "buyoutPercent", "ordersCount"
        FROM "WbCardFunnelDaily"
        WHERE "date" >= ${lookbackFrom} AND "date" < ${to}
          AND "buyoutPercent" IS NOT NULL
          AND "ordersCount" > 0
          ${nmFilterSql}
      ),
      daily AS (
        SELECT "date",
          SUM("buyoutPercent" * "ordersCount") AS num,
          SUM("ordersCount") AS den
        FROM base
        GROUP BY "date"
      )
      SELECT "date",
        (
          SUM(num) OVER (
            ORDER BY "date"
            RANGE BETWEEN INTERVAL '29 days' PRECEDING AND CURRENT ROW
          )
          / NULLIF(
              SUM(den) OVER (
                ORDER BY "date"
                RANGE BETWEEN INTERVAL '29 days' PRECEDING AND CURRENT ROW
              ), 0
            )
        )::float AS weighted
      FROM daily
      WHERE "date" >= ${from}
    `,
    prisma.$queryRaw<Array<{ weighted: number | null }>>`
      SELECT
        (SUM("buyoutPercent" * "ordersCount") / NULLIF(SUM("ordersCount"), 0))::float AS weighted
      FROM "WbCardFunnelDaily"
      WHERE "date" >= ${lookbackFrom} AND "date" < ${to}
        AND "buyoutPercent" IS NOT NULL
        AND "ordersCount" > 0
        ${nmFilterSql}
    `,
  ])

  const byNmDate = new Map<string, number>()
  for (const r of perNmDate) {
    if (r.weighted != null && r.weighted > 0) {
      byNmDate.set(`${r.nmId}_${dateKey(r.date)}`, r.weighted)
    }
  }
  const byDate = new Map<string, number>()
  for (const r of perDate) {
    if (r.weighted != null && r.weighted > 0) {
      byDate.set(dateKey(r.date), r.weighted)
    }
  }
  const finalGlobal = finalGlobalRow[0]?.weighted ?? 90

  return {
    resolve(nmId: number, dKey: string): number {
      return byNmDate.get(`${nmId}_${dKey}`) ?? byDate.get(dKey) ?? finalGlobal
    },
  }
}

/** Daily spend + revenue + DRR chart data за период.
 *  Spend из WbAdvertSpendRow (по effectiveDate).
 *  Revenue (оборот) — SUM(WbCardFunnelDaily.ordersSumRub).
 *  RevenueAdjusted — Σ_per_(nmId,day)(ordersSumRub × buyoutPct/100), где
 *  buyoutPct — rolling 30d weighted на день этой строки funnel (см.
 *  loadBuyoutPctRolling30dMap). Это устраняет искажение в сезон: свежие дни
 *  получают свежее окно выкупа.
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

  const buyout = await loadBuyoutPctRolling30dMap(from, to, filter?.nmIds)

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

  // Per-day агрегация: revenue (оборот) + revenueAdjusted (с rolling-30d
  // выкупом, посчитанным на дату каждой строки funnel — а не одной константой
  // на весь период).
  type DayAgg = { revenue: number; revenueAdjusted: number }
  const aggByDate = new Map<string, DayAgg>()
  for (const r of revenueRows) {
    const key = dateKey(r.date)
    const buyoutPct = buyout.resolve(r.nmId, key)
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
 *  Выкуп применяется per-(nmId, day) как rolling 30d weighted из
 *  WbCardFunnelDaily.buyoutPercent (см. loadBuyoutPctRolling30dMap). Сезонные
 *  сдвиги выкупа теперь отражаются — старые дни не «подтягивают» свежие. */
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

  const buyout = await loadBuyoutPctRolling30dMap(from, to, filter?.nmIds)

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
    // Per-(nmId, date) агрегация оборота: pct выкупа варьируется по дням,
    // поэтому суммирование per-nmId за весь период неверно — надо применять
    // pct к каждому дню отдельно.
    prisma.wbCardFunnelDaily.groupBy({
      by: ["nmId", "date"],
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
    const buyoutPct = buyout.resolve(r.nmId, dateKey(r.date))
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
