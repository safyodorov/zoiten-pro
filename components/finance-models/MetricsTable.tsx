// components/finance-models/MetricsTable.tsx
// Универсальная таблица «метрики × месяцы» для модели прибыли и денежных потоков.
// Строки — статьи, столбцы — месяцы + Итого. Первый столбец sticky.
"use client"

import { mln } from "./format"

export interface MetricRow {
  label: string
  /** Значения по месяцам (длина = monthLabels.length) */
  values: number[]
  /** Итог; если не задан — сумма values */
  total?: number
  /** Не суммировать в Итого (для остатков на конец месяца) */
  noTotal?: boolean
  kind?: "normal" | "bold" | "subtle" | "accent"
}

interface Props {
  monthLabels: string[]
  rows: MetricRow[]
  /** Подпись столбца итога; null — скрыть столбец */
  totalLabel?: string | null
}

function rowClass(kind: MetricRow["kind"]): string {
  switch (kind) {
    case "bold":
      return "font-semibold"
    case "subtle":
      return "text-muted-foreground"
    case "accent":
      return "font-semibold text-primary"
    default:
      return ""
  }
}

export function MetricsTable({ monthLabels, rows, totalLabel = "Итого" }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-separate border-spacing-0 text-sm tabular-nums">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-muted/60 px-3 py-2 text-left font-medium border-b min-w-[200px]">
              Статья, млн ₽
            </th>
            {monthLabels.map((m) => (
              <th key={m} className="bg-muted/60 px-3 py-2 text-right font-medium border-b whitespace-nowrap">
                {m}
              </th>
            ))}
            {totalLabel !== null && (
              <th className="bg-muted px-3 py-2 text-right font-semibold border-b border-l whitespace-nowrap">
                {totalLabel}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const total = r.total ?? r.values.reduce((a, b) => a + b, 0)
            return (
              <tr key={r.label} className={`${rowClass(r.kind)} border-b last:border-b-0 hover:bg-muted/30`}>
                <td className="sticky left-0 z-10 bg-background px-3 py-1.5 text-left border-b whitespace-nowrap">
                  {r.label}
                </td>
                {r.values.map((v, i) => (
                  <td key={i} className="px-3 py-1.5 text-right border-b">
                    {mln(v)}
                  </td>
                ))}
                {totalLabel !== null && (
                  <td className="px-3 py-1.5 text-right border-b border-l bg-muted/40 font-medium">
                    {r.noTotal ? "—" : mln(total)}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
