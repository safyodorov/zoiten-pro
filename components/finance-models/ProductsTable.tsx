// components/finance-models/ProductsTable.tsx
// Таблица товаров: рентабельность, ROI, прибыль за период, потребность в оборотке
// и доходность с учётом оборачиваемости (доходность оборотного капитала за год).
"use client"

import type { ProductMetrics } from "@/lib/finance-model/types"
import { mln, pct } from "./format"

export function ProductsTable({ metrics }: { metrics: ProductMetrics[] }) {
  const sum = <K extends keyof ProductMetrics>(k: K) =>
    metrics.reduce((a, m) => a + (m[k] as number), 0)

  const totalRevenue = sum("annualRevenue")
  const totalProfit = sum("annualProfit")
  const totalCogs = sum("annualCogs")
  const totalAvgWC = sum("avgWorkingCapital")
  const totalPeakWC = sum("peakWorkingCapital")

  const cell = "px-3 py-1.5 text-right border-b whitespace-nowrap"
  const head = "bg-muted/60 px-3 py-2 text-right font-medium border-b whitespace-nowrap"

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-separate border-spacing-0 text-sm tabular-nums">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-muted/60 px-3 py-2 text-left font-medium border-b min-w-[170px]">
              Товар
            </th>
            <th className={head}>Рент.&nbsp;продаж</th>
            <th className={head}>ROI&nbsp;/&nbsp;цикл</th>
            <th className={head}>Ден.&nbsp;цикл, дн</th>
            <th className={head}>Оборач., раз/год</th>
            <th className={head}>Выручка, млн&nbsp;₽</th>
            <th className={head}>Прибыль, млн&nbsp;₽</th>
            <th className={head}>Оборотка&nbsp;пик, млн&nbsp;₽</th>
            <th className={head}>Оборотка&nbsp;средн., млн&nbsp;₽</th>
            <th className={`${head} border-l`}>Доходн.&nbsp;капитала, %/год</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => (
            <tr key={m.name} className="border-b last:border-b-0 hover:bg-muted/30">
              <td className="sticky left-0 z-10 bg-background px-3 py-1.5 text-left border-b whitespace-nowrap">
                {m.name}
              </td>
              <td className={cell}>{pct(m.marginPct, 1)}</td>
              <td className={cell}>{pct(m.roi, 1)}</td>
              <td className={cell}>{Math.round(m.cashCycleDays)}</td>
              <td className={cell}>{m.capitalTurnsPerYear.toFixed(2)}</td>
              <td className={cell}>{mln(m.annualRevenue)}</td>
              <td className={cell}>{mln(m.annualProfit)}</td>
              <td className={cell}>{mln(m.peakWorkingCapital)}</td>
              <td className={cell}>{mln(m.avgWorkingCapital)}</td>
              <td className={`${cell} border-l bg-muted/40 font-medium text-primary`}>
                {pct(m.returnOnWorkingCapital, 0)}
              </td>
            </tr>
          ))}
          <tr className="font-semibold bg-muted/40">
            <td className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left border-b">Итого / средн.</td>
            <td className={cell}>—</td>
            <td className={cell}>—</td>
            <td className={cell}>—</td>
            <td className={cell}>{totalAvgWC > 0 ? (totalCogs / totalAvgWC).toFixed(2) : "—"}</td>
            <td className={cell}>{mln(totalRevenue)}</td>
            <td className={cell}>{mln(totalProfit)}</td>
            <td className={cell}>{mln(totalPeakWC)}</td>
            <td className={cell}>{mln(totalAvgWC)}</td>
            <td className={`${cell} border-l`}>
              {totalAvgWC > 0 ? pct(totalProfit / totalAvgWC, 0) : "—"}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="px-3 py-2 text-xs text-muted-foreground">
        Метрики на базовой марже. <b>Доходность капитала</b> = прибыль за период / средний оборотный
        капитал — это и есть прибыльность с учётом оборачиваемости (ROI за цикл × число оборотов в год).
        «Оборотка пик» по товарам достигается в разное время, поэтому их сумма — верхняя оценка совокупной
        потребности (фактический пик по всем товарам ниже).
      </p>
    </div>
  )
}
