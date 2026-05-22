// Phase 19+ 2026-05-20: data helpers для UI визуализации spend из /adv/v1/upd.
// Все запросы — pure server-side, results возвращаются в plain shapes для RSC.
//
// 2026-05-21 (v2): процент выкупа применяется per-(nmId, day) как взвешенное
// среднее rolling 30d. Раньше брался один pct per nmId за всё окно — в сезон
// одежды текущий выкуп выше старого, поэтому натягивать одно среднее на все
// дни периода искажало выручку (старые дни завышались, свежие занижались).
// Теперь для каждого (nmId, date) считаем взвешенный buyoutPercent по окну
// [date-30d ; date] из WbCardFunnelDaily, и применяем его к ordersSumRub
// именно этого дня.
//
// 2026-05-22 (v3): добавлен промежуточный уровень fallback — latest per-nmId
// rolling 30d ≤ dKey. Раньше для свежего дня, где WB ещё не закрыл funnel и
// у нашего nmId buyoutPercent IS NULL, resolver падал сразу на byDate global,
// который смешивает high-buyout (бытовая техника) и low-buyout (одежда) →
// глобальный 45%, заниженный для high-buyout продуктов в 2×. Теперь сначала
// пытаемся latest known weighted для этого же nmId (вчерашняя цифра nmId 88%
// много правдоподобнее, чем сегодняшний глобальный 45%).
//
// 2026-05-22 (v4): добавлен subcategory-aware fallback ДО byDate-global. Для
// nmId без funnel-истории вообще (level 1+2 promax) — раньше падали на byDate-
// global, который зависит от scope (filter.nmIds): /ads/wb с фильтром Vacuum
// получает scope-средний ~88%, /prices/wb легенда с widescope linkedNmIds —
// смешанный ~45%. Это давало хвостовое расхождение DRR 1-2 пункта между двумя
// страницами. Теперь level 3 = bySubDate (rolling 30d weighted среди nmId
// той же подкатегории) → даёт subcategory-specific buyout независимо от scope.
// Mapping nmId→subcategoryId автоподтягивается из MarketplaceArticle+Product.
//
// Итоговая fallback цепочка:
//   1) per-(nmId,dKey) → 2) latest per-nmId ≤ dKey →
//   3) per-(subcatId,dKey) → 4) latest per-subcatId ≤ dKey →
//   5) per-date global → 6) final global → 7) 90% hard fallback.

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

/** Rolling 30d weighted buyout% per (nmId, date) + latest-per-nmId + per-(subcat,date) + per-date global + final global.
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
 *    1) per-(nmId, date) — основной источник (CTE требует buyoutPercent IS NOT NULL,
 *       поэтому свежий день с незакрытым funnel'ом сюда не попадает)
 *    2) latest perNmId weighted ≤ date — для свежих дней с null buyoutPercent.
 *       Сохраняет ID-специфику: high-buyout продукт (бытовая техника ~88%)
 *       продолжает получать своё значение, не падая на mixed-glob ~45%
 *    3) per-(subcatId, date) rolling 30d — для nmId без funnel-истории вообще.
 *       Раньше падали сразу на byDate-global, scope-зависимый (Vacuum-only scope
 *       давал ~88%, all-linked scope — mixed ~45%, отсюда хвостовая расхождение
 *       между /ads/wb и /prices/wb легендой). Subcategory-уровень scope-независим.
 *    4) latest per-subcatId ≤ date — для свежих дней где у самой подкатегории
 *       нет buyout-данных (редкий edge case)
 *    5) per-date global rolling 30d — финальный fallback по дате
 *    6) finalGlobal — взвешенное среднее по всему [from-30d ; to) окну
 *    7) 90% — hard fallback, только если БД совсем пустая
 *
 *  @param from начало отчётного окна (включительно, UTC midnight)
 *  @param to конец отчётного окна (exclusive, UTC midnight)
 *  @param nmIdsFilter ограничить выборку перечисленными nmId. Если undefined —
 *    берётся весь funnel. Это влияет ТОЛЬКО на byDate-global (level 5); все
 *    остальные уровни scope-независимы.
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
  // sortedByNm[nmId] = массив [dateKey, weighted], отсортированный по dateKey ASC.
  // Нужен для fallback «latest per-nmId weighted ≤ dKey» — для свежего дня
  // у которого buyoutPercent ещё null (WB не закрыл день) ID-specific цифра
  // сохраняется через предыдущий день.
  const sortedByNm = new Map<number, Array<[string, number]>>()
  for (const r of perNmDate) {
    if (r.weighted != null && r.weighted > 0) {
      const dKey = dateKey(r.date)
      byNmDate.set(`${r.nmId}_${dKey}`, r.weighted)
      let arr = sortedByNm.get(r.nmId)
      if (!arr) {
        arr = []
        sortedByNm.set(r.nmId, arr)
      }
      arr.push([dKey, r.weighted])
    }
  }
  for (const arr of sortedByNm.values()) {
    arr.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  }
  const byDate = new Map<string, number>()
  for (const r of perDate) {
    if (r.weighted != null && r.weighted > 0) {
      byDate.set(dateKey(r.date), r.weighted)
    }
  }
  const finalGlobal = finalGlobalRow[0]?.weighted ?? 90

  // ── Per-(subcatId, date) rolling 30d weighted ──
  // Подтягиваем nmId→subcategoryId mapping из БД (через MarketplaceArticle JOIN
  // Product). Это делает resolver самодостаточным — callers не обязаны передавать
  // mapping вручную. Фильтруем по nmIdsFilter если задан (соответствие со scope
  // per-nmId), иначе берём все WB-linked nmId.
  const nmIdSubArticles = await prisma.marketplaceArticle.findMany({
    where: {
      marketplace: { slug: "wb" },
      product: { deletedAt: null },
      ...(nmIdsFilter && nmIdsFilter.length > 0
        ? { article: { in: nmIdsFilter.map(String) } }
        : {}),
    },
    select: { article: true, product: { select: { subcategoryId: true } } },
  })
  const nmIdToSubcatId = new Map<number, string>()
  for (const a of nmIdSubArticles) {
    const n = parseInt(a.article, 10)
    if (Number.isNaN(n)) continue
    if (a.product.subcategoryId) nmIdToSubcatId.set(n, a.product.subcategoryId)
  }

  // SQL: per-(subId, date) rolling 30d weighted из funnel rows JOIN nmId→subId.
  // VALUES CTE с парами передаётся через Prisma.join. Если пар нет (например
  // вообще нет WB-linked products) — skip query.
  const bySubDate = new Map<string, number>()
  const sortedBySub = new Map<string, Array<[string, number]>>()
  if (nmIdToSubcatId.size > 0) {
    const pairs: Array<[number, string]> = []
    for (const [nm, sub] of nmIdToSubcatId) pairs.push([nm, sub])
    const valuesSql = Prisma.join(
      pairs.map(
        ([nm, sub]) => Prisma.sql`(${nm}::bigint, ${sub}::text)`,
      ),
    )
    const perSubDate = await prisma.$queryRaw<
      Array<{ subId: string; date: Date; weighted: number | null }>
    >`
      WITH map("nmId", "subId") AS (VALUES ${valuesSql}),
      base AS (
        SELECT m."subId", f."date", f."buyoutPercent", f."ordersCount"
        FROM "WbCardFunnelDaily" f
        JOIN map m ON m."nmId" = f."nmId"
        WHERE f."date" >= ${lookbackFrom} AND f."date" < ${to}
          AND f."buyoutPercent" IS NOT NULL
          AND f."ordersCount" > 0
      ),
      daily AS (
        SELECT "subId", "date",
          SUM("buyoutPercent" * "ordersCount") AS num,
          SUM("ordersCount") AS den
        FROM base
        GROUP BY "subId", "date"
      )
      SELECT "subId", "date",
        (
          SUM(num) OVER (
            PARTITION BY "subId" ORDER BY "date"
            RANGE BETWEEN INTERVAL '29 days' PRECEDING AND CURRENT ROW
          )
          / NULLIF(
              SUM(den) OVER (
                PARTITION BY "subId" ORDER BY "date"
                RANGE BETWEEN INTERVAL '29 days' PRECEDING AND CURRENT ROW
              ), 0
            )
        )::float AS weighted
      FROM daily
      WHERE "date" >= ${from}
    `
    for (const r of perSubDate) {
      if (r.weighted != null && r.weighted > 0) {
        const dKey = dateKey(r.date)
        bySubDate.set(`${r.subId}|${dKey}`, r.weighted)
        let arr = sortedBySub.get(r.subId)
        if (!arr) {
          arr = []
          sortedBySub.set(r.subId, arr)
        }
        arr.push([dKey, r.weighted])
      }
    }
    for (const arr of sortedBySub.values()) {
      arr.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    }
  }

  function binarySearchLE(
    arr: Array<[string, number]>,
    dKey: string,
  ): number | undefined {
    if (arr.length === 0) return undefined
    let lo = 0
    let hi = arr.length - 1
    let found = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (arr[mid][0] <= dKey) {
        found = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    return found >= 0 ? arr[found][1] : undefined
  }

  function latestForNm(nmId: number, dKey: string): number | undefined {
    const arr = sortedByNm.get(nmId)
    if (!arr) return undefined
    return binarySearchLE(arr, dKey)
  }

  function latestForSub(subId: string, dKey: string): number | undefined {
    const arr = sortedBySub.get(subId)
    if (!arr) return undefined
    return binarySearchLE(arr, dKey)
  }

  return {
    resolve(nmId: number, dKey: string): number {
      const direct = byNmDate.get(`${nmId}_${dKey}`)
      if (direct != null) return direct
      const latestNm = latestForNm(nmId, dKey)
      if (latestNm != null) return latestNm
      const subId = nmIdToSubcatId.get(nmId)
      if (subId) {
        const subDay = bySubDate.get(`${subId}|${dKey}`)
        if (subDay != null) return subDay
        const latestSub = latestForSub(subId, dKey)
        if (latestSub != null) return latestSub
      }
      return byDate.get(dKey) ?? finalGlobal
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
