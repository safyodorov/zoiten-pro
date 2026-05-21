// Phase 19+ 2026-05-20: Summary карточки spend + revenue + ДРР для /ads/wb.

import type { SpendSummaryData } from "@/lib/wb-advert-spend-data"

function formatRub(v: number): string {
  return v.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

function formatPct(v: number | null): string {
  if (v == null) return "—"
  return v.toFixed(1) + "%"
}

// Цветовая шкала ДРР: <10% — хорошо (emerald), 10-20% — норма (sky), 20-30% — внимание (amber), >30% — плохо (red).
function drrTone(v: number | null): { color: string; label: string } {
  if (v == null) return { color: "text-muted-foreground", label: "" }
  if (v < 10) return { color: "text-emerald-600 dark:text-emerald-400", label: "хороший" }
  if (v < 20) return { color: "text-sky-600 dark:text-sky-400", label: "норма" }
  if (v < 30) return { color: "text-amber-600 dark:text-amber-400", label: "внимание" }
  return { color: "text-red-600 dark:text-red-400", label: "высокий" }
}

interface Props {
  summary: SpendSummaryData
}

export function SpendSummary({ summary }: Props) {
  const {
    totalSpend,
    totalRevenue,
    totalRevenueAdjusted,
    appliedBuyoutPct,
    avgDaily,
    avgDailyRevenueAdjusted,
    drrPct,
    byPaymentType,
    periodDays,
    totalCount,
  } = summary

  const drrInfo = drrTone(drrPct)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 px-4 py-2">
      {/* Card 1: Расходы */}
      <div className="rounded-md border bg-card p-3">
        <div className="text-xs text-muted-foreground">
          Расходы за {periodDays} дн.
        </div>
        <div className="text-2xl font-semibold tabular-nums mt-1">
          {formatRub(totalSpend)}
          <span className="text-sm text-muted-foreground font-normal"> ₽</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {formatRub(avgDaily)} ₽/день · {totalCount.toLocaleString("ru-RU")} списаний
        </div>
      </div>

      {/* Card 2: Выручка (с учётом выкупа per-nmId) */}
      <div
        className="rounded-md border bg-card p-3"
        title={`Выручка = Σ(оборот заказов nmId × % выкупа nmId/100).\n% выкупа — стабильный monthly avg из Analytics API per nmId.\nПрименённый средневзвешенный % выкупа: ${
          appliedBuyoutPct != null ? appliedBuyoutPct.toFixed(1) + "%" : "—"
        }.`}
      >
        <div className="text-xs text-muted-foreground">
          Выручка за {periodDays} дн.{" "}
          <span className="text-[10px]">(с выкупом)</span>
        </div>
        <div className="text-2xl font-semibold tabular-nums mt-1 text-emerald-700 dark:text-emerald-400">
          {formatRub(totalRevenueAdjusted)}
          <span className="text-sm text-muted-foreground font-normal"> ₽</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-2">
          <span>{formatRub(avgDailyRevenueAdjusted)} ₽/день</span>
          <span>·</span>
          <span>
            оборот:{" "}
            <span className="tabular-nums">{formatRub(totalRevenue)} ₽</span>
          </span>
          {appliedBuyoutPct != null && (
            <>
              <span>·</span>
              <span title="Применённый средневзвешенный процент выкупа">
                выкуп:{" "}
                <span className="tabular-nums text-foreground">
                  {appliedBuyoutPct.toFixed(1)}%
                </span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* Card 3: ДРР — большой выделенный */}
      <div className="rounded-md border bg-card p-3 relative overflow-hidden">
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          ДРР за {periodDays} дн.
          {drrInfo.label && (
            <span
              className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${drrInfo.color} bg-current/10`}
            >
              <span className={drrInfo.color}>{drrInfo.label}</span>
            </span>
          )}
        </div>
        <div className={`text-3xl font-semibold tabular-nums mt-1 ${drrInfo.color}`}>
          {formatPct(drrPct)}
        </div>
        <div
          className="text-xs text-muted-foreground mt-1"
          title="ДРР = расходы / (оборот × % выкупа). Учёт выкупа per-nmId."
        >
          расходы / выручку с учётом выкупа
        </div>
      </div>

      {/* Card 4: По источникам списания */}
      <div className="rounded-md border bg-card p-3">
        <div className="text-xs text-muted-foreground mb-1">
          По источникам списания
        </div>
        {byPaymentType.length === 0 ? (
          <div className="text-sm text-muted-foreground mt-1">Нет данных</div>
        ) : (
          <div className="flex flex-col gap-1 mt-1">
            {byPaymentType.map(({ paymentType, spend, count }) => {
              const pct = totalSpend > 0 ? (spend / totalSpend) * 100 : 0
              return (
                <div
                  key={paymentType}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-foreground">{paymentType}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground tabular-nums">
                      {count.toLocaleString("ru-RU")}
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatRub(spend)} ₽
                    </span>
                    <span className="text-muted-foreground w-10 text-right tabular-nums">
                      {pct.toFixed(1)}%
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
