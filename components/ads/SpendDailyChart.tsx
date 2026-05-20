"use client"
// Phase 19+ 2026-05-20: Daily spend bar chart для /ads/wb.

import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { DailySpendPoint } from "@/lib/wb-advert-spend-data"

const chartConfig = {
  spend: { label: "Расход (₽)", color: "var(--chart-1)" },
} satisfies ChartConfig

interface Props {
  data: DailySpendPoint[]
  periodDays: number
}

function formatRub(v: number): string {
  return v.toLocaleString("ru-RU", { maximumFractionDigits: 0 })
}

export function SpendDailyChart({ data, periodDays }: Props) {
  const max = Math.max(...data.map(d => d.spend), 1)
  const hasData = data.some(d => d.spend > 0)

  // Тики X: каждый 1-й/2-й/4-й в зависимости от периода (избегаем перегрузки).
  const interval = periodDays <= 7 ? 0 : periodDays <= 14 ? 1 : 3

  return (
    <div className="px-4 py-2">
      <div className="rounded-md border bg-card p-3">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-sm font-medium">Расходы по дням</div>
          <div className="text-xs text-muted-foreground">
            {periodDays} дн. · max {formatRub(max)} ₽/день
          </div>
        </div>
        {hasData ? (
          <ChartContainer config={chartConfig} className="h-48 w-full">
            <BarChart
              data={data}
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
                interval={interval}
              />
              <YAxis
                fontSize={10}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(v: number) =>
                  v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                }
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(label) => `Дата: ${label}`}
                    formatter={(value, _name, item) => {
                      const num = typeof value === "number" ? value : Number(value)
                      const formatted = Number.isFinite(num) ? formatRub(num) : String(value)
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const cnt = (item as any)?.payload?.count
                      return (
                        <>
                          <div
                            className="shrink-0 rounded-[2px] h-2.5 w-2.5"
                            style={{ backgroundColor: "var(--color-spend)" }}
                          />
                          <div className="flex flex-1 justify-between items-center leading-none gap-2">
                            <span className="text-muted-foreground">
                              Расход
                            </span>
                            <span className="font-mono font-medium text-foreground tabular-nums">
                              {formatted} ₽
                              {cnt != null && (
                                <span className="text-muted-foreground text-xs font-normal ml-2">
                                  ({cnt} списаний)
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
                dataKey="spend"
                fill="var(--color-spend)"
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ChartContainer>
        ) : (
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
            Нет данных за этот период. Запустите backfill или дождитесь
            следующего cron (03:30 МСК).
          </div>
        )}
      </div>
    </div>
  )
}
