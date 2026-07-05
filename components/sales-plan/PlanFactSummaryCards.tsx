// components/sales-plan/PlanFactSummaryCards.tsx
// 5 KPI-карточек для Сводного план/факт/ИУ.
// Паттерн LoanSummaryCards.tsx.
// Phase 25-06.

import { cn } from "@/lib/utils"
import type { PlanFactKpi } from "@/lib/sales-plan/plan-fact"

// ── Форматирование ────────────────────────────────────────────────────────────

function fmtM(v: number): string {
  const sign = v < 0 ? "−" : v > 0 ? "+" : ""
  const abs = Math.abs(v)
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} М ₽`
  }
  return `${sign}${abs.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽`
}

function fmtRub(v: number): string {
  return v.toLocaleString("ru-RU", { maximumFractionDigits: 0 }) + " ₽"
}

function fmtPct(v: number | null): string {
  if (v == null) return "—"
  const sign = v > 0 ? "+" : ""
  return `${sign}${v.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  kpi: PlanFactKpi
  /** ИУ-итого на весь горизонт (для карточки «Прогноз на 31.12») */
  iuHorizonTotalRub: number
  /** Дата окончания горизонта (label «Прогноз на …») */
  horizonToLabel?: string
  /** Версия плана (label для карточки «План») */
  planVersionLabel?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PlanFactSummaryCards({
  kpi,
  iuHorizonTotalRub,
  horizonToLabel = "31.12",
  planVersionLabel,
}: Props) {
  const {
    factTotalRub,
    planTotalRub,
    deviationTotalRub,
    deviationTotalPct,
    iuTotalRub,
    factCumToYesterday,
    iuCumToYesterday,
    vsIuGapRub,
    vsIuGapDays,
    facPrimaryRub,
  } = kpi

  // Цвет отклонения факт/план
  const deviationColor =
    deviationTotalPct == null
      ? "text-muted-foreground"
      : deviationTotalPct >= 0
        ? "text-emerald-600 dark:text-emerald-500"
        : deviationTotalPct >= -5
          ? "text-amber-600 dark:text-amber-500"
          : "text-destructive"

  // Факт vs ИУ %
  const factVsIuPct = iuTotalRub > 0 ? (factTotalRub / iuTotalRub) * 100 : null
  const factVsIuCumPct = iuCumToYesterday > 0 ? (factCumToYesterday / iuCumToYesterday) * 100 : null

  // Прогноз vs ИУ
  const facVsIuRub = facPrimaryRub - iuHorizonTotalRub
  const facColor =
    facVsIuRub >= 0
      ? "text-emerald-600 dark:text-emerald-500"
      : facVsIuRub >= -iuHorizonTotalRub * 0.05
        ? "text-amber-600 dark:text-amber-500"
        : "text-destructive"

  // Отставание цвет (положительное = опережение)
  const gapColor =
    vsIuGapRub >= 0
      ? "text-emerald-600 dark:text-emerald-500"
      : vsIuGapRub >= -iuHorizonTotalRub * 0.05
        ? "text-amber-600 dark:text-amber-500"
        : "text-destructive"

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">

      {/* 1: Факт за период */}
      <div className="rounded-md border bg-card p-3">
        <div className="text-xs text-muted-foreground">Факт за период</div>
        <div className="text-2xl font-semibold tabular-nums mt-1">
          {fmtM(factTotalRub)}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">Фактический оборот (выкупы − возвраты)</div>
        {deviationTotalPct != null && (
          <div className={cn("text-xs mt-1 tabular-nums font-medium", deviationColor)}>
            {fmtPct(deviationTotalPct)} от плана ({fmtM(deviationTotalRub)})
          </div>
        )}
      </div>

      {/* 2: План за период */}
      <div className="rounded-md border bg-card p-3">
        <div className="text-xs text-muted-foreground">
          План за период{planVersionLabel ? ` · ${planVersionLabel}` : ""}
        </div>
        <div className="text-2xl font-semibold tabular-nums mt-1">
          {fmtM(planTotalRub)}
        </div>
        {!planVersionLabel && (
          <div className="text-xs text-amber-600 dark:text-amber-500 mt-1">
            номинал (без сток-лимита)
          </div>
        )}
      </div>

      {/* 3: ИУ-план за период */}
      <div className="rounded-md border bg-card p-3">
        <div className="text-xs text-muted-foreground">ИУ-план за период</div>
        <div className="text-2xl font-semibold tabular-nums mt-1">
          {fmtM(iuTotalRub)}
        </div>
        {factVsIuPct != null && (
          <div className="text-xs text-muted-foreground mt-1 tabular-nums">
            факт = {factVsIuPct.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}% ИУ
            {factVsIuCumPct != null && ` (накоп. ${factVsIuCumPct.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}%)`}
          </div>
        )}
      </div>

      {/* 4: Прогноз на конец горизонта (FAC) */}
      <div className="rounded-md border bg-card p-3">
        <div className="text-xs text-muted-foreground">Прогноз на {horizonToLabel}</div>
        <div className="text-2xl font-semibold tabular-nums mt-1">
          {fmtM(facPrimaryRub)}
        </div>
        <div className={cn("text-xs mt-1 tabular-nums font-medium", facColor)}>
          {fmtM(facVsIuRub)} vs ИУ{" "}
          <span className="text-muted-foreground font-normal">
            ({fmtM(iuHorizonTotalRub)})
          </span>
        </div>
      </div>

      {/* 5: Отставание от ИУ нарастающим — ГЛАВНАЯ «ТРЕВОЖНАЯ ЛАМПОЧКА» */}
      <div className="rounded-md border bg-card p-3 ring-1 ring-border">
        <div className="text-xs text-muted-foreground">Отставание от ИУ нарастающим</div>
        <div className={cn("text-3xl font-bold tabular-nums mt-1", gapColor)}>
          {fmtRub(Math.abs(vsIuGapRub))}
          <span className="text-lg ml-1">{vsIuGapRub >= 0 ? "▲" : "▼"}</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
          <div className="tabular-nums">
            Факт нараст.: {fmtM(factCumToYesterday)}
          </div>
          <div className="tabular-nums">
            ИУ нараст.: {fmtM(iuCumToYesterday)}
          </div>
          {vsIuGapDays != null && (
            <div className="tabular-nums">
              ≈ {Math.abs(vsIuGapDays).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} дн.
              {vsIuGapDays < 0 ? " отставания" : " опережения"}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
