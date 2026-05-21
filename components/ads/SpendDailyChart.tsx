"use client"
// Phase 19+ 2026-05-21: Composed daily chart для /ads/wb.
// Bars: расходы (brand orange) — широкие столбцы на левой оси.
// Lines: выручка (emerald) на собственной скрытой оси — масштаб независимый,
// чтобы пик выручки визуально совпадал с пиком расходов; ДРР % (amber) на правой оси.

import {
  ComposedChart,
  Bar,
  Line,
  Area,
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

const chartConfig = {
  spend: { label: "Расход (₽)", color: "var(--chart-1)" }, // brand orange (как раньше)
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
  const maxSpend = Math.max(...data.map(d => d.spend), 1)
  const maxRevenue = Math.max(...data.map(d => d.revenue), 1)
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
          <div>
            <div className="text-sm font-medium">Расходы, выручка и ДРР по дням</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Столбцы — расходы (₽), линия — выручка (свой масштаб), пунктир — ДРР % (правая ось)
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <LegendDot color="var(--color-spend)" label="Расход" />
            <LegendDot color="var(--color-revenue)" label="Выручка" line />
            <LegendDot color="var(--color-drrPct)" label="ДРР %" line dashed />
            {avgDrr != null && (
              <span className="text-muted-foreground">
                ср. ДРР: <span className="font-medium tabular-nums text-foreground">{avgDrr.toFixed(1)}%</span>
              </span>
            )}
          </div>
        </div>
        {hasData ? (
          <ChartContainer config={chartConfig} className="h-72 w-full">
            <ComposedChart
              data={data}
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              barCategoryGap="12%"
            >
              <defs>
                <linearGradient id="spendBarGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-spend)" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="var(--color-spend)" stopOpacity={0.65} />
                </linearGradient>
                <linearGradient id="revenueAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-revenue)" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="var(--color-revenue)" stopOpacity={0} />
                </linearGradient>
              </defs>
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
                yAxisId="spend"
                orientation="left"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={formatThousands}
                domain={[0, Math.ceil(maxSpend * 1.15)]}
              />
              {/* Скрытая ось выручки — собственный масштаб, чтобы линия выручки
                  визуально совпадала со столбцами расходов (форма, а не абсолют). */}
              <YAxis
                yAxisId="revenue"
                orientation="right"
                hide
                domain={[0, Math.ceil(maxRevenue * 1.15)]}
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
                yAxisId="spend"
                dataKey="spend"
                fill="url(#spendBarGradient)"
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
                maxBarSize={64}
              />
              <Area
                yAxisId="revenue"
                type="monotone"
                dataKey="revenue"
                stroke="none"
                fill="url(#revenueAreaGradient)"
                isAnimationActive={false}
                activeDot={false}
                legendType="none"
              />
              <Line
                yAxisId="revenue"
                type="monotone"
                dataKey="revenue"
                stroke="var(--color-revenue)"
                strokeWidth={2.25}
                dot={{ r: 2.5, fill: "var(--color-revenue)", strokeWidth: 0 }}
                activeDot={{ r: 4, fill: "var(--color-revenue)", strokeWidth: 2, stroke: "var(--background)" }}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="drr"
                type="monotone"
                dataKey="drrPct"
                stroke="var(--color-drrPct)"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={{ r: 2.25, fill: "var(--color-drrPct)", strokeWidth: 0 }}
                activeDot={{ r: 4, fill: "var(--color-drrPct)", strokeWidth: 2, stroke: "var(--background)" }}
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
  dashed = false,
}: {
  color: string
  label: string
  line?: boolean
  dashed?: boolean
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      {line ? (
        dashed ? (
          <svg width="14" height="3" className="inline-block">
            <line
              x1="0"
              y1="1.5"
              x2="14"
              y2="1.5"
              stroke={color}
              strokeWidth="2"
              strokeDasharray="3 2"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <span
            className="inline-block w-3.5 h-0.5 rounded-full"
            style={{ backgroundColor: color }}
          />
        )
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
