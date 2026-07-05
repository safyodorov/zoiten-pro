"use client"

// components/finance/CashflowKpiCards.tsx
// 4 KPI-карточки для ПДДС: Стартовый остаток · Мин. остаток · Первый разрыв · Net за горизонт.
// Phase 28-02.

import type { CashflowResult } from "@/lib/finance-cashflow/types"

// ── Форматирование ────────────────────────────────────────────────────────────

function fmtRub(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₽"
}

function fmtDate(iso: string): string {
  // "YYYY-MM-DD" → "DD.MM.YYYY"
  const [y, m, d] = iso.split("-")
  return `${d}.${m}.${y}`
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CashflowKpiCardsProps {
  result: CashflowResult
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CashflowKpiCards({ result }: CashflowKpiCardsProps) {
  const { startingBalance, minBalance, firstGapDate, netTotal } = result

  const cards = [
    {
      label: "Стартовый остаток",
      value: fmtRub(startingBalance),
      valueClass: "text-foreground",
    },
    {
      label: "Мин. остаток",
      value: fmtRub(minBalance),
      valueClass: minBalance < 0 ? "text-red-600 dark:text-red-400" : "text-foreground",
    },
    {
      label: "Первый разрыв",
      value: firstGapDate ? fmtDate(firstGapDate) : "нет",
      valueClass: firstGapDate
        ? "text-red-600 dark:text-red-400"
        : "text-emerald-600 dark:text-emerald-500",
    },
    {
      label: "Net за горизонт",
      value: fmtRub(netTotal),
      valueClass: netTotal < 0 ? "text-red-600 dark:text-red-400" : "text-foreground",
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">{c.label}</div>
          <div className={`mt-1 text-lg font-semibold tabular-nums ${c.valueClass}`}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  )
}
