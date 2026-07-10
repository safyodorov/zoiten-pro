// app/(dashboard)/finance/weekly/page.tsx
// RSC-страница понедельного WB фин-отчёта (/finance/weekly, W2a).
// RBAC-гейт FINANCE → резолв ISO-недели → loadWeeklyFinReportInputs →
// computeWeeklyFinReport → рендер (табы + тулбар + роллап-таблица + водопад).
// force-dynamic: неделя из ?week + допущения из AppSetting.
// Phase quick-260710-evz (W2a, 2026-07-10)
// Quick 260710-gem (W2c): + loadWeeklyPlanFact → prop planFact (план-факт
// недели/МТД из SalesPlanVersionDay активной версии плана продаж).

import { requireSection, getSectionRole } from "@/lib/rbac"
import { FinanceTabs } from "@/components/finance/FinanceTabs"
import { WeeklyFinReportControls } from "@/components/finance/WeeklyFinReportControls"
import { WeeklyFinReportTable } from "@/components/finance/WeeklyFinReportTable"
import { loadWeeklyFinReportInputs } from "@/lib/finance-weekly/data"
import { loadWeeklyPlanFact } from "@/lib/finance-weekly/plan-fact"
import { computeWeeklyFinReport } from "@/lib/finance-weekly/engine"

export const metadata = { title: "Финансы — Понедельный — Zoiten ERP" }
export const dynamic = "force-dynamic"

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** ISO-понедельник текущей недели (МСК-сегодня → UTC-понедельник). */
function currentIsoMonday(): string {
  const msk = new Date(Date.now() + 3 * 60 * 60 * 1000)
  const iso = msk.toISOString().slice(0, 10)
  const d = new Date(iso + "T00:00:00Z")
  const jsDay = d.getUTCDay() // 0=вс, 1=пн
  const isoDay = jsDay === 0 ? 7 : jsDay
  d.setUTCDate(d.getUTCDate() - (isoDay - 1))
  return d.toISOString().slice(0, 10)
}

/** Нормализует произвольную ISO-дату к её ISO-понедельнику (UTC). */
function normalizeToIsoMonday(iso: string): string {
  const d = new Date(iso + "T00:00:00Z")
  const jsDay = d.getUTCDay()
  const isoDay = jsDay === 0 ? 7 : jsDay
  d.setUTCDate(d.getUTCDate() - (isoDay - 1))
  return d.toISOString().slice(0, 10)
}

export default async function FinanceWeeklyPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  // RBAC-гейт на входе — до любой загрузки данных
  await requireSection("FINANCE")
  const canManage = (await getSectionRole("FINANCE")) === "MANAGE"

  // Резолв недели: валидный ?week → его ISO-понедельник, иначе текущая неделя
  const sp = await searchParams
  const mondayISO =
    sp.week && ISO_DATE_RE.test(sp.week)
      ? normalizeToIsoMonday(sp.week)
      : currentIsoMonday()
  const weekStart = new Date(mondayISO + "T00:00:00Z")

  const data = await loadWeeklyFinReportInputs(weekStart)
  const result = computeWeeklyFinReport({
    articles: data.articles,
    pools: data.pools,
    constants: data.constants,
  })

  // План-факт (W2c): план из SalesPlanVersionDay активной версии; факт —
  // по базису universe (W2d: appliances → заказы, clothing → выкупы gross).
  // Loader'у нужны articleNmIds из data → await после.
  const articleNmIds = data.articles.map((a) => a.nmId)
  const nmIdToProductId = new Map(
    articleNmIds.map((n) => [n, data.meta[n].productId] as const),
  )
  const universeByNmId = new Map(
    data.articles.map((a) => [a.nmId, a.universe] as const),
  )
  const weekEndDate = new Date(data.weekEnd + "T00:00:00Z")
  const planFactRaw = await loadWeeklyPlanFact(
    weekStart,
    weekEndDate,
    articleNmIds,
    nmIdToProductId,
    universeByNmId,
  )

  // RSC→client boundary: Record, не Map (Phase 09-03)
  const planFact = planFactRaw.hasActivePlan
    ? {
        planWeekByNmId: Object.fromEntries(planFactRaw.planWeekByNmId),
        kpi: planFactRaw.totals,
        weekEndISO: data.weekEnd,
      }
    : null

  return (
    <div className="h-full flex flex-col gap-4">
      <FinanceTabs />

      <WeeklyFinReportControls
        weekStartISO={data.weekStart}
        weekEndISO={data.weekEnd}
        manualPools={data.manualPools}
        canManage={canManage}
        hasRealization={data.hasRealization}
      />

      <WeeklyFinReportTable
        articles={result.articles}
        rollup={result.rollup}
        waterfall={result.waterfall}
        meta={data.meta}
        planFact={planFact}
      />
    </div>
  )
}
