// components/credits/CreditsDashboard.tsx
// Phase 21 (доработка): компактный дашборд-сводка сверху списка /credits.
// Карточки: общий объём задолженности, средневзвешенная ставка (по остатку долга),
// будущие выплаты по годам (тело + проценты). Pure server component.
// Компактные плашки + auto-fit grid → помещаются в одну строку на широких экранах.

import type { CreditsDashboard as CreditsDashboardData } from "@/lib/credits-data"

function formatRub(v: number): string {
  return v.toLocaleString("ru-RU", { maximumFractionDigits: 0 }) + " ₽"
}

export function CreditsDashboard({ data }: { data: CreditsDashboardData }) {
  // Нечего показывать, если нет долга и будущих выплат
  if (data.totalDebt <= 0 && data.byYear.length === 0) return null

  return (
    <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
      {/* Общий объём задолженности */}
      <div className="rounded-md border bg-card px-2.5 py-1.5">
        <div className="text-[11px] leading-tight text-muted-foreground">
          Общий объём задолженности
        </div>
        <div className="text-base font-semibold tabular-nums mt-0.5 text-sky-700 dark:text-sky-300">
          {formatRub(data.totalDebt)}
        </div>
        <div className="text-[10px] text-muted-foreground">остаток осн. долга</div>
      </div>

      {/* Средневзвешенная ставка */}
      <div className="rounded-md border bg-card px-2.5 py-1.5">
        <div className="text-[11px] leading-tight text-muted-foreground">
          Средневзв. ставка
        </div>
        <div className="text-base font-semibold tabular-nums mt-0.5">
          {data.weightedRatePct.toLocaleString("ru-RU", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 2,
          })}
          {" %"}
        </div>
        <div className="text-[10px] text-muted-foreground">по остатку долга</div>
      </div>

      {/* Будущие выплаты по годам */}
      {data.byYear.map((y) => (
        <div key={y.year} className="rounded-md border bg-card px-2.5 py-1.5">
          <div className="text-[11px] leading-tight text-muted-foreground">
            {y.year === data.currentYear ? `Осталось в ${y.year}` : `Выплаты в ${y.year}`}
          </div>
          <div className="mt-0.5 flex flex-col gap-0">
            <div className="flex justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Долг</span>
              <span className="tabular-nums font-medium text-blue-600 dark:text-blue-400">
                {formatRub(y.principal)}
              </span>
            </div>
            <div className="flex justify-between gap-2 text-xs">
              <span className="text-muted-foreground">%</span>
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
