// lib/finance-weekly/plan-fact.ts
//
// План-факт понедельного WB фин-отчёта (/finance/weekly, W2c — §4.4 дизайн-спеки
// docs/superpowers/specs/2026-07-08-weekly-finreport-design.md).
//
// План — SalesPlanVersionDay АКТИВНОЙ версии плана продаж (AppSetting
// salesPlan.activeVersionId). W2d: базис per товар —
//   appliances → planOrdersRub (оборот по заказам, как факт ordersSumRub),
//   clothing   → planBuyoutsRub (оборот по выкупам, как факт WbSalesDaily.buyoutsRub).
// Universe товара плана: brand.direction.hasSizes → clothing (тот же признак, что data.ts).
//
// Факт — по базису universe (W2d):
//   appliances → WbCardFunnelDaily.ordersSumRub,
//   clothing   → WbSalesDaily.buyoutsRub (gross);
// неделя [weekStart..weekEnd] и месяц-to-date [monthStart..weekEnd].
// Каждый nmId ровно в одном базисе (universeByNmId из data.articles).
//
// План хранится per productId, отчёт строится per nmId → distributePlanAcrossNmIds
// раскладывает план товара по его nmId пропорционально факту соответствующего
// базиса (pure, тестируется).
//
// Течёт ПАРАЛЛЕЛЬНО движку engine.ts — движок план-факта не знает и не тронут.
//
// Quick 260710-gem (W2c, 2026-07-10)
// Quick 260710-hkj (W2d, 2026-07-10): базис clothing = выкупы (план + факт)

import { prisma } from "@/lib/prisma"
import type { Universe } from "@/lib/finance-weekly/types"

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
  /**
   * МТД-оборот per nmId, [monthStart..weekEnd]. W2d: базис по universe —
   * appliances = заказы (WbCardFunnelDaily), clothing = выкупы gross (WbSalesDaily).
   */
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
 * @param articleNmIds    nmId строк отчёта (qty > 0 в базисе universe)
 * @param nmIdToProductId nmId → Product.id (из data.meta)
 * @param universeByNmId  nmId → universe (W2d: базис факта per nmId; отсутствующий
 *                        nmId → appliances, тот же fallback что data.ts)
 *
 * ВАЖНО: totals.planWeek/planMonth = Σ плана по ВСЕМ товарам версии (без фильтра
 * по присутствию в отчёте) — план не занижается из-за товаров без заказов.
 * Поэтому итоговая строка таблицы (Σ per-nmId планов) может быть < KPI
 * «План недели» — это осознанно. W2d: per товар суммируется план выбранного
 * базиса (clothing → planBuyoutsRub, appliances → planOrdersRub).
 */
export async function loadWeeklyPlanFact(
  weekStart: Date,
  weekEnd: Date,
  articleNmIds: number[],
  nmIdToProductId: Map<number, string>,
  universeByNmId: ReadonlyMap<number, Universe>,
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

  // b2. Разделение nmIds по базису universe (W2d): отсутствующий → appliances
  const applNmIds: number[] = []
  const clothNmIds: number[] = []
  for (const nmId of articleNmIds) {
    if (universeByNmId.get(nmId) === "clothing") clothNmIds.push(nmId)
    else applNmIds.push(nmId)
  }

  // c. Шесть параллельных запросов (факт пропускается при пустом списке базиса)
  const [
    planWeekRows,
    planMonthRows,
    applFactWeekRows,
    applFactMtdRows,
    clothFactWeekRows,
    clothFactMtdRows,
  ] = await Promise.all([
    prisma.salesPlanVersionDay.groupBy({
      by: ["productId"],
      where: { versionId: activeVersionId, date: { gte: weekStart, lte: weekEnd } },
      _sum: { planOrdersRub: true, planBuyoutsRub: true },
    }),
    prisma.salesPlanVersionDay.groupBy({
      by: ["productId"],
      where: { versionId: activeVersionId, date: { gte: monthStart, lte: monthEnd } },
      _sum: { planOrdersRub: true, planBuyoutsRub: true },
    }),
    applNmIds.length > 0
      ? prisma.wbCardFunnelDaily.groupBy({
          by: ["nmId"],
          where: {
            nmId: { in: applNmIds },
            date: { gte: weekStart, lte: weekEnd },
          },
          _sum: { ordersSumRub: true },
        })
      : Promise.resolve([]),
    applNmIds.length > 0
      ? prisma.wbCardFunnelDaily.groupBy({
          by: ["nmId"],
          where: {
            nmId: { in: applNmIds },
            date: { gte: monthStart, lte: weekEnd },
          },
          _sum: { ordersSumRub: true },
        })
      : Promise.resolve([]),
    // W2d: факт clothing — gross выкупы (WbSalesDaily), неделя + МТД
    clothNmIds.length > 0
      ? prisma.wbSalesDaily.groupBy({
          by: ["nmId"],
          where: {
            nmId: { in: clothNmIds },
            date: { gte: weekStart, lte: weekEnd },
          },
          _sum: { buyoutsRub: true },
        })
      : Promise.resolve([]),
    clothNmIds.length > 0
      ? prisma.wbSalesDaily.groupBy({
          by: ["nmId"],
          where: {
            nmId: { in: clothNmIds },
            date: { gte: monthStart, lte: weekEnd },
          },
          _sum: { buyoutsRub: true },
        })
      : Promise.resolve([]),
  ])

  // c2. Universe товаров ПЛАНА (могут не входить в отчёт) — отдельный запрос:
  // hasSizes → clothing → базис плана planBuyoutsRub, иначе planOrdersRub.
  const planProductIds = Array.from(
    new Set([...planWeekRows, ...planMonthRows].map((r) => r.productId)),
  )
  const planProducts =
    planProductIds.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: planProductIds } },
          select: {
            id: true,
            brand: { select: { direction: { select: { hasSizes: true } } } },
          },
        })
      : []
  const clothingProductIds = new Set(
    planProducts.filter((p) => p.brand?.direction?.hasSizes).map((p) => p.id),
  )
  const planForProduct = (r: {
    productId: string
    _sum: { planOrdersRub: number | null; planBuyoutsRub: number | null }
  }): number =>
    clothingProductIds.has(r.productId)
      ? (r._sum.planBuyoutsRub ?? 0)
      : (r._sum.planOrdersRub ?? 0)

  // d. Totals: план — Σ выбранного базиса по ВСЕМ товарам версии; факт — merge
  // обоих базисов (каждый nmId ровно в одном)
  const planWeekByProductId = new Map<string, number>()
  let planWeekTotal = 0
  for (const r of planWeekRows) {
    const sum = planForProduct(r)
    planWeekByProductId.set(r.productId, sum)
    planWeekTotal += sum
  }
  let planMonthTotal = 0
  for (const r of planMonthRows) planMonthTotal += planForProduct(r)

  const factWeekByNmId = new Map<number, number>()
  let factWeekTotal = 0
  for (const r of applFactWeekRows) {
    const sum = r._sum.ordersSumRub ?? 0
    factWeekByNmId.set(r.nmId, sum)
    factWeekTotal += sum
  }
  for (const r of clothFactWeekRows) {
    const sum = r._sum.buyoutsRub ?? 0
    factWeekByNmId.set(r.nmId, sum)
    factWeekTotal += sum
  }
  const factMonthByNmId = new Map<number, number>()
  let factMtdTotal = 0
  for (const r of applFactMtdRows) {
    const sum = r._sum.ordersSumRub ?? 0
    factMonthByNmId.set(r.nmId, sum)
    factMtdTotal += sum
  }
  for (const r of clothFactMtdRows) {
    const sum = r._sum.buyoutsRub ?? 0
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
