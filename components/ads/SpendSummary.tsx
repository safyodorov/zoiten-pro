// Phase 19+ 2026-05-20: Summary карточки spend для /ads/wb.

import type { SpendSummaryData } from "@/lib/wb-advert-spend-data"

function formatRub(v: number): string {
  return v.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

interface Props {
  summary: SpendSummaryData
}

export function SpendSummary({ summary }: Props) {
  const { totalSpend, avgDaily, byPaymentType, periodDays, totalCount } = summary

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 px-4 py-2">
      <div className="rounded-md border bg-card p-3">
        <div className="text-xs text-muted-foreground">
          Расходы за {periodDays} дн.
        </div>
        <div className="text-2xl font-semibold tabular-nums mt-1">
          {formatRub(totalSpend)}
          <span className="text-sm text-muted-foreground font-normal"> ₽</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {totalCount.toLocaleString("ru-RU")} списаний
        </div>
      </div>

      <div className="rounded-md border bg-card p-3">
        <div className="text-xs text-muted-foreground">Средний расход в день</div>
        <div className="text-2xl font-semibold tabular-nums mt-1">
          {formatRub(avgDaily)}
          <span className="text-sm text-muted-foreground font-normal"> ₽</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          В месяц ≈ {formatRub(avgDaily * 30)} ₽
        </div>
      </div>

      <div className="rounded-md border bg-card p-3 sm:col-span-2">
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
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-foreground">{paymentType}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {count.toLocaleString("ru-RU")} шт.
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatRub(spend)} ₽
                    </span>
                    <span className="text-xs text-muted-foreground w-12 text-right tabular-nums">
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
