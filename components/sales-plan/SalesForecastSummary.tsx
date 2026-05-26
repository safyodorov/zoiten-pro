"use client"

import { Package, Wallet, TrendingUp, Boxes } from "lucide-react"

interface SalesForecastSummaryProps {
  totalOrders: number
  totalSalesUnits: number
  totalSalesRub: number
  productsCount: number
  subcategoryFallbackCount: number
  globalFallbackCount: number
  globalBuyoutPct: number
  today: string
  endDate: string
}

function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function fmtRub(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}М ₽`
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toLocaleString("ru-RU", { maximumFractionDigits: 0 })}К ₽`
  }
  return `${fmtNum(n)} ₽`
}

function formatRu(iso: string): string {
  const d = new Date(iso + "T00:00:00Z")
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

export function SalesForecastSummary({
  totalOrders,
  totalSalesUnits,
  totalSalesRub,
  productsCount,
  subcategoryFallbackCount,
  globalFallbackCount,
  globalBuyoutPct,
  today,
  endDate,
}: SalesForecastSummaryProps) {
  const fallbackSub =
    subcategoryFallbackCount > 0
      ? `${subcategoryFallbackCount} по подкатегории`
      : null
  const fallbackGlob =
    globalFallbackCount > 0 ? `${globalFallbackCount} глобальный` : null
  const fallbackSub2 = [fallbackSub, fallbackGlob].filter(Boolean).join(", ")
  const cards = [
    {
      label: "Выручка по выкупам",
      value: fmtRub(totalSalesRub),
      sub: `${fmtNum(totalSalesUnits, 0)} шт выкуплено`,
      icon: Wallet,
      accent: "text-emerald-600 dark:text-emerald-500",
    },
    {
      label: "Заказов в окне",
      value: fmtNum(Math.round(totalOrders)),
      sub: "выкупы дальних заказов уходят за горизонт",
      icon: TrendingUp,
      accent: "text-primary",
    },
    {
      label: "Товаров в прогнозе",
      value: fmtNum(productsCount),
      sub:
        fallbackSub2.length > 0
          ? `% выкупа: ${fallbackSub2}`
          : "все с собственной историей",
      icon: Package,
      accent: "text-blue-600 dark:text-blue-500",
    },
    {
      label: "Глобальный % выкупа",
      value: `${(globalBuyoutPct * 100).toFixed(1)}%`,
      sub: "взвешенный 30 дней",
      icon: Boxes,
      accent: "text-amber-600 dark:text-amber-500",
    },
  ]

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        Период:{" "}
        <span className="font-medium text-foreground">{formatRu(today)}</span> →{" "}
        <span className="font-medium text-foreground">{formatRu(endDate)}</span>{" "}
        <span className="text-muted-foreground/60">включительно</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-md border bg-card p-4 flex items-start gap-3"
          >
            <div className={`mt-0.5 ${c.accent}`}>
              <c.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div className="text-2xl font-semibold mt-0.5 tabular-nums">
                {c.value}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {c.sub}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
