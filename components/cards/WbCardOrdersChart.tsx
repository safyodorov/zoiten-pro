"use client"

import { BarChart, Bar, XAxis, CartesianGrid } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

interface DayPoint {
  date: string
  qty: number
}

interface Props {
  nmId: number
  timeSeries: DayPoint[] // 28 точек, qty=0 для дней без заказов
}

const chartConfig = {
  qty: { label: "Заказы", color: "hsl(var(--primary))" },
} satisfies ChartConfig

export function WbCardOrdersChart({ nmId, timeSeries }: Props) {
  // CONTEXT.md §График: 28 баров. Среднее за месяц = sum(28)/28. Среднее за 7 = sum(last 7)/7.
  const last7 = timeSeries.slice(-7)
  const sumAll = timeSeries.reduce((s, d) => s + d.qty, 0)
  const sum7 = last7.reduce((s, d) => s + d.qty, 0)
  const avg30d = timeSeries.length > 0 ? sumAll / timeSeries.length : 0
  const avg7d = last7.length > 0 ? sum7 / last7.length : 0

  return (
    <div className="p-4 grid grid-cols-[1fr_auto] gap-6 items-center">
      <div>
        <div className="text-xs text-muted-foreground mb-1">
          Заказы за 28 дней (nm {nmId})
        </div>
        <ChartContainer config={chartConfig} className="h-40 w-full">
          <BarChart
            data={timeSeries}
            margin={{ top: 4, right: 4, left: 4, bottom: 4 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="2 2" opacity={0.3} />
            <XAxis
              dataKey="date"
              tickFormatter={(s: string) => s.slice(5)} // MM-DD
              fontSize={10}
              tickLine={false}
              axisLine={false}
              interval={3}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => `Дата: ${label}`}
                />
              }
            />
            <Bar dataKey="qty" fill="var(--color-qty)" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </div>
      <div className="flex flex-col gap-4 text-sm min-w-[140px] pr-4">
        <div>
          <div className="text-muted-foreground text-xs">Ср. за месяц</div>
          <div className="text-lg font-medium">
            {avg30d.toFixed(1)}{" "}
            <span className="text-xs text-muted-foreground">/ день</span>
          </div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Ср. за 7 дней</div>
          <div className="text-lg font-medium">
            {avg7d.toFixed(1)}{" "}
            <span className="text-xs text-muted-foreground">/ день</span>
          </div>
        </div>
      </div>
    </div>
  )
}
