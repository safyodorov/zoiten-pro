// app/(dashboard)/sales-plan/page.tsx
// Таб «Сводный» — план/факт/ИУ матрица.
// Переработка Phase 25-06: хардкод хранилища и guard end≥today удалены.
// requireSection("SALES"); guard end>=today снят; clamp в горизонт.

import { prisma } from "@/lib/prisma"
import { requireSection, getSectionRole } from "@/lib/rbac"
import { loadFactDaily } from "@/lib/sales-plan/data"
import { loadSalesPlanInputs } from "@/lib/sales-plan/data"
import { computeSalesPlan } from "@/lib/sales-plan/engine"
import { buildPlanFactReport } from "@/lib/sales-plan/plan-fact"
import { iuTotalForRange } from "@/lib/sales-plan/iu"
import type { Granularity } from "@/lib/date-buckets"
import type { IuTarget } from "@/lib/sales-plan/types"
import { SalesPlanTabs } from "@/components/sales-plan/SalesPlanTabs"
import { PlanFactControls } from "@/components/sales-plan/PlanFactControls"
import { PlanFactSummaryCards } from "@/components/sales-plan/PlanFactSummaryCards"
import { PlanFactChart } from "@/components/sales-plan/PlanFactChart"
import type { PlanFactChartPoint } from "@/components/sales-plan/PlanFactChart"
import { PlanFactMatrix } from "@/components/sales-plan/PlanFactMatrix"

// ── Константы ─────────────────────────────────────────────────────────────────

const HORIZON_FROM = "2026-07-01"
const HORIZON_TO = "2026-12-31"
const DAY_WINDOW_LIMIT = 62

// Fallback ИУ-таргет (до настройки через AppSetting)
const DEFAULT_IU_TARGETS: IuTarget[] = [
  { from: "2026-07-01", to: "2026-12-31", dailyRub: 2_380_805 },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMskTodayIso(): string {
  const now = new Date()
  const msk = new Date(now.getTime() + 3 * 60 * 60 * 1000)
  return msk.toISOString().slice(0, 10)
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime())
}

function clamp(date: string, min: string, max: string): string {
  if (date < min) return min
  if (date > max) return max
  return date
}

function parseJsonSafe(raw: string | undefined): unknown {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function SalesPlanPage({
  searchParams,
}: {
  searchParams: Promise<{
    granularity?: string
    from?: string
    to?: string
    metric?: string
    cumulative?: string
    version?: string
    brands?: string
    categories?: string
    subcategories?: string
    directions?: string
  }>
}) {
  await requireSection("SALES")
  const canManage = (await getSectionRole("SALES")) === "MANAGE"
  void canManage // пока не используется до Wave 7

  const today = getMskTodayIso()
  const sp = await searchParams

  // ── Параметры из URL ───────────────────────────────────────────────────────

  const VALID_GRANULARITIES: Granularity[] = ["day", "week", "month", "quarter", "halfyear", "year"]
  const granularity: Granularity =
    (sp.granularity && VALID_GRANULARITIES.includes(sp.granularity as Granularity))
      ? (sp.granularity as Granularity)
      : "month"

  // from/to — clamp в горизонт (guard end≥today СНЯТ)
  const rawFrom = sp.from && isValidDate(sp.from) ? sp.from : HORIZON_FROM
  const rawTo = sp.to && isValidDate(sp.to) ? sp.to : HORIZON_TO
  const from = clamp(rawFrom, HORIZON_FROM, HORIZON_TO)
  const to = clamp(rawTo, from, HORIZON_TO)

  const VALID_METRICS = ["buyouts-rub", "buyouts-units", "orders-rub", "orders-units"]
  const metric: string =
    sp.metric && VALID_METRICS.includes(sp.metric) ? sp.metric : "buyouts-rub"

  const cumulative = sp.cumulative === "1"

  // Дневная разбивка — ограничена 62 днями
  const dayCount = Math.round(
    (new Date(to + "T00:00:00Z").getTime() - new Date(from + "T00:00:00Z").getTime()) / 86_400_000
  ) + 1
  const dayWindowExceeded = granularity === "day" && dayCount > DAY_WINDOW_LIMIT
  const effectiveGranularity: Granularity = dayWindowExceeded ? "month" : granularity

  // ── AppSettings ─────────────────────────────────────────────────────────────

  const settingsRows = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [
          "salesPlan.iuTargets",
          "salesPlan.leadTimes2",
          "salesPlan.defaultLeadTimeDays",
          "salesPlan.safetyStockDays",
          "salesPlan.vpCoverDays",
          "salesPlan.wbInboundLagDays",
          "salesPlan.transitDays",
        ],
      },
    },
    select: { key: true, value: true },
  })
  const settingByKey = new Map(settingsRows.map((s) => [s.key, s.value]))

  function getSettingNum(key: string, def: number): number {
    const raw = settingByKey.get(key)
    if (!raw) return def
    const n = parseFloat(raw)
    return Number.isFinite(n) ? n : def
  }

  // ИУ-таргеты (из AppSetting или fallback)
  let iuTargets: IuTarget[] = DEFAULT_IU_TARGETS
  const iuRaw = parseJsonSafe(settingByKey.get("salesPlan.iuTargets"))
  if (Array.isArray(iuRaw) && iuRaw.length > 0) {
    iuTargets = iuRaw as IuTarget[]
  }

  // Lead times
  const leadTimesRaw = parseJsonSafe(settingByKey.get("salesPlan.leadTimes2")) as Record<string, number> | null
  const deliveryDays = leadTimesRaw?.deliveryDays ?? 3
  const returnDays = leadTimesRaw?.returnDays ?? 3
  const wbInboundLagDays = getSettingNum("salesPlan.wbInboundLagDays", 0)
  const transitDays = getSettingNum("salesPlan.transitDays", 20)
  const defaultLeadTimeDays = getSettingNum("salesPlan.defaultLeadTimeDays", 45)
  const safetyStockDays = getSettingNum("salesPlan.safetyStockDays", 14)
  const vpCoverDays = getSettingNum("salesPlan.vpCoverDays", 60)

  // ── Данные ─────────────────────────────────────────────────────────────────

  // Факт — loadFactDaily (company + byProduct)
  const factResult = await loadFactDaily(prisma, from, to)
  const { company: companyFactMap, byProduct: byProductMap, settledThroughIso } = factResult

  // Дневной ряд плана — через computeSalesPlan (драфт, номинал до первой версии)
  // Для Сводного используем company-level plan (Σ по всем товарам)
  let planCompanyDays: Array<{
    date: string
    planOrdersUnits: number
    planOrdersRub: number
    planBuyoutsUnits: number
    planBuyoutsRub: number
    priceUsed: number
    buyoutPctUsed: number
    stockEndUnits: number
  }> = []

  try {
    const planInputs = await loadSalesPlanInputs(prisma, {
      today,
      horizonFrom: HORIZON_FROM,
      horizonTo: HORIZON_TO,
      deliveryDays,
      returnDays,
      wbInboundLagDays,
      transitDays,
      defaultLeadTimeDays,
      safetyStockDays,
      vpCoverDays,
    })

    const planResult = computeSalesPlan(planInputs)

    // Срежем companyDaily до диапазона from/to
    planCompanyDays = planResult.companyDaily
      .filter((d) => d.date >= from && d.date <= to)
      .map((d) => ({
        date: d.date,
        planOrdersUnits: d.ordersUnits,
        planOrdersRub: d.ordersRub,
        planBuyoutsUnits: d.buyoutsUnits,
        planBuyoutsRub: d.buyoutsRub,
        priceUsed: 0,
        buyoutPctUsed: 0,
        stockEndUnits: 0,
      }))
  } catch (err) {
    console.error("[SalesPlanPage] computeSalesPlan error:", err)
    // Fallback: пустой план (нет данных товаров)
  }

  // Факт product-level (Σ по всем товарам)
  const productFactByDate = new Map<string, { buyoutsRub: number; ordersRub: number; buyoutsUnits: number; ordersUnits: number }>()
  for (const [, dailyMap] of byProductMap) {
    for (const [date, row] of dailyMap) {
      const cur = productFactByDate.get(date) ?? { buyoutsRub: 0, ordersRub: 0, buyoutsUnits: 0, ordersUnits: 0 }
      cur.buyoutsRub += row.buyoutsRub
      cur.ordersRub += row.ordersRub
      cur.buyoutsUnits += row.buyoutsUnits
      cur.ordersUnits += row.ordersUnits
      productFactByDate.set(date, cur)
    }
  }

  // Сериализуем в массивы для buildPlanFactReport
  const factDays = Array.from(productFactByDate.entries()).map(([date, row]) => ({
    date,
    ...row,
  }))

  const companyFactDays = Array.from(companyFactMap.entries()).map(([date, row]) => ({
    date,
    ...row,
  }))

  // ── buildPlanFactReport ─────────────────────────────────────────────────────

  const metricForReport = metric as "buyouts-rub" | "buyouts-units" | "orders-rub" | "orders-units"

  const report = buildPlanFactReport({
    today,
    planDays: planCompanyDays,
    factDays,
    companyFactDays,
    iuTargets,
    granularity: effectiveGranularity,
    from,
    to,
    cumulative,
    settledThroughIso,
    metric: metricForReport,
  })

  // ИУ за весь горизонт H2 (для карточки «Прогноз на 31.12»)
  const iuHorizonTotalRub = iuTotalForRange(HORIZON_FROM, HORIZON_TO, iuTargets)

  // ── Chart data ─────────────────────────────────────────────────────────────

  const chartPoints: PlanFactChartPoint[] = report.buckets.map((b) => ({
    key: b.key,
    label: b.label,
    planRub: b.planRub,
    factRub: b.factRub,
    iuRub: b.iuRub,
    unsettled: b.hasUnsettledDays,
    isCurrentBucket: b.isCurrentBucket,
  }))

  // Проверяем есть ли активные фильтры (для скрытия ИУ-строк в матрице)
  const hasFilters = Boolean(
    sp.brands || sp.categories || sp.subcategories || sp.directions
  )

  return (
    <div className="h-full flex flex-col gap-4 min-h-0">
      {/* Табы */}
      <SalesPlanTabs />

      {/* Тулбар */}
      <PlanFactControls
        granularity={granularity}
        from={from}
        to={to}
        metric={metric}
        cumulative={cumulative}
        dayWindowExceeded={dayWindowExceeded}
      />

      {/* Бейдж «номинал» (до первой фиксации версии) */}
      <div className="text-xs text-amber-600 dark:text-amber-500 px-1">
        ℹ План — номинал (без сток-лимита): версия плана не зафиксирована. Строки плана до первой фиксации (Wave 7) показывают unconstrained ставку × цена × % выкупа.
      </div>

      {/* KPI-карточки */}
      <PlanFactSummaryCards
        kpi={report.kpi}
        iuHorizonTotalRub={iuHorizonTotalRub}
        horizonToLabel="31.12"
      />

      {/* График */}
      <PlanFactChart
        data={chartPoints}
        cumulative={cumulative}
        today={today}
        metric={metric}
      />

      {/* Матрица */}
      <PlanFactMatrix
        buckets={report.buckets}
        total={report.total}
        granularity={effectiveGranularity}
        hideIuRows={hasFilters}
        hasFilters={hasFilters}
        metric={metric}
      />
    </div>
  )
}
