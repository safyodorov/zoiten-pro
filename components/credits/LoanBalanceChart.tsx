"use client"
// components/credits/LoanBalanceChart.tsx
// Line-chart остатка основного долга во времени (D-18 п.3).
// recharts LineChart + ChartContainer + ChartTooltip — паттерн WbCardOrdersChart.
// Phase 21 — Plan 06.
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { ScheduleRow } from "@/lib/loan-math"

interface Props {
  schedule: ScheduleRow[]
  amount?: number // опционально — для стартовой точки balance = amount
}

const chartConfig = {
  balance: {
    label: "Остаток тела (₽)",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

/** Форматирование даты ДД.ММ.ГГ (UTC). */
function formatDateShort(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0")
  const month = String(d.getUTCMonth() + 1).padStart(2, "0")
  const year = String(d.getUTCFullYear()).slice(-2)
  return `${day}.${month}.${year}`
}

/** Форматирование тысяч ru-RU (оси). */
function formatThousands(v: number): string {
  return v.toLocaleString("ru-RU", { maximumFractionDigits: 0 })
}

export function LoanBalanceChart({ schedule, amount }: Props) {
  if (schedule.length === 0) return null

  // Строим data points
  // Опциональная стартовая точка: balance = amount (до первого платежа)
  const dataPoints: Array<{ date: string; balance: number }> = []

  if (amount != null && amount > 0) {
    // Стартовая точка — дата немного раньше первой точки, используем ту же дату с пометкой
    const firstDate = schedule[0]!.date
    // Стартовая точка с той же датой, но balance = amount (полная сумма до первого платежа)
    // Чтобы не дублировать дату, добавляем только если balance != amount
    if (schedule[0]!.balance !== amount) {
      dataPoints.push({
        date: formatDateShort(firstDate) + " (нач.)",
        balance: amount,
      })
    }
  }

  for (const row of schedule) {
    dataPoints.push({
      date: formatDateShort(row.date),
      balance: Math.max(0, row.balance),
    })
  }

  // Рассчитываем разумный шаг тиков для XAxis
  const tickInterval = Math.max(1, Math.floor(dataPoints.length / 8))

  return (
    <div className="rounded-md border bg-card p-3 max-w-[720px]">
      <div className="text-sm font-medium mb-2 text-foreground">
        Остаток основного долга
      </div>
      <ChartContainer config={chartConfig} className="h-48 w-full">
        <LineChart
          data={dataPoints}
          margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            vertical={false}
            strokeDasharray="2 2"
            opacity={0.3}
          />
          <XAxis
            dataKey="date"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            interval={tickInterval}
          />
          <YAxis
            fontSize={10}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) => formatThousands(v)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(label) => `Дата: ${label}`}
                formatter={(value) => {
                  const numValue =
                    typeof value === "number" ? value : Number(value)
                  return (
                    <>
                      <div
                        className="shrink-0 rounded-[2px] h-2.5 w-2.5"
                        style={{
                          backgroundColor: "var(--chart-1)",
                          borderColor: "var(--chart-1)",
                        }}
                      />
                      <div className="flex flex-1 justify-between items-center leading-none gap-2">
                        <span className="text-muted-foreground">
                          Остаток тела
                        </span>
                        <span className="font-mono font-medium text-foreground tabular-nums">
                          {numValue.toLocaleString("ru-RU", {
                            maximumFractionDigits: 0,
                          })}{" "}
                          ₽
                        </span>
                      </div>
                    </>
                  )
                }}
              />
            }
          />
          <Line
            type="monotone"
            dataKey="balance"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={{ r: 1.5, fill: "var(--chart-1)" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
    </div>
  )
}
