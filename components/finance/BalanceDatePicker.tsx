// components/finance/BalanceDatePicker.tsx
// Phase 24 Plan 24-07 — URL-driven выбор двух дат для отчёта «Баланс» (D-09).
// Native <input type="date"> (CLAUDE.md), без локального state-каскада — controlled values.
"use client"

import { useRouter } from "next/navigation"

interface BalanceDatePickerProps {
  date: string // YYYY-MM-DD
  compare: string // YYYY-MM-DD
}

export function BalanceDatePicker({ date, compare }: BalanceDatePickerProps) {
  const router = useRouter()

  function push(nextDate: string, nextCompare: string) {
    router.push(`/finance/balance?date=${nextDate}&compare=${nextCompare}`)
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <label className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Дата баланса</span>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && push(e.target.value, compare)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Сравнить с</span>
        <input
          type="date"
          value={compare}
          onChange={(e) => e.target.value && push(date, e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>
    </div>
  )
}
