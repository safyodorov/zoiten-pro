// components/finance-models/ComparisonSummary.tsx
// Сводное сравнение трёх вариантов финансирования.
"use client"

import type { ModelResult } from "@/lib/finance-model/types"
import { rub } from "./format"

export function ComparisonSummary({ model }: { model: ModelResult }) {
  const rows: { label: string; get: (i: number) => string }[] = [
    { label: "Собственные средства", get: (i) => rub(model.variants[i].config.ownFunds) },
    { label: "Годовая выручка", get: (i) => rub(model.variants[i].profitTotals.revenue) },
    { label: "Чистая прибыль за год", get: (i) => rub(model.variants[i].profitTotals.netProfit) },
    { label: "Выведено собственнику", get: (i) => rub(model.variants[i].profitTotals.withdrawn) },
    { label: "Пиковый кредит", get: (i) => rub(model.variants[i].credit.peakCredit) },
    { label: "Месяц пика", get: (i) => model.variants[i].credit.peakMonthLabel },
    { label: "Совокупный капитал (пик)", get: (i) => rub(model.variants[i].credit.peakCapitalNeed) },
    { label: "Проценты за год", get: (i) => rub(model.variants[i].credit.totalInterest) },
    { label: "Долг на конец года", get: (i) => rub(model.variants[i].credit.endingCredit) },
  ]
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-separate border-spacing-0 text-sm tabular-nums">
        <thead>
          <tr>
            <th className="bg-muted/60 px-3 py-2 text-left font-medium border-b min-w-[220px]">Показатель</th>
            {model.variants.map((v) => (
              <th key={v.config.id} className="bg-muted/60 px-3 py-2 text-right font-medium border-b whitespace-nowrap">
                {v.config.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b last:border-b-0 hover:bg-muted/30">
              <td className="px-3 py-1.5 text-left border-b">{r.label}</td>
              {model.variants.map((_, i) => (
                <td key={i} className="px-3 py-1.5 text-right border-b">{r.get(i)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
