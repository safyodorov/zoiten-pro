"use client"
// Phase 19+ 2026-05-20: Composed daily chart для /ads/wb.
// Bars: расходы (red/coral) + выручка (emerald)
// Line: ДРР % (amber) на правой оси.

import {
  ComposedChart,
  Bar,
  Line,
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
import type { DailySpendPoint } from "@/lib/wb-advert-spend-data"

// Custom semantic colors (project's --chart-3/4/5 = greys, не подходят):
// spend = красно-коралл, revenue = emerald, drrPct = amber (контраст с chart-2 brand orange).
const chartConfig = {
  spend: { label: "Расход (₽)", color: "oklch(0.65 0.18 25)" }, // coral/red
  revenue: { label: "Выручка (₽)", color: "oklch(0.65 0.16 155)" }, // emerald
  drrPct: { label: "ДРР %", color: "oklch(0.7 0.18 70)" }, // amber
} satisfies ChartConfig

interface Props {
  data: DailySpendPoint[]
  periodDays: number
}

function formatRub(v: number): string {
  return v.toLocaleString("ru-RU", { maximumFractionDigits: 0 })
}

function formatThousands(v: number): string {
  if (v === 0) return "0"
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1000) return `${(v / 1000).toFixed(0)}k`
  return String(v)
}

export function SpendDailyChart({ data, periodDays }: Props) {
  const maxMoney = Math.max(...data.map(d => Math.max(d.spend, d.revenue)), 1)
  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0)
  const totalSpend = data.reduce((s, d) => s + d.spend, 0)
  const avgDrr = totalRevenue > 0 ? (totalSpend / totalRevenue) * 100 : null
  const maxDrr = Math.max(...data.map(d => d.drrPct ?? 0), 1)
  const drrUpper = Math.max(Math.ceil(maxDrr / 10) * 10, 10) // округление до десятков, минимум 10

  const hasSpend = data.some(d => d.spend > 0)
  const hasRevenue = data.some(d => d.revenue > 0)
  const hasData = hasSpend || hasRevenue

  // Тики X: меньше для длинных периодов.
  const interval = periodDays <= 7 ? 0 : periodDays <= 14 ? 1 : 3

  return (
    <div className="px-4 py-2">
      <div className="rounded-md border bg-card p-3">
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <div className="text-sm font-medium">Расходы, выручка и ДРР по дням</div>
          <div className="flex items-center gap-3 text-xs">
            <LegendDot color="var(--chart-5)" label="Расход" />
            <LegendDot color="var(--chart-2)" label="Выручка" />
            <LegendDot color="var(--chart-4)" label="ДРР %" line />
            {avgDrr != null && (
              <span className="text-muted-foreground">
                ср. ДРР: <span className="font-medium tabular-nums text-foreground">{avgDrr.toFixed(1)}%</span>
              </span>
            )}
          </div>
        </div>
        {hasData ? (
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <ComposedChart
              data={data}
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                vertical={false}
                strokeDasharray="2 2"
                opacity={0.3}
              />
              <XAxis
                dataKey="date"
                tickFormatter={(s: string) => s.slice(5)}
                fontSize={10}
                tickLine={false}
                axisLine={false}
                interval={interval}
              />
              <YAxis
                yAxisId="money"
                orientation="left"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={formatThousands}
                domain={[0, Math.ceil(maxMoney * 1.05)]}
              />
              <YAxis
                yAxisId="drr"
                orientation="right"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                width={42}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                domain={[0, drrUpper]}
              />
              {avgDrr != null && (
                <ReferenceLine
                  yAxisId="drr"
                  y={avgDrr}
                  stroke="var(--color-drrPct)"
                  strokeDasharray="3 3"
                  strokeOpacity={0.4}
                />
              )}
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(label) => `Дата: ${label}`}
                    formatter={(value, name, item) => {
                      const num = typeof value === "number" ? value : Number(value)
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const payload = (item as any)?.payload as DailySpendPoint | undefined
                      const cnt = payload?.count

                      let color = "var(--color-spend)"
                      let label = String(name)
                      let formatted = ""
                      let suffix = ""

                      if (name === "spend") {
                        color = "var(--color-spend)"
                        label = "Расход"
                        formatted = Number.isFinite(num) ? formatRub(num) : String(value)
                        suffix = " ₽"
                      } else if (name === "revenue") {
                        color = "var(--color-revenue)"
                        label = "Выручка"
                        formatted = Number.isFinite(num) ? formatRub(num) : String(value)
                        suffix = " ₽"
                      } else if (name === "drrPct") {
                        color = "var(--color-drrPct)"
                        label = "ДРР"
                        formatted = Number.isFinite(num) ? num.toFixed(1) : "—"
                        suffix = "%"
                      }

                      return (
                        <>
                          <div
                            className="shrink-0 rounded-[2px] h-2.5 w-2.5"
                            style={{ backgroundColor: color }}
                          />
                          <div className="flex flex-1 justify-between items-center leading-none gap-2">
                            <span className="text-muted-foreground">{label}</span>
                            <span className="font-mono font-medium text-foreground tabular-nums">
                              {formatted}{suffix}
                              {name === "spend" && cnt != null && (
                                <span className="text-muted-foreground text-xs font-normal ml-2">
                                  ({cnt})
                                </span>
                              )}
                            </span>
                          </div>
                        </>
                      )
                    }}
                  />
                }
              />
              <Bar
                yAxisId="money"
                dataKey="spend"
                fill="var(--color-spend)"
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
                maxBarSize={28}
              />
              <Bar
                yAxisId="money"
                dataKey="revenue"
                fill="var(--color-revenue)"
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
                maxBarSize={28}
                fillOpacity={0.75}
              />
              <Line
                yAxisId="drr"
                type="monotone"
                dataKey="drrPct"
                stroke="var(--color-drrPct)"
                strokeWidth={2}
                dot={{ r: 2.5, fill: "var(--color-drrPct)" }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ChartContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
            Нет данных за этот период.
          </div>
        )}
      </div>
    </div>
  )
}

function LegendDot({
  color,
  label,
  line = false,
}: {
  color: string
  label: string
  line?: boolean
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      {line ? (
        <span
          className="inline-block w-3 h-0.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      ) : (
        <span
          className="inline-block w-2.5 h-2.5 rounded-[2px]"
          style={{ backgroundColor: color }}
        />
      )}
      <span>{label}</span>
    </span>
  )
}
