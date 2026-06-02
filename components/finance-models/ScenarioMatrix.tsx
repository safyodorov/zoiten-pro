// components/finance-models/ScenarioMatrix.tsx
// Матрица сценариев: строки — собственные средства, столбцы — дельта рентабельности.
// Ячейка — выбираемый KPI с цветовой подсветкой. Клик по ячейке выбирает её для деталей.
"use client"

import { useState } from "react"
import type { VariantResult } from "@/lib/finance-model/types"
import { mln } from "./format"

interface KpiDef {
  key: string
  label: string
  higherBetter: boolean
  get: (r: VariantResult) => number
}

const KPIS: KpiDef[] = [
  { key: "profitAfterInterest", label: "Прибыль после процентов", higherBetter: true, get: (r) => r.profitAfterInterest },
  { key: "netProfit", label: "Чистая прибыль (до %)", higherBetter: true, get: (r) => r.profitTotals.netProfit },
  { key: "peakCredit", label: "Пиковый кредит", higherBetter: false, get: (r) => r.credit.peakCredit },
  { key: "totalInterest", label: "Проценты за год", higherBetter: false, get: (r) => r.credit.totalInterest },
  { key: "endingCredit", label: "Долг на конец года", higherBetter: false, get: (r) => r.credit.endingCredit },
]

function deltaLabel(d: number): string {
  if (Math.abs(d) < 1e-9) return "база"
  const pp = Math.round(d * 1000) / 10
  return `${pp > 0 ? "+" : ""}${pp} пп`
}

/** Фон ячейки по нормализованному значению: зелёный для «больше-лучше», красный иначе. */
function cellBg(value: number, min: number, max: number, higherBetter: boolean): string {
  if (max - min < 1e-9) return "transparent"
  const t = (value - min) / (max - min) // 0..1
  // «хорошесть»: для higherBetter хорошо = t→1, иначе хорошо = t→0
  const good = higherBetter ? t : 1 - t
  const alpha = (0.08 + good * 0.22).toFixed(3)
  // зелёный для хорошего, красный для плохого — плавно
  const hue = 8 + good * 132 // 8 (красный) .. 140 (зелёный)
  return `hsl(${hue.toFixed(0)} 70% 50% / ${alpha})`
}

interface Props {
  ownFundsLevels: number[]
  marginDeltas: number[]
  results: VariantResult[][] // [ownIdx][marginIdx]
  selected: { ownIdx: number; marginIdx: number }
  onSelect: (ownIdx: number, marginIdx: number) => void
}

export function ScenarioMatrix({ ownFundsLevels, marginDeltas, results, selected, onSelect }: Props) {
  const [kpiKey, setKpiKey] = useState(KPIS[0].key)
  const kpi = KPIS.find((k) => k.key === kpiKey)!

  const all = results.flat().map(kpi.get)
  const min = Math.min(...all)
  const max = Math.max(...all)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Показатель в ячейках:</span>
        {KPIS.map((k) => (
          <button
            key={k.key}
            onClick={() => setKpiKey(k.key)}
            className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
              k.key === kpiKey ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-separate border-spacing-0 text-sm tabular-nums">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-muted/60 px-3 py-2 text-left font-medium border-b min-w-[150px]">
                Собств. ↓ / Маржа →
              </th>
              {marginDeltas.map((d, j) => (
                <th key={j} className="bg-muted/60 px-3 py-2 text-right font-medium border-b whitespace-nowrap">
                  {deltaLabel(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ownFundsLevels.map((of, i) => (
              <tr key={i}>
                <td className="sticky left-0 z-10 bg-background px-3 py-1.5 text-left border-b font-medium whitespace-nowrap">
                  {mln(of)} млн ₽
                </td>
                {marginDeltas.map((_, j) => {
                  const r = results[i]?.[j]
                  if (!r) return <td key={j} className="px-3 py-1.5 text-right border-b">—</td>
                  const v = kpi.get(r)
                  const isSel = selected.ownIdx === i && selected.marginIdx === j
                  return (
                    <td
                      key={j}
                      onClick={() => onSelect(i, j)}
                      style={{ backgroundColor: cellBg(v, min, max, kpi.higherBetter) }}
                      className={`px-3 py-1.5 text-right border-b cursor-pointer ${
                        isSel ? "outline outline-2 -outline-offset-2 outline-primary font-semibold" : ""
                      }`}
                      title="Открыть детали этой комбинации"
                    >
                      {mln(v)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Значения в млн ₽ (кроме процентных). Цвет: зелёный — выгоднее, красный — хуже. Клик по ячейке —
        детальные помесячные таблицы этой комбинации ниже. Текущий выбор обведён рамкой.
      </p>
    </div>
  )
}
