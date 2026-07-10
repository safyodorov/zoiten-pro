// lib/finance-weekly/plan-fact.ts
//
// План-факт понедельного WB фин-отчёта (/finance/weekly, W2c — §4.4 дизайн-спеки
// docs/superpowers/specs/2026-07-08-weekly-finreport-design.md).
//
// План — SalesPlanVersionDay АКТИВНОЙ версии плана продаж (AppSetting
// salesPlan.activeVersionId), поле planOrdersRub (семантика = оборот по заказам,
// та же, что факт WbCardFunnelDaily.ordersSumRub).
// Факт — WbCardFunnelDaily: неделя [weekStart..weekEnd] и месяц-to-date
// [monthStart..weekEnd].
//
// План хранится per productId, отчёт строится per nmId → distributePlanAcrossNmIds
// раскладывает план товара по его nmId пропорционально факту (pure, тестируется).
//
// Течёт ПАРАЛЛЕЛЬНО движку engine.ts — движок план-факта не знает и не тронут.
//
// Quick 260710-gem (W2c, 2026-07-10)

import { prisma } from "@/lib/prisma"

// ── Pure: распределение плана товара по nmId ───────────────────────────────────

/**
 * Раскладывает план товара (₽) по его nmId в отчёте.
 *
 * Правило (locked):
 *  - 1 nmId → весь план ему;
 *  - несколько → пропорционально фактам из factByNmId (доля = fact_i / Σfact,
 *    неокруглённые float — НИКАКОГО Math.round, display-округление делает UI);
 *  - Σfact === 0 → поровну (planTotal / nmIds.length).
 *  Отсутствующий в factByNmId nmId = факт 0.
 */
export function distributePlanAcrossNmIds(
  planTotal: number,
  nmIds: number[],
  factByNmId: ReadonlyMap<number, number>,
): Map<number, number> {
  const result = new Map<number, number>()
  if (nmIds.length === 0) return result

  if (nmIds.length === 1) {
    result.set(nmIds[0], planTotal)
    return result
  }

  let factSum = 0
  for (const nmId of nmIds) factSum += factByNmId.get(nmId) ?? 0

  if (factSum === 0) {
    const equal = planTotal / nmIds.length
    for (const nmId of nmIds) result.set(nmId, equal)
    return result
  }

  for (const nmId of nmIds) {
    const fact = factByNmId.get(nmId) ?? 0
    result.set(nmId, planTotal * (fact / factSum))
  }
  return result
}

// ── Loader ─────────────────────────────────────────────────────────────────────

export interface WeeklyPlanFact {
  /** false → активной версии плана продаж нет; UI скрывает KPI, колонки «—». */
  hasActivePlan: boolean
  /**
   * План недели per nmId. Запись есть ТОЛЬКО если у товара есть план в диапазоне
   * И хотя бы один nmId в отчёте; отсутствие ⇒ UI рендерит «—».
   * (Per-nmId месячное распределение НЕ строится — UI потребляет только
   * totals.planMonth; задел под per-row месячные колонки убран как неиспользуемый.)
   */
  planWeekByNmId: Map<number, number>
  /** МТД-оборот по заказам per nmId (WbCardFunnelDaily, [monthStart..weekEnd]). */
  factMonthByNmId: Map<number, number>
  totals: {
    planWeek: number
    factWeek: number
    planMonth: number
    factMonthMtd: number
  }
}

const EMPTY_PLAN_FACT: WeeklyPlanFact = {
  hasActivePlan: false,
  planWeekByNmId: new Map(),
  factMonthByNmId: new Map(),
  totals: { planWeek: 0, factWeek: 0, planMonth: 0, factMonthMtd: 0 },
}

/**
 * Загружает план-факт недели/месяца для /finance/weekly.
 *
 * @param weekStart UTC-понедельник 00:00:00Z (как в page.tsx)
 * @param weekEnd   weekStart + 6 дней (UTC-воскресенье)
 * @param articleNmIds    nmId строк отчёта (H > 0)
 * @param nmIdToProductId nmId → Product.id (из data.meta)
 *
 * ВАЖНО: totals.planWeek/planMonth = Σ плана по ВСЕМ товарам версии (без фильтра
 * по присутствию в отчёте) — план не занижается из-за товаров без заказов.
 * Поэтому итоговая строка таблицы (Σ per-nmId планов) может быть < KPI
 * «План недели» — это осознанно.
 */
export async function loadWeeklyPlanFact(
  weekStart: Date,
  weekEnd: Date,
  articleNmIds: number[],
  nmIdToProductId: Map<number, string>,
): Promise<WeeklyPlanFact> {
  // a. Активная версия плана продаж (паттерн app/actions/sales-plan.ts)
  const activeVersionSetting = await prisma.appSetting.findUnique({
    where: { key: "salesPlan.activeVersionId" },
  })
  const activeVersionId = activeVersionSetting?.value || null
  if (!activeVersionId) {
    return {
      ...EMPTY_PLAN_FACT,
      planWeekByNmId: new Map(),
      factMonthByNmId: new Map(),
    }
  }

  // b. Границы месяца (UTC) — календарный месяц, содержащий weekStart.
  // МТД-диапазон факта = [monthStart..weekEnd] БУКВАЛЬНО — даже если weekEnd
  // перетекает в следующий месяц (locked-семантика).
  const monthStart = new Date(
    Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), 1),
  )
  const monthEnd = new Date(
    Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth() + 1, 0),
  )

  // c. Четыре параллельных запроса (факт пропускается при пустом отчёте)
  const [planWeekRows, planMonthRows, factWeekRows, factMtdRows] = await Promise.all([
    prisma.salesPlanVersionDay.groupBy({
      by: ["productId"],
      where: { versionId: activeVersionId, date: { gte: weekStart, lte: weekEnd } },
      _sum: { planOrdersRub: true },
    }),
    prisma.salesPlanVersionDay.groupBy({
      by: ["productId"],
      where: { versionId: activeVersionId, date: { gte: monthStart, lte: monthEnd } },
      _sum: { planOrdersRub: true },
    }),
    articleNmIds.length > 0
      ? prisma.wbCardFunnelDaily.groupBy({
          by: ["nmId"],
          where: {
            nmId: { in: articleNmIds },
            date: { gte: weekStart, lte: weekEnd },
          },
          _sum: { ordersSumRub: true },
        })
      : Promise.resolve([]),
    articleNmIds.length > 0
      ? prisma.wbCardFunnelDaily.groupBy({
          by: ["nmId"],
          where: {
            nmId: { in: articleNmIds },
            date: { gte: monthStart, lte: weekEnd },
          },
          _sum: { ordersSumRub: true },
        })
      : Promise.resolve([]),
  ])

  // d. Totals: план — по ВСЕМ товарам версии; факт — по articleNmIds
  const planWeekByProductId = new Map<string, number>()
  let planWeekTotal = 0
  for (const r of planWeekRows) {
    const sum = r._sum.planOrdersRub ?? 0
    planWeekByProductId.set(r.productId, sum)
    planWeekTotal += sum
  }
  let planMonthTotal = 0
  for (const r of planMonthRows) planMonthTotal += r._sum.planOrdersRub ?? 0

  const factWeekByNmId = new Map<number, number>()
  let factWeekTotal = 0
  for (const r of factWeekRows) {
    const sum = r._sum.ordersSumRub ?? 0
    factWeekByNmId.set(r.nmId, sum)
    factWeekTotal += sum
  }
  const factMonthByNmId = new Map<number, number>()
  let factMtdTotal = 0
  for (const r of factMtdRows) {
    const sum = r._sum.ordersSumRub ?? 0
    factMonthByNmId.set(r.nmId, sum)
    factMtdTotal += sum
  }

  // e. Распределение план недели → nmId: обратная группировка productId → nmIds[],
  // веса — недельный факт per nmId. Товары плана без nmId в отчёте в per-row Map
  // не попадают (но входят в totals — п. d).
  const nmIdsByProductId = new Map<string, number[]>()
  for (const [nmId, productId] of nmIdToProductId) {
    const list = nmIdsByProductId.get(productId) ?? []
    list.push(nmId)
    nmIdsByProductId.set(productId, list)
  }

  const planWeekByNmId = new Map<number, number>()
  for (const [productId, planSum] of planWeekByProductId) {
    const nmIds = nmIdsByProductId.get(productId)
    if (!nmIds || nmIds.length === 0) continue
    const distributed = distributePlanAcrossNmIds(planSum, nmIds, factWeekByNmId)
    for (const [nmId, value] of distributed) planWeekByNmId.set(nmId, value)
  }

  return {
    hasActivePlan: true,
    planWeekByNmId,
    factMonthByNmId,
    totals: {
      planWeek: planWeekTotal,
      factWeek: factWeekTotal,
      planMonth: planMonthTotal,
      factMonthMtd: factMtdTotal,
    },
  }
}
