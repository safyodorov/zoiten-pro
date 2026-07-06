"use client"

// components/sales-plan/PlanFactChart.tsx
// График факт/прогноз/план/ИУ по бакетам.
// Текущий (незавершённый) бакет — в ПОЛНОМ масштабе: факт сплошной + прогноз-остаток
// штриховкой, план = полный месяц (planRubFull), метка «N/M дн».
// Phase 25-06 · редизайн 260706-jmt.

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
  /** Факт ₽ (реализация, только прошедшие дни) */
  factRub: number
  /** Прогноз ₽ = факт + план остатка бакета */
  forecastRub: number
  /** Полный план бакета ₽ (не pro-rata) */
  planRubFull: number
  /** ИУ ₽ за бакет (полный) */
  iuRub: number
  /** Прошедших / всего дней в бакете (для метки «N/M дн») */
  elapsedDays: number
  totalDays: number
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

interface Row extends PlanFactChartPoint {
  /** Надстройка прогноза над фактом (для stacked-бара) */
  forecastGap: number
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
  payload?: Array<{ payload: Row }>
  label?: string
  cumulative?: boolean
}

function CustomTooltip({ active, payload, label, cumulative }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  const isPartial = !cumulative && d.isCurrentBucket && d.elapsedDays < d.totalDays
  const rows: Array<{ name: string; value: number; color: string }> = [
    { name: "Факт", value: d.factRub, color: "var(--chart-1)" },
    { name: "Прогноз", value: d.forecastRub, color: "var(--chart-1)" },
    { name: "План", value: d.planRubFull, color: "var(--chart-2)" },
  ]
  if (d.iuRub > 0) rows.push({ name: "ИУ", value: d.iuRub, color: "var(--chart-iu)" })
  return (
    <div className="rounded-md border bg-background p-2 shadow-md text-xs min-w-[190px]">
      <div className="font-medium mb-1.5 flex items-center justify-between gap-3">
        <span>{label}</span>
        {isPartial && (
          <span className="text-[10px] text-muted-foreground font-normal">
            прошло {d.elapsedDays}/{d.totalDays} дн
          </span>
        )}
      </div>
      {rows.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-3">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="tabular-nums font-medium">{fmtRub(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Метка «N/M дн» на текущем бакете ────────────────────────────────────────────

function makeDayTag(rows: Row[]) {
  return function DayTag(props: {
    x?: number | string
    y?: number | string
    width?: number | string
    index?: number
  }) {
    const index = props.index
    const row = index != null ? rows[index] : undefined
    if (!row?.isCurrentBucket || row.elapsedDays >= row.totalDays) return <g />
    const x = Number(props.x ?? 0)
    const y = Number(props.y ?? 0)
    const width = Number(props.width ?? 0)
    return (
      <text
        x={x + width / 2}
        y={y - 6}
        textAnchor="middle"
        fontSize={10}
        fontWeight={600}
        fill="var(--muted-foreground)"
      >
        {row.elapsedDays}/{row.totalDays} дн
      </text>
    )
  }
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

  // Строим ряды. В накопительном режиме — кумулятив по всем метрикам.
  let rows: Row[]
  if (cumulative) {
    let cumFact = 0
    let cumForecast = 0
    let cumPlan = 0
    let cumIu = 0
    rows = data.map((d) => {
      cumFact += d.factRub
      cumForecast += d.forecastRub
      cumPlan += d.planRubFull
      cumIu += d.iuRub
      return {
        ...d,
        factRub: cumFact,
        forecastRub: cumForecast,
        planRubFull: cumPlan,
        iuRub: cumIu,
        forecastGap: Math.max(0, cumForecast - cumFact),
      }
    })
  } else {
    rows = data.map((d) => ({ ...d, forecastGap: Math.max(0, d.forecastRub - d.factRub) }))
  }

  const hasIu = data.some((d) => d.iuRub > 0)
  const DayTag = makeDayTag(rows)

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
            Факт · Прогноз · План · ИУ
            {!cumulative && (
              <span className="ml-2 text-amber-600 dark:text-amber-500">
                * текущий месяц — сплошное = факт, штриховка = прогноз до конца месяца
              </span>
            )}
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={rows} margin={{ top: 18, right: 8, left: 8, bottom: 8 }}>
          <defs>
            <pattern id="pf-forecast" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--chart-1)" opacity="0.14" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--chart-1)" strokeWidth="2.4" opacity="0.7" />
            </pattern>
          </defs>
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
          <Tooltip content={<CustomTooltip cumulative={cumulative} />} />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />

          {/* Факт — сплошной bar (приглушённый если unsettled) */}
          <Bar
            dataKey="factRub"
            name="Факт"
            stackId="pf"
            fill="var(--chart-1)"
            radius={[0, 0, 0, 0]}
          >
            {rows.map((d) => (
              <Cell key={d.key} opacity={d.unsettled ? 0.5 : 0.85} />
            ))}
          </Bar>

          {/* Прогноз-остаток — штриховка поверх факта, метка «N/M дн» */}
          <Bar
            dataKey="forecastGap"
            name="Прогноз"
            stackId="pf"
            fill="url(#pf-forecast)"
            radius={[2, 2, 0, 0]}
            label={DayTag}
          />

          {/* План — ступенчатая line (полный месяц) */}
          <Line
            dataKey="planRubFull"
            name="План"
            type="stepAfter"
            stroke="var(--chart-2)"
            strokeWidth={2}
            dot={false}
          />

          {/* ИУ — dashed line (цель) */}
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
