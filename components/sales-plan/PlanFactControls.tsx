"use client"

// components/sales-plan/PlanFactControls.tsx
// Тулбар «Сводный» — разбивка, пресеты дат, метрика, нарастающий итог.
// Все состояния через URL searchParams (паттерн ScheduleControls.tsx).
// Phase 25-06.

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { cn } from "@/lib/utils"
import type { Granularity } from "@/lib/date-buckets"

// ── Константы ─────────────────────────────────────────────────────────────────

const HORIZON_FROM = "2026-07-01"
const HORIZON_TO = "2026-12-31"
const DAY_WINDOW_LIMIT = 62  // максимальное окно в днях для разбивки «День»

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "day",      label: "День" },
  { value: "week",     label: "Неделя" },
  { value: "month",    label: "Месяц" },
  { value: "quarter",  label: "Квартал" },
  { value: "halfyear", label: "Полугодие" },
]

const METRIC_OPTIONS = [
  { value: "buyouts-rub",   label: "Фактический оборот ₽" },
  { value: "buyouts-units", label: "Выкуплено шт (реализация)" },
  { value: "orders-rub",    label: "Заказы ₽" },
  { value: "orders-units",  label: "Заказы шт" },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoToday(): string {
  const now = new Date()
  const msk = new Date(now.getTime() + 3 * 60 * 60 * 1000)
  return msk.toISOString().slice(0, 10)
}

function clamp(date: string, min: string, max: string): string {
  if (date < min) return min
  if (date > max) return max
  return date
}

function addDaysToIso(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function startOfIsoWeek(): string {
  const today = isoToday()
  const d = new Date(today + "T00:00:00Z")
  const jsDay = d.getUTCDay() // 0=вс, 1=пн
  const isoDay = jsDay === 0 ? 7 : jsDay
  d.setUTCDate(d.getUTCDate() - (isoDay - 1))
  return d.toISOString().slice(0, 10)
}

function startOfMonth(iso: string): string {
  return iso.slice(0, 7) + "-01"
}

function endOfMonth(iso: string): string {
  const [yyyy, mm] = iso.split("-")
  const d = new Date(parseInt(yyyy), parseInt(mm), 0) // last day of month
  return `${yyyy}-${mm}-${String(d.getDate()).padStart(2, "0")}`
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  granularity: Granularity
  from: string
  to: string
  metric: string
  cumulative: boolean
  /** Флаг: текущее day-окно превышает 62 дня */
  dayWindowExceeded?: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PlanFactControls({
  granularity,
  from,
  to,
  metric,
  cumulative,
  dayWindowExceeded,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const pushParams = useCallback(
    (updates: Partial<{
      granularity: string
      from: string
      to: string
      metric: string
      cumulative: string
    }>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === "") {
          params.delete(key)
        } else if (value !== undefined) {
          params.set(key, value)
        }
      }
      router.push(`/sales-plan?${params.toString()}`)
    },
    [router, searchParams]
  )

  const handleGranularity = (g: Granularity) => {
    pushParams({ granularity: g })
  }

  const handleFrom = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return
    const clamped = clamp(e.target.value, HORIZON_FROM, to)
    pushParams({ from: clamped })
  }

  const handleTo = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return
    const clamped = clamp(e.target.value, from, HORIZON_TO)
    pushParams({ to: clamped })
  }

  const handleMetric = (e: React.ChangeEvent<HTMLSelectElement>) => {
    pushParams({ metric: e.target.value })
  }

  const handleCumulative = (e: React.ChangeEvent<HTMLInputElement>) => {
    pushParams({ cumulative: e.target.checked ? "1" : "" })
  }

  // Пресеты
  const today = isoToday()

  const presets = [
    {
      label: "Тек. неделя",
      from: clamp(startOfIsoWeek(), HORIZON_FROM, HORIZON_TO),
      to: clamp(addDaysToIso(startOfIsoWeek(), 6), HORIZON_FROM, HORIZON_TO),
    },
    {
      label: "Тек. месяц",
      from: clamp(startOfMonth(today), HORIZON_FROM, HORIZON_TO),
      to: clamp(endOfMonth(today), HORIZON_FROM, HORIZON_TO),
    },
    {
      label: "3 мес",
      from: clamp(startOfMonth(today), HORIZON_FROM, HORIZON_TO),
      to: clamp(endOfMonth(addDaysToIso(startOfMonth(today), 90)), HORIZON_FROM, HORIZON_TO),
    },
    {
      label: "Полугодие",
      from: HORIZON_FROM,
      to: HORIZON_TO,
    },
  ]

  return (
    <div className="flex flex-wrap items-center gap-3 py-2">
      {/* Сегментированный переключатель разбивки */}
      <div className="flex items-center rounded-md border bg-muted/30 p-0.5">
        {GRANULARITY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleGranularity(opt.value)}
            className={cn(
              "px-3 py-1 text-sm rounded transition-colors",
              granularity === opt.value
                ? "bg-background text-foreground shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Диапазон дат */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground whitespace-nowrap">с</span>
        <input
          type="date"
          value={from}
          min={HORIZON_FROM}
          max={to}
          onChange={handleFrom}
          className="rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <span className="text-muted-foreground whitespace-nowrap">по</span>
        <input
          type="date"
          value={to}
          min={from}
          max={HORIZON_TO}
          onChange={handleTo}
          className="rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Пресеты */}
      <div className="flex items-center gap-1">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => pushParams({ from: p.from, to: p.to })}
            className="px-2 py-1 text-xs text-muted-foreground border rounded hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Метрика — native <select> (CLAUDE.md: НЕ base-ui) */}
      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-muted-foreground">Метрика:</span>
        <select
          value={metric}
          onChange={handleMetric}
          className="rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {METRIC_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Нарастающим итогом */}
      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={cumulative}
          onChange={handleCumulative}
          className="rounded"
        />
        <span className="text-muted-foreground">Нарастающим итогом</span>
      </label>

      {/* Notice при превышении day-окна */}
      {granularity === "day" && dayWindowExceeded && (
        <div className="text-xs text-amber-600 dark:text-amber-500 border border-amber-300 dark:border-amber-700 rounded px-2 py-1">
          Дневная разбивка ограничена {DAY_WINDOW_LIMIT} днями — сократите диапазон
        </div>
      )}
    </div>
  )
}
