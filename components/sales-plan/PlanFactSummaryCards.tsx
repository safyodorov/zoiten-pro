// components/sales-plan/PlanFactSummaryCards.tsx
// KPI Сводного — два честных блока: «Темп на сегодня» и «Прогноз до горизонта».
// Редизайн 260706-jmt: убраны смешанные «на сегодня» и «за весь период» в одной карточке.

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

/** Без знака «+» — для абсолютных величин (Прогноз, План, ИУ). */
function fmtMabs(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) {
    return `${(abs / 1_000_000).toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} М ₽`
  }
  return `${abs.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽`
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  kpi: PlanFactKpi
  /** ИУ-итого на весь горизонт (для блока «Прогноз») */
  iuHorizonTotalRub: number
  /** Дата окончания горизонта (label «Прогноз до …») */
  horizonToLabel?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PlanFactSummaryCards({
  kpi,
  iuHorizonTotalRub,
  horizonToLabel = "31.12",
}: Props) {
  const {
    planHorizonFullRub,
    factCumToYesterday,
    iuCumToYesterday,
    vsIuGapRub,
    vsIuGapDays,
    facPrimaryRub,
  } = kpi

  // Опережение (+) / отставание (−) от ИУ нарастающим
  const gapColor =
    vsIuGapRub >= 0
      ? "text-emerald-600 dark:text-emerald-500"
      : vsIuGapRub >= -iuHorizonTotalRub * 0.05
        ? "text-amber-600 dark:text-amber-500"
        : "text-destructive"

  // Прогноз vs ИУ на весь горизонт — главная цифра для решения
  const facVsIuRub = facPrimaryRub - iuHorizonTotalRub
  const facColor =
    facVsIuRub >= 0
      ? "text-emerald-600 dark:text-emerald-500"
      : facVsIuRub >= -iuHorizonTotalRub * 0.05
        ? "text-amber-600 dark:text-amber-500"
        : "text-destructive"

  const factVsIuCumPct =
    iuCumToYesterday > 0 ? (factCumToYesterday / iuCumToYesterday) * 100 : null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,1fr)_2fr] gap-3">

      {/* ── Блок 1: Темп на сегодня ─────────────────────────────── */}
      <div className="rounded-md border bg-card p-3 ring-2 ring-primary/50 flex flex-col">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Темп · на сегодня
        </div>
        <div className={cn("text-3xl font-bold tabular-nums mt-2", gapColor)}>
          {fmtM(vsIuGapRub)}
          <span className="text-lg ml-1">{vsIuGapRub >= 0 ? "▲" : "▼"}</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {vsIuGapRub >= 0 ? "опережаем ИУ" : "отстаём от ИУ"} нарастающим
          {factVsIuCumPct != null && (
            <span> · факт = {factVsIuCumPct.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}% ИУ</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-auto pt-2 space-y-0.5">
          <div className="tabular-nums">Факт нараст.: {fmtMabs(factCumToYesterday)}</div>
          <div className="tabular-nums">ИУ нараст.: {fmtMabs(iuCumToYesterday)}</div>
          {vsIuGapDays != null && (
            <div className="tabular-nums">
              ≈ {Math.abs(vsIuGapDays).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} дн.
              {vsIuGapDays < 0 ? " отставания" : " опережения"}
            </div>
          )}
        </div>
      </div>

      {/* ── Блок 2: Прогноз до горизонта ────────────────────────── */}
      <div className="rounded-md border bg-card p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Прогноз · до {horizonToLabel}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
          <div>
            <div className="text-xs text-muted-foreground">Прогноз</div>
            <div className="text-2xl font-semibold tabular-nums mt-0.5">{fmtMabs(facPrimaryRub)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">факт + план остатка</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Наш план</div>
            <div className="text-2xl font-semibold tabular-nums mt-0.5">{fmtMabs(planHorizonFullRub)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">весь период</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">ИУ (цель)</div>
            <div className="text-2xl font-semibold tabular-nums mt-0.5">{fmtMabs(iuHorizonTotalRub)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">весь период</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Прогноз до ИУ</div>
            <div className={cn("text-2xl font-semibold tabular-nums mt-0.5", facColor)}>{fmtM(facVsIuRub)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {facVsIuRub >= 0 ? "дотягиваем" : "не дотягиваем"} до цели
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
