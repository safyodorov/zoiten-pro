"use client"

// components/analytics/tabs/CardStatsTab.tsx
// Phase 30 (ANL-09) — вкладка «Статистика карточки»: столбец средних (фикс. порядок) +
// панель выбора метрик (URL searchParams) + «одна метрика = один график» динамики по дням.
// recharts LineChart (паттерн CashflowChart): тики fill var(--muted-foreground), Tooltip.
// БЕЗ позиций (req.9). Sticky-ячейки — сплошной bg-background (CLAUDE.md §471).
import { useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { cn } from "@/lib/utils"
import type { SkuPayload, FunnelDayRaw } from "@/lib/analytics/types"

// Столбец средних — ФИКСИРОВАННЫЙ порядок (req.9): показы, CTR, конв.в корзину, конв.в заказ, заказы, сумма.
const AVG_ROWS: { key: string; label: string; fmt: (s: SkuPayload) => string }[] = [
  { key: "views", label: "Показы/дн", fmt: (s) => Math.round(s.funnel.viewsPerDay).toLocaleString("ru-RU") },
  { key: "ctr", label: "CTR", fmt: (s) => `${(s.funnel.ctr * 100).toFixed(1)}%` },
  { key: "clickToCart", label: "Клик→корзина", fmt: (s) => `${(s.funnel.clickToCart * 100).toFixed(1)}%` },
  { key: "clickToOrder", label: "Клик→заказ", fmt: (s) => `${(s.funnel.clickToOrder * 100).toFixed(1)}%` },
  { key: "orders", label: "Заказы/дн", fmt: (s) => Math.round(s.funnel.ordersPerDay).toLocaleString("ru-RU") },
  { key: "ordersSum", label: "Сумма/дн ₽", fmt: (s) => Math.round(s.funnel.ordersSumPerDay).toLocaleString("ru-RU") },
]

// Метрики графиков (БЕЗ позиций). value = ряд по дням из funnelDays/priceDays.
const METRIC_DEFS: { key: string; label: string; series: (s: SkuPayload) => { dt: string; v: number }[] }[] = [
  { key: "views", label: "Показы", series: (s) => s.funnelDays.map((d) => ({ dt: d.dt, v: d.viewCount })) },
  { key: "ctr", label: "CTR", series: (s) => s.funnelDays.map((d) => ({ dt: d.dt, v: ratio(d.openCard, d.viewCount) })) },
  { key: "clickToCart", label: "Клик→корзина", series: (s) => s.funnelDays.map((d) => ({ dt: d.dt, v: ratio(d.addToCart, d.openCard) })) },
  { key: "clickToOrder", label: "Клик→заказ", series: (s) => s.funnelDays.map((d) => ({ dt: d.dt, v: ratio(d.orders, d.openCard) })) },
  { key: "orders", label: "Заказы", series: (s) => s.funnelDays.map((d) => ({ dt: d.dt, v: d.orders })) },
  { key: "ordersSum", label: "Сумма ₽", series: (s) => s.funnelDays.map((d) => ({ dt: d.dt, v: d.ordersSum })) },
  { key: "buyout", label: "Выкуп", series: (s) => s.funnelDays.map((d) => ({ dt: d.dt, v: ratio(d.buyoutCount, d.orders) })) },
  { key: "price", label: "Цена ₽", series: (s) => s.priceDays.map((p) => ({ dt: p.dt, v: p.value })) },
]

function ratio(a: number, b: number): number {
  return b > 0 ? a / b : 0
}

const DEFAULT_METRICS = ["views", "clickToOrder"]

export function CardStatsTab({ skus }: { skus: SkuPayload[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const selected = (searchParams.get("metrics") ?? DEFAULT_METRICS.join(",")).split(",").filter(Boolean)

  const toggleMetric = useCallback(
    (key: string) => {
      const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]
      const params = new URLSearchParams(searchParams.toString())
      if (next.length === 0) params.delete("metrics")
      else params.set("metrics", next.join(","))
      router.push(`${pathname}?${params.toString()}`)
    },
    [selected, searchParams, router, pathname],
  )

  const activeMetrics = METRIC_DEFS.filter((m) => selected.includes(m.key))

  return (
    <div className="h-full flex flex-col">
      {/* Панель выбора метрик */}
      <div className="flex flex-wrap gap-1.5 p-2 border-b bg-background">
        {METRIC_DEFS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => toggleMetric(m.key)}
            className={cn(
              "px-2.5 py-1 text-xs rounded border transition-colors",
              selected.includes(m.key)
                ? "bg-primary text-primary-foreground border-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="overflow-auto flex-1 min-h-0">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-30 bg-background border-b p-2 text-left min-w-[220px]">Товар</th>
              <th className="sticky top-0 z-20 bg-background border-b p-2 text-left min-w-[160px]">Средние</th>
              {activeMetrics.map((m) => (
                <th key={m.key} className="sticky top-0 z-20 bg-background border-b p-2 text-left min-w-[240px]">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {skus.map((s) => (
              <tr key={s.nmId} className="align-top">
                <td className="sticky left-0 z-10 bg-background border-b p-2">
                  <div className="font-medium truncate max-w-[200px]">{s.name || s.nmId}</div>
                  <div className="text-xs text-muted-foreground">{s.brand} · {s.nmId}</div>
                </td>
                <td className="border-b p-2">
                  <div className="grid grid-cols-1 gap-0.5 text-xs">
                    {AVG_ROWS.map((r) => (
                      <div key={r.key} className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{r.label}</span>
                        <span className="tabular-nums font-medium">{r.fmt(s)}</span>
                      </div>
                    ))}
                  </div>
                </td>
                {activeMetrics.map((m) => (
                  <td key={m.key} className="border-b p-2">
                    <MiniChart data={m.series(s)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MiniChart({ data }: { data: { dt: string; v: number }[] }) {
  if (data.length < 2) return <div className="text-xs text-muted-foreground h-[90px] flex items-center">—</div>
  return (
    <ResponsiveContainer width="100%" height={90}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="dt"
          tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
          tickFormatter={(v: string) => v.slice(5)}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} width={36} />
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 6 }}
          labelFormatter={(v) => String(v).split("-").reverse().join(".")}
          formatter={(v) => [formatVal(Number(v)), ""] as [string, string]}
        />
        <Line dataKey="v" type="monotone" stroke="var(--chart-1)" strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function formatVal(v: number): string {
  if (v > 0 && v < 1) return `${(v * 100).toFixed(1)}%`
  return Math.round(v).toLocaleString("ru-RU")
}

export type { FunnelDayRaw }
