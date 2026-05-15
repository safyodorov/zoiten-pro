"use client"
// components/cards/WbCardOrdersChart.tsx
// 2026-05-15 (quick 260515-o4o v2): ComposedChart с dual Y-axis (Bar qty + Line buyerPrice).
// max-w-[640px] — панель ~2× уже исходной, выровнена по левому краю. Card-shape.
// connectNulls={false} — линия рвётся на null (дни без snapshot цены).

import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { DayPoint } from "@/lib/wb-orders-chart"

interface Props {
  nmId: number
  timeSeries: DayPoint[] // 28 точек: qty + (опц.) buyerPrice
}

const chartConfig = {
  qty: { label: "Заказы", color: "var(--chart-1)" },
  buyerPrice: { label: "Цена покупателя (₽)", color: "var(--chart-2)" },
} satisfies ChartConfig

export function WbCardOrdersChart({ nmId, timeSeries }: Props) {
  // CONTEXT.md §График: 28 баров. avg30d = sum(28)/28. avg7d = sum(last 7)/7.
  const last7 = timeSeries.slice(-7)
  const sumAll = timeSeries.reduce((s, d) => s + d.qty, 0)
  const sum7 = last7.reduce((s, d) => s + d.qty, 0)
  const avg30d = timeSeries.length > 0 ? sumAll / timeSeries.length : 0
  const avg7d = last7.length > 0 ? sum7 / last7.length : 0

  // Текущая цена покупателя — последняя не-null buyerPrice в массиве.
  const lastBuyerPrice = (() => {
    for (let i = timeSeries.length - 1; i >= 0; i--) {
      const v = timeSeries[i]?.buyerPrice
      if (v != null) return v
    }
    return null
  })()

  return (
    <div className="max-w-[640px] py-4 px-2">
      <div className="grid grid-cols-[1fr_auto] gap-6 items-center rounded-md border bg-card p-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground mb-1">
            nm {nmId} · заказы и цена покупателя · 28 дней
          </div>
          <ChartContainer config={chartConfig} className="h-40 w-full">
            <ComposedChart
              data={timeSeries}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
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
                interval={6}
              />
              <YAxis
                yAxisId="qty"
                orientation="left"
                allowDecimals={false}
                fontSize={10}
                tickLine={false}
                axisLine={false}
                width={28}
              />
              <YAxis
                yAxisId="price"
                orientation="right"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                width={42}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => `${Math.round(v)}`}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(label) => `Дата: ${label}`}
                  />
                }
              />
              <Bar
                yAxisId="qty"
                dataKey="qty"
                fill="var(--color-qty)"
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
              <Line
                yAxisId="price"
                type="monotone"
                dataKey="buyerPrice"
                stroke="var(--color-buyerPrice)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--color-buyerPrice)" }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ChartContainer>
        </div>
        <div className="flex flex-col gap-3 text-sm min-w-[120px] pr-1">
          <div>
            <div className="text-muted-foreground text-xs">Ср. за месяц</div>
            <div className="text-xl font-semibold tabular-nums">
              {avg30d.toFixed(1)}
              <span className="text-xs text-muted-foreground font-normal">
                {" "}
                / день
              </span>
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Ср. за 7 дней</div>
            <div className="text-xl font-semibold tabular-nums">
              {avg7d.toFixed(1)}
              <span className="text-xs text-muted-foreground font-normal">
                {" "}
                / день
              </span>
            </div>
          </div>
          {lastBuyerPrice != null && (
            <div>
              <div className="text-muted-foreground text-xs">Цена сейчас</div>
              <div
                className="text-xl font-semibold tabular-nums"
                style={{ color: "var(--chart-2)" }}
              >
                {lastBuyerPrice}
                <span className="text-xs text-muted-foreground font-normal">
                  {" "}
                  ₽
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
