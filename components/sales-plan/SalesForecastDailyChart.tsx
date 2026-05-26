"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export interface DailyPoint {
  date: string
  label: string
  units: number
  rub: number
}

interface Props {
  data: DailyPoint[]
  accountingEndDate: string // граница учёта (вертикальная линия)
  accountingEndLabel: string
}

function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function fmtRub(n: number): string {
  return `${fmtNum(Math.round(n))} ₽`
}

const chartConfig = {
  rub: { label: "Выкупы (₽)", color: "var(--chart-1)" },
} satisfies ChartConfig

export function SalesForecastDailyChart({
  data,
  accountingEndDate,
  accountingEndLabel,
}: Props) {
  const totalRub = data.reduce((s, d) => s + d.rub, 0)
  const totalUnits = data.reduce((s, d) => s + d.units, 0)

  // Накопительная сумма для графика «второго порядка»
  // (не визуально — но в tooltip полезно показать cumulative)
  const cumulative = new Map<string, number>()
  let acc = 0
  for (const d of data) {
    acc += d.rub
    cumulative.set(d.date, acc)
  }

  // Tick interval для X: реже на больших горизонтах
  const interval =
    data.length <= 14 ? 0 : data.length <= 30 ? 2 : data.length <= 45 ? 4 : 6

  return (
    <div className="rounded-md border bg-card p-4">
      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
        <div>
          <div className="text-sm font-medium">Выкупы по дням (₽)</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Сумма по видимым товарам · T+3 от даты заказа · пунктир — граница
            учётного периода ({accountingEndLabel})
          </div>
        </div>
        <div className="flex items-baseline gap-4 text-xs">
          <div>
            <span className="text-muted-foreground">Σ выкупов:</span>{" "}
            <span className="font-semibold tabular-nums">
              {fmtNum(totalUnits, 0)} шт
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Σ выручка:</span>{" "}
            <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-500">
              {fmtRub(totalRub)}
            </span>
          </div>
        </div>
      </div>
      {data.length === 0 || data.every((d) => d.rub === 0) ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          Нет прогнозируемых выкупов
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="h-[260px] w-full">
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              interval={interval}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => {
                if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}М`
                if (v >= 1000) return `${(v / 1000).toFixed(0)}К`
                return String(v)
              }}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name, item) => {
                    if (name === "rub") {
                      const payload = item.payload as {
                        units: number
                        date: string
                      }
                      const cumRub = cumulative.get(payload.date) ?? 0
                      return [
                        <span key={name} className="flex flex-col gap-0.5">
                          <span>
                            {fmtRub(Number(value))}{" "}
                            <span className="text-muted-foreground">
                              ({fmtNum(payload.units, 1)} шт)
                            </span>
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            нарастающим: {fmtRub(cumRub)}
                          </span>
                        </span>,
                      ]
                    }
                    return [String(value)]
                  }}
                />
              }
            />
            <ReferenceLine
              x={accountingEndLabel}
              stroke="oklch(0.65 0.16 155)"
              strokeDasharray="4 4"
              label={{
                value: "конец учёта",
                position: "top",
                fontSize: 10,
                fill: "oklch(0.45 0.14 155)",
              }}
            />
            <Bar
              dataKey="rub"
              fill="var(--color-rub)"
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      )}
    </div>
  )
}
