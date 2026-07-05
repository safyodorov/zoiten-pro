"use client"

// components/sales-plan/PlanFactChart.tsx
// График факт/план/ИУ по бакетам.
// Паттерн SalesForecastDailyChart.tsx (recharts bars + line).
// Phase 25-06.

import {
  ComposedChart,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlanFactChartPoint {
  key: string
  label: string
  /** Plan ₽ (pro-rata для текущего бакета) */
  planRub: number
  /** Fact ₽ */
  factRub: number
  /** ИУ ₽ за бакет */
  iuRub: number
  /** Приглушить (unsettled) */
  unsettled?: boolean
  /** Текущий бакет */
  isCurrentBucket?: boolean
}

interface Props {
  data: PlanFactChartPoint[]
  cumulative?: boolean
  /** ISO-дата today (для ReferenceLine «сегодня» в day-режиме) */
  today?: string
  metric?: string
}

// ── Форматирование ────────────────────────────────────────────────────────────

function fmtTick(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}М`
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}К`
  return String(v)
}

function fmtRub(v: number): string {
  return v.toLocaleString("ru-RU", { maximumFractionDigits: 0 }) + " ₽"
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-md border bg-background p-2 shadow-md text-xs min-w-[180px]">
      <div className="font-medium mb-1.5">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-3">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="tabular-nums font-medium">{fmtRub(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PlanFactChart({ data, cumulative = false, today }: Props) {
  if (data.length === 0) {
    return (
      <div className="rounded-md border bg-card p-4">
        <div className="text-center py-12 text-sm text-muted-foreground">Нет данных</div>
      </div>
    )
  }

  // В накопительном режиме строим кумулятивный ряд
  let chartData = data
  if (cumulative) {
    let cumPlan = 0
    let cumFact = 0
    let cumIu = 0
    chartData = data.map((d) => {
      cumPlan += d.planRub
      cumFact += d.factRub
      cumIu += d.iuRub
      return { ...d, planRub: cumPlan, factRub: cumFact, iuRub: cumIu }
    })
  }

  const hasIu = data.some((d) => d.iuRub > 0)

  // ReferenceLine для «сегодня» (в day-режиме совпадает с label точки)
  const todayPoint = today ? data.find((d) => d.key === today || d.key.startsWith(today.slice(0, 7))) : null
  const todayLabel = todayPoint?.label

  return (
    <div className="rounded-md border bg-card p-4">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="text-sm font-medium">
            {cumulative ? "Нарастающий итог" : "По периодам"}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Факт · План · ИУ
            {!cumulative && (
              <span className="ml-2 text-amber-600 dark:text-amber-500">
                * последние 3–7 дней факта предварительны (выкупы дозаполняются)
              </span>
            )}
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            interval={data.length > 20 ? Math.floor(data.length / 12) : 0}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={fmtTick}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconSize={10}
            wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
          />

          {/* Факт — bars (приглушённые если unsettled) */}
          <Bar
            dataKey="factRub"
            name="Факт"
            fill="var(--chart-1)"
            radius={[2, 2, 0, 0]}
          >
            {chartData.map((d) => (
              <Cell key={d.key} opacity={d.unsettled ? 0.45 : 0.8} />
            ))}
          </Bar>

          {/* План — ступенчатая line */}
          <Line
            dataKey="planRub"
            name="План"
            type="stepAfter"
            stroke="var(--chart-2)"
            strokeWidth={2}
            dot={false}
          />

          {/* ИУ — dashed line */}
          {hasIu && (
            <Line
              dataKey="iuRub"
              name="ИУ"
              type={cumulative ? "linear" : "monotone"}
              stroke="var(--chart-iu)"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={false}
            />
          )}

          {/* ReferenceLine «сегодня» */}
          {todayLabel && (
            <ReferenceLine
              x={todayLabel}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              label={{
                value: "сегодня",
                position: "top",
                fontSize: 10,
                fill: "var(--muted-foreground)",
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
