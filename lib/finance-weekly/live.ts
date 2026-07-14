// lib/finance-weekly/live.ts
//
// W3c (quick 260710-mih): общая композиция LIVE-расчёта недели понедельного
// фин-отчёта — вынесена ИЗ app/(dashboard)/finance/weekly/page.tsx БЕЗ
// изменений логики. Используется:
//   - page.tsx — рендер незафиксированной недели (и live-fallback stale-снапшота);
//   - app/actions/finance-weekly.ts:fixWeeklyReport — серверный пересбор
//     пейлоада перед фиксацией (клиенту не доверяем).

import { loadWeeklyFinReportInputs, type WeeklyFinReportPageData } from "@/lib/finance-weekly/data"
import { computeWeeklyFinReport } from "@/lib/finance-weekly/engine"
import { loadWeeklyPlanFact } from "@/lib/finance-weekly/plan-fact"
import type { WeeklyFinReportOutput } from "@/lib/finance-weekly/types"
import type { WeeklySnapshotPlanFact } from "@/lib/finance-weekly/snapshot"

export interface WeeklyLiveBundle {
  data: WeeklyFinReportPageData
  result: WeeklyFinReportOutput
  planFact: WeeklySnapshotPlanFact | null
}

/**
 * Полный live-расчёт недели: входы из БД → движок → план-факт.
 * @param weekStart UTC-понедельник 00:00:00Z (как в page.tsx)
 */
export async function loadWeeklyLiveBundle(
  weekStart: Date,
  options?: { skipAppliancesBuyoutDiscount?: boolean },
): Promise<WeeklyLiveBundle> {
  const data = await loadWeeklyFinReportInputs(weekStart, options)
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
  const planFact: WeeklySnapshotPlanFact | null = planFactRaw.hasActivePlan
    ? {
        planWeekByNmId: Object.fromEntries(planFactRaw.planWeekByNmId),
        kpi: planFactRaw.totals,
        weekEndISO: data.weekEnd,
      }
    : null

  return { data, result, planFact }
}
