"use client"

// components/finance/CashflowChart.tsx
// Recharts ComposedChart: линия остатка (прогноз) + линия факта (D-4) + ReferenceLine порог/сегодня.
// Образец: components/sales-plan/PlanFactChart.tsx (тики var(--muted-foreground), recharts токены).
// Phase 28-02.

import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts"
import type { CashflowDay } from "@/lib/finance-cashflow/types"

// ── Форматирование ────────────────────────────────────────────────────────────

function fmtTick(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}М`
  if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}К`
  return String(v)
}

function fmtRub(v: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(v) + " ₽"
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

interface TooltipPayloadItem {
  name: string
  value: number | null
  color: string
}

interface TooltipProps {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  // label = полная ISO-дата (IN-05) → "DD.MM.YYYY"
  const dateLabel = label ? label.split("-").reverse().join(".") : ""
  return (
    <div className="rounded-md border bg-background p-2 shadow-md text-xs min-w-[200px]">
      <div className="font-medium mb-1.5">{dateLabel}</div>
      {payload.map((p) => {
        if (p.value == null) return null
        return (
          <div key={p.name} className="flex items-center justify-between gap-3">
            <span style={{ color: p.color }}>{p.name}</span>
            <span className="tabular-nums font-medium">{fmtRub(p.value)}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CashflowChartProps {
  days: CashflowDay[]
  today: string
  gapThresholdRub: number
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CashflowChart({ days, today, gapThresholdRub }: CashflowChartProps) {
  if (days.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-3">
        <div className="text-center py-12 text-sm text-muted-foreground">Нет данных</div>
      </div>
    )
  }

  // IN-05: категория — полная ISO-дата (уникальна и через границу года,
  // "MM-DD" давал бы дубликаты категорий при горизонте 2026→2027);
  // короткий вид MM-DD — только в tickFormatter оси X.
  const chartData = days.map((d) => ({
    date: d.date,
    balanceEnd: d.balanceEnd,
    actualBalance: d.actualBalance,
  }))

  // Интервал тиков — не перегружать при большом диапазоне
  const tickInterval = days.length > 60 ? Math.floor(days.length / 20) : days.length > 20 ? Math.floor(days.length / 12) : 0

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-sm font-medium mb-2">Остаток денежных средств</div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(v: string) => v.slice(5)}
            interval={tickInterval}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={fmtTick}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />

          {/* Остаток (прогноз) */}
          <Line
            dataKey="balanceEnd"
            name="Остаток (прогноз)"
            type="monotone"
            stroke="var(--chart-2)"
            strokeWidth={2}
            dot={false}
          />

          {/* Остаток (факт) — до today, null дальше */}
          <Line
            dataKey="actualBalance"
            name="Остаток (факт)"
            type="monotone"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />

          {/* Порог тревоги */}
          <ReferenceLine
            y={gapThresholdRub}
            stroke="var(--destructive)"
            strokeDasharray="4 4"
            label={{
              value: "порог",
              position: "right",
              fontSize: 10,
              fill: "var(--muted-foreground)",
            }}
          />

          {/* Сегодня — x по полной ISO-дате (IN-05) */}
          <ReferenceLine
            x={today}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
            label={{
              value: "сегодня",
              position: "top",
              fontSize: 10,
              fill: "var(--muted-foreground)",
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
