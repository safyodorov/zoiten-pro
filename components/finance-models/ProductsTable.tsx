// components/finance-models/ProductsTable.tsx
// Таблица товаров с редактируемыми параметрами (рентабельность, заказы/день, партия)
// и производными метриками: ROI, оборачиваемость, прибыль, потребность в оборотке,
// доходность оборотного капитала (прибыльность с учётом оборачиваемости).
"use client"

import type { ProductInput, ProductMetrics } from "@/lib/finance-model/types"
import { Input } from "@/components/ui/input"
import { mln, pct } from "./format"

interface Props {
  products: ProductInput[]
  metrics: ProductMetrics[]
  onChange: (index: number, patch: Partial<ProductInput>) => void
}

function NumCell({
  value, onChange, step = 1, suffix,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  suffix?: string
}) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      <Input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-7 w-20 px-1.5 text-right tabular-nums"
      />
      {suffix && <span className="text-[11px] text-muted-foreground">{suffix}</span>}
    </div>
  )
}

export function ProductsTable({ products, metrics, onChange }: Props) {
  const sum = <K extends keyof ProductMetrics>(k: K) =>
    metrics.reduce((a, m) => a + (m[k] as number), 0)

  const totalRevenue = sum("annualRevenue")
  const totalProfit = sum("annualProfit")
  const totalCogs = sum("annualCogs")
  const totalAvgWC = sum("avgWorkingCapital")
  const totalPeakWC = sum("peakWorkingCapital")

  const cell = "px-2 py-1 text-right border-b whitespace-nowrap"
  const head = "bg-muted/60 px-2 py-2 text-right font-medium border-b whitespace-nowrap"

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-separate border-spacing-0 text-sm tabular-nums">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-muted/60 px-3 py-2 text-left font-medium border-b min-w-[170px]">
              Товар
            </th>
            <th className={`${head} bg-primary/5`}>Заказы/день</th>
            <th className={`${head} bg-primary/5`}>Партия, шт</th>
            <th className={`${head} bg-primary/5`}>Рент.&nbsp;продаж</th>
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
          {products.map((p, i) => {
            const m = metrics[i]
            return (
              <tr key={p.name} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="sticky left-0 z-10 bg-background px-3 py-1 text-left border-b whitespace-nowrap">
                  {p.name}
                </td>
                <td className={`${cell} bg-primary/5`}>
                  <NumCell value={p.ordersPerDay} step={1} onChange={(v) => onChange(i, { ordersPerDay: v || 0 })} />
                </td>
                <td className={`${cell} bg-primary/5`}>
                  <NumCell value={p.batchQty} step={50} onChange={(v) => onChange(i, { batchQty: v || 0 })} />
                </td>
                <td className={`${cell} bg-primary/5`}>
                  <NumCell
                    value={Math.round(p.marginPct * 1000) / 10}
                    step={0.5}
                    suffix="%"
                    onChange={(v) => onChange(i, { marginPct: (v || 0) / 100 })}
                  />
                </td>
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
            )
          })}
          <tr className="font-semibold bg-muted/40">
            <td className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left border-b">Итого / средн.</td>
            <td className={cell}>—</td>
            <td className={cell}>—</td>
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
        Голубые столбцы редактируемы — модель и таблицы вариантов пересчитываются мгновенно.
        <b> Доходность капитала</b> = прибыль за период / средний оборотный капитал — прибыльность с учётом
        оборачиваемости (≈ ROI за цикл × число оборотов в год). «Оборотка пик» по товарам достигается в
        разное время, поэтому их сумма — верхняя оценка совокупной потребности.
      </p>
    </div>
  )
}
