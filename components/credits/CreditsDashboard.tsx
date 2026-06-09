// components/credits/CreditsDashboard.tsx
// Phase 21 (доработка): дашборд-сводка сверху списка /credits.
// Карточки: общий объём задолженности, средневзвешенная ставка (по остатку долга),
// будущие выплаты по годам (тело + проценты). Pure server component, паттерн LoanSummaryCards.

import type { CreditsDashboard as CreditsDashboardData } from "@/lib/credits-data"

function formatRub(v: number): string {
  return v.toLocaleString("ru-RU", { maximumFractionDigits: 0 }) + " ₽"
}

export function CreditsDashboard({ data }: { data: CreditsDashboardData }) {
  // Нечего показывать, если нет долга и будущих выплат
  if (data.totalDebt <= 0 && data.byYear.length === 0) return null

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {/* Общий объём задолженности */}
      <div className="rounded-md border bg-card p-3">
        <div className="text-xs text-muted-foreground">Общий объём задолженности</div>
        <div className="text-2xl font-semibold tabular-nums mt-1 text-sky-700 dark:text-sky-300">
          {formatRub(data.totalDebt)}
        </div>
        <div className="text-xs text-muted-foreground mt-1">остаток основного долга</div>
      </div>

      {/* Средневзвешенная ставка */}
      <div className="rounded-md border bg-card p-3">
        <div className="text-xs text-muted-foreground">Средневзвешенная ставка</div>
        <div className="text-2xl font-semibold tabular-nums mt-1">
          {data.weightedRatePct.toLocaleString("ru-RU", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 2,
          })}
          {" %"}
        </div>
        <div className="text-xs text-muted-foreground mt-1">взвеш. по остатку долга</div>
      </div>

      {/* Будущие выплаты по годам */}
      {data.byYear.map((y) => (
        <div key={y.year} className="rounded-md border bg-card p-3">
          <div className="text-xs text-muted-foreground">
            {y.year === data.currentYear
              ? `Осталось выплатить в ${y.year}`
              : `Выплаты в ${y.year}`}
          </div>
          <div className="mt-1.5 flex flex-col gap-1 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Основной долг</span>
              <span className="tabular-nums font-medium text-blue-600 dark:text-blue-400">
                {formatRub(y.principal)}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Проценты</span>
              <span className="tabular-nums font-medium text-amber-600 dark:text-amber-400">
                {formatRub(y.interest)}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
