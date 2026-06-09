"use client"

// components/credits/ScheduleControls.tsx
// Phase 21-07: Переключатель разбивки (день/неделя/месяц) + диапазон дат «с/по».
// Все состояния через URL searchParams (shareable).
// D-13a, D-14.

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { cn } from "@/lib/utils"
import type { LoanGranularity } from "@/lib/credits-schedule-data"

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDateForInput(date: Date): string {
  // YYYY-MM-DD для <input type="date">
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  const d = String(date.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ScheduleControlsProps {
  granularity: LoanGranularity
  from: Date
  to: Date
  defaultFrom: Date
  defaultTo: Date
  defaultGranularity: LoanGranularity
}

const GRANULARITY_OPTIONS: { value: LoanGranularity; label: string }[] = [
  { value: "day", label: "День" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
]

// ── Component ─────────────────────────────────────────────────────────────────

export function ScheduleControls({
  granularity,
  from,
  to,
  defaultFrom,
  defaultTo,
  defaultGranularity,
}: ScheduleControlsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const pushParams = useCallback(
    (updates: Partial<{ granularity: string; from: string; to: string }>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          params.set(key, value)
        }
      }
      router.push(`/credits/schedule?${params.toString()}`)
    },
    [router, searchParams]
  )

  const handleGranularity = (g: LoanGranularity) => {
    pushParams({ granularity: g })
  }

  const handleFrom = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      pushParams({ from: e.target.value })
    }
  }

  const handleTo = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      pushParams({ to: e.target.value })
    }
  }

  const handleReset = () => {
    router.push(
      `/credits/schedule?granularity=${defaultGranularity}&from=${formatDateForInput(defaultFrom)}&to=${formatDateForInput(defaultTo)}`
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
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
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Диапазон дат «с / по» */}
      <div className="flex items-center gap-2 text-sm">
        <label className="text-muted-foreground whitespace-nowrap">с</label>
        <input
          type="date"
          value={formatDateForInput(from)}
          onChange={handleFrom}
          className="rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <label className="text-muted-foreground whitespace-nowrap">по</label>
        <input
          type="date"
          value={formatDateForInput(to)}
          onChange={handleTo}
          className="rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Сброс в дефолтное окно */}
      <button
        type="button"
        onClick={handleReset}
        className="px-3 py-1 text-sm text-muted-foreground border rounded hover:text-foreground hover:bg-muted/40 transition-colors"
      >
        Сбросить
      </button>
    </div>
  )
}
