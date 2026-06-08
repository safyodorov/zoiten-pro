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
  type ChartConfig,
} from "@/components/ui/chart"

export interface DailyPoint {
  date: string
  label: string
  units: number
  rub: number
  rubClothing: number
  rubAppliances: number
  rubOther: number
  unitsClothing: number
  unitsAppliances: number
  unitsOther: number
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
  clothing: { label: "Одежда", color: "var(--chart-2)" },
  appliances: { label: "Бытовая техника", color: "var(--chart-1)" },
  other: { label: "Прочее", color: "var(--chart-3)" },
} satisfies ChartConfig

export function SalesForecastDailyChart({
  data,
  accountingEndLabel,
}: Props) {
  const totalRub = data.reduce((s, d) => s + d.rub, 0)
  const totalUnits = data.reduce((s, d) => s + d.units, 0)
  const totalOther = data.reduce((s, d) => s + d.rubOther, 0)
  const hasOther = totalOther > 0

  // Накопительная сумма для tooltip
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
          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: "var(--color-clothing)" }}
              />
              Одежда
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: "var(--color-appliances)" }}
              />
              Бытовая техника
            </span>
            {hasOther && (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ background: "var(--color-other)" }}
                />
                Прочее
              </span>
            )}
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
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null
                const point = payload[0]?.payload as DailyPoint | undefined
                if (!point) return null
                const cumRub = cumulative.get(point.date) ?? 0
                return (
                  <div className="rounded-md border bg-background p-2 shadow-md text-xs min-w-[200px]">
                    <div className="font-medium mb-1">{label}</div>
                    <div className="flex items-baseline justify-between gap-3 mb-1.5">
                      <span className="text-muted-foreground">Σ выручка</span>
                      <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-500">
                        {fmtRub(point.rub)}{" "}
                        <span className="text-muted-foreground font-normal">
                          ({fmtNum(point.units, 0)} шт)
                        </span>
                      </span>
                    </div>
                    {point.rubClothing > 0 && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-sm"
                            style={{ background: "var(--color-clothing)" }}
                          />
                          Одежда
                        </span>
                        <span className="tabular-nums">
                          {fmtRub(point.rubClothing)}{" "}
                          <span className="text-muted-foreground">
                            ({fmtNum(point.unitsClothing, 0)} шт)
                          </span>
                        </span>
                      </div>
                    )}
                    {point.rubAppliances > 0 && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-sm"
                            style={{ background: "var(--color-appliances)" }}
                          />
                          Бытовая техника
                        </span>
                        <span className="tabular-nums">
                          {fmtRub(point.rubAppliances)}{" "}
                          <span className="text-muted-foreground">
                            ({fmtNum(point.unitsAppliances, 0)} шт)
                          </span>
                        </span>
                      </div>
                    )}
                    {point.rubOther > 0 && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-sm"
                            style={{ background: "var(--color-other)" }}
                          />
                          Прочее
                        </span>
                        <span className="tabular-nums">
                          {fmtRub(point.rubOther)}{" "}
                          <span className="text-muted-foreground">
                            ({fmtNum(point.unitsOther, 0)} шт)
                          </span>
                        </span>
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground mt-1.5 pt-1 border-t">
                      нарастающим: {fmtRub(cumRub)}
                    </div>
                  </div>
                )
              }}
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
              dataKey="rubClothing"
              stackId="rub"
              fill="var(--color-clothing)"
              name="Одежда"
            />
            <Bar
              dataKey="rubAppliances"
              stackId="rub"
              fill="var(--color-appliances)"
              name="Бытовая техника"
              radius={hasOther ? undefined : [2, 2, 0, 0]}
            />
            {hasOther && (
              <Bar
                dataKey="rubOther"
                stackId="rub"
                fill="var(--color-other)"
                name="Прочее"
                radius={[2, 2, 0, 0]}
              />
            )}
          </BarChart>
        </ChartContainer>
      )}
    </div>
  )
}
