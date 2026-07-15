// lib/finance-weekly/snapshot.ts
//
// W3c (quick 260710-mih): пейлоад immutable-снапшота недели понедельного
// фин-отчёта (/finance/weekly). Pure — ТОЛЬКО type-импорты из data.ts/types.ts
// (стираются компилятором → vitest не тянет Prisma). Никаких округлений:
// числа сохраняются как есть, display-форматирование делает UI.
//
// Снапшот = ВСЁ, что нужно для рендера WeeklyFinReportTable + Controls + KPI
// без пересчёта: результат движка + план-факт + входы (аудит / read-only
// отображение пулов). Хранится одной строкой WeeklyFinReportSnapshot.payloadJson.
//
// Version-guard: при несовпадении version страница уходит в live-fallback
// с warning-бейджем «снапшот устарел» (см. page.tsx). При изменении формы
// пейлоада — инкрементировать WEEKLY_SNAPSHOT_VERSION.

import type { WeeklyFinReportPageData } from "@/lib/finance-weekly/data"
import type { WeeklyFinReportOutput } from "@/lib/finance-weekly/types"

export const WEEKLY_SNAPSHOT_VERSION = 1

/** План-факт в снапшоте — форма PlanFactProps таблицы (Record, не Map). */
export interface WeeklySnapshotPlanFact {
  planWeekByNmId: Record<number, number>
  kpi: { planWeek: number; factWeek: number; planMonth: number; factMonthMtd: number }
  weekEndISO: string
}

/** ВСЁ, что нужно для рендера WeeklyFinReportTable + Controls + KPI без пересчёта. */
export interface WeeklyFinReportSnapshotPayload {
  version: 1
  weekStart: string
  weekEnd: string
  // Результат движка (рендер таблицы)
  articles: WeeklyFinReportOutput["articles"]
  rollup: WeeklyFinReportOutput["rollup"]
  waterfall: WeeklyFinReportOutput["waterfall"]
  meta: WeeklyFinReportPageData["meta"]
  planFact: WeeklySnapshotPlanFact | null
  // Входы (аудит + read-only отображение в Controls)
  pools: WeeklyFinReportPageData["pools"]
  constants: WeeklyFinReportPageData["constants"]
  manualPools: WeeklyFinReportPageData["manualPools"]
  hasRealization: boolean
  poolSources: WeeklyFinReportPageData["poolSources"]
  bankAutos: WeeklyFinReportPageData["bankAutos"]
  clothingOverheadPerUnitRub: number
  bankPoolSources: WeeklyFinReportPageData["bankPoolSources"]
}

/**
 * Собирает пейлоад снапшота из live-данных недели (1:1, без трансформаций).
 * Map'ов в пейлоаде нет по построению — всё уже Record на RSC-границе.
 */
export function buildWeeklySnapshotPayload(
  data: WeeklyFinReportPageData,
  result: WeeklyFinReportOutput,
  planFact: WeeklySnapshotPlanFact | null,
): WeeklyFinReportSnapshotPayload {
  return {
    version: WEEKLY_SNAPSHOT_VERSION,
    weekStart: data.weekStart,
    weekEnd: data.weekEnd,
    articles: result.articles,
    rollup: result.rollup,
    waterfall: result.waterfall,
    meta: data.meta,
    planFact,
    pools: data.pools,
    constants: data.constants,
    manualPools: data.manualPools,
    hasRealization: data.hasRealization,
    poolSources: data.poolSources,
    bankAutos: data.bankAutos,
    clothingOverheadPerUnitRub: data.clothingOverheadPerUnitRub,
    bankPoolSources: data.bankPoolSources,
  }
}

/**
 * Типизированный parse с version-guard: не объект / version !== 1 /
 * articles не массив → null (страница уходит в live-fallback + warning).
 * planFact нормализуется к null (не undefined) — контракт PlanFactProps.
 */
export function parseWeeklySnapshotPayload(
  json: unknown,
): WeeklyFinReportSnapshotPayload | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null
  const obj = json as Record<string, unknown>
  if (obj.version !== WEEKLY_SNAPSHOT_VERSION) return null
  if (!Array.isArray(obj.articles)) return null
  const payload = obj as unknown as WeeklyFinReportSnapshotPayload
  return { ...payload, planFact: payload.planFact ?? null }
}

/**
 * Нормализует ISO-дату к её ISO-понедельнику (UTC). Копия логики page.tsx
 * (jsDay===0 ? 7 : jsDay), вынесена как pure для action + тестов.
 */
export function toIsoMonday(iso: string): string {
  const d = new Date(iso + "T00:00:00Z")
  const jsDay = d.getUTCDay() // 0=вс, 1=пн
  const isoDay = jsDay === 0 ? 7 : jsDay
  d.setUTCDate(d.getUTCDate() - (isoDay - 1))
  return d.toISOString().slice(0, 10)
}
