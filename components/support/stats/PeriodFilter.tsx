"use client"

// components/support/stats/PeriodFilter.tsx
// Phase 13 — client фильтр периода (D-05 «Квартал (календарный)» hint).

import { useSearchParams, usePathname, useRouter } from "next/navigation"
import { useState, useEffect } from "react"

export interface PeriodFilterProps {
  currentPeriod: "7d" | "30d" | "quarter" | "custom"
  currentFrom?: string
  currentTo?: string
}

export function PeriodFilter({ currentPeriod, currentFrom, currentTo }: PeriodFilterProps) {
  const sp = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  const [preset, setPreset] = useState<PeriodFilterProps["currentPeriod"]>(currentPeriod)
  const [from, setFrom] = useState(currentFrom ?? "")
  const [to, setTo] = useState(currentTo ?? "")

  useEffect(() => {
    setPreset(currentPeriod)
    setFrom(currentFrom ?? "")
    setTo(currentTo ?? "")
  }, [currentPeriod, currentFrom, currentTo])

  function apply() {
    const newSp = new URLSearchParams(sp.toString())
    newSp.set("period", preset)
    if (preset === "custom") {
      if (from) newSp.set("dateFrom", from)
      else newSp.delete("dateFrom")
      if (to) newSp.set("dateTo", to)
      else newSp.delete("dateTo")
    } else {
      newSp.delete("dateFrom")
      newSp.delete("dateTo")
    }
    router.push(`${pathname}?${newSp.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm">
        <span className="block text-xs text-muted-foreground mb-1">Период</span>
        <select
          value={preset}
          onChange={(e) =>
            setPreset(e.target.value as PeriodFilterProps["currentPeriod"])
          }
          className="border rounded px-3 py-1.5 text-sm"
        >
          <option value="7d">7 дней</option>
          <option value="30d">30 дней</option>
          <option value="quarter">Квартал (календарный)</option>
          <option value="custom">Кастом</option>
        </select>
      </label>

      {preset === "custom" && (
        <>
          <label className="text-sm">
            <span className="block text-xs text-muted-foreground mb-1">С</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-muted-foreground mb-1">По</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm"
            />
          </label>
        </>
      )}

      <button
        type="button"
        onClick={apply}
        disabled={preset === "custom" && (!from || !to)}
        className="rounded bg-primary px-4 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
      >
        Применить
      </button>
    </div>
  )
}
