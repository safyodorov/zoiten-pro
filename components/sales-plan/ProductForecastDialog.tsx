"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { ProductForecast } from "@/lib/sales-forecast"

interface Props {
  product: ProductForecast | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function fmtRub(n: number): string {
  return `${fmtNum(Math.round(n))} ₽`
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + "%"
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00Z")
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  })
}

const chartConfig = {
  rub: { label: "Выкупы (₽)", color: "var(--chart-1)" },
} satisfies ChartConfig

export function ProductForecastDialog({ product, open, onOpenChange }: Props) {
  if (!product) return null

  const chartData = product.dailySales.map((d) => ({
    date: d.date,
    label: formatDateLabel(d.date),
    units: d.units,
    rub: d.rub,
  }))

  const hasArrival = product.arrivalDate != null
  const arrivalLabel = hasArrival ? formatDateLabel(product.arrivalDate!) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-baseline justify-between gap-4">
            <span className="truncate">
              {product.sku} · {product.name}
            </span>
            <span className="text-sm font-normal text-muted-foreground whitespace-nowrap">
              {product.brandName}
              {product.categoryName && ` · ${product.categoryName}`}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div className="rounded-md border bg-card p-3">
            <div className="text-xs text-muted-foreground">Выкупы (прогноз)</div>
            <div className="text-lg font-semibold tabular-nums">
              {fmtNum(product.salesUnits, 1)} шт
            </div>
            <div className="text-xs text-emerald-600 dark:text-emerald-500 font-medium tabular-nums">
              {fmtRub(product.salesRub)}
            </div>
          </div>
          <div className="rounded-md border bg-card p-3">
            <div className="text-xs text-muted-foreground">Заказы</div>
            <div className="text-lg font-semibold tabular-nums">
              {fmtNum(product.ordersUnits, 1)} шт
            </div>
            <div className="text-xs text-muted-foreground">в горизонте</div>
          </div>
          <div className="rounded-md border bg-card p-3">
            <div className="text-xs text-muted-foreground">% выкупа</div>
            <div className="text-lg font-semibold tabular-nums">
              {fmtPct(product.buyoutPct)}
            </div>
            <div className="text-xs text-muted-foreground">
              {product.buyoutSource === "own" && "своя 30д funnel-история"}
              {product.buyoutSource === "legacy" &&
                "legacy WbCard (месячный WB)"}
              {product.buyoutSource === "subcategory" && (
                <span className="text-blue-600 dark:text-blue-500">
                  ↑ среднее по подкатегории
                </span>
              )}
              {product.buyoutSource === "global" && (
                <span className="text-amber-600 dark:text-amber-500">
                  * глобальное среднее
                </span>
              )}
            </div>
          </div>
          <div className="rounded-md border bg-card p-3">
            <div className="text-xs text-muted-foreground">Цена выкупа</div>
            <div className="text-lg font-semibold tabular-nums">
              {fmtRub(product.avgPrice)}
            </div>
            <div className="text-xs text-muted-foreground">
              {product.nmIds.length === 1
                ? `nmId ${product.nmIds[0]}`
                : `${product.nmIds.length} nmId`}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Сток сейчас</div>
            <div className="text-base font-semibold tabular-nums">
              {fmtNum(product.stockNow)} шт
            </div>
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">База заказов</div>
            <div className="text-base font-semibold tabular-nums">
              {fmtNum(product.baselineOrdersPerDay, 2)} шт/д
            </div>
            <div className="text-[11px] text-muted-foreground">avg 7д</div>
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">План после прихода</div>
            <div className="text-base font-semibold tabular-nums">
              {product.plannedTargetPerDay != null
                ? `${fmtNum(product.plannedTargetPerDay, 1)} шт/д`
                : "—"}
            </div>
            {product.plannedTargetPerDay != null && (
              <div className="text-[11px] text-muted-foreground">
                рамп-ап 3 раб. дня
              </div>
            )}
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Приход</div>
            <div className="text-base font-semibold tabular-nums">
              {product.arrivalQty > 0
                ? `${fmtNum(product.arrivalQty)} шт`
                : "—"}
            </div>
            {arrivalLabel && (
              <div className="text-[11px] text-muted-foreground">
                на {arrivalLabel}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-md border bg-card p-3">
          <div className="text-sm font-medium mb-2">
            Выкупы по дням (₽)
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              T+3 от даты заказа
            </span>
          </div>
          {chartData.length === 0 || chartData.every((d) => d.rub === 0) ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Нет прогнозируемых выкупов в этом окне
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-[280px] w-full">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  interval={Math.max(0, Math.floor(chartData.length / 15))}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => {
                    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}М`
                    if (v >= 1000) return `${(v / 1000).toFixed(0)}К`
                    return String(v)
                  }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name, item) => {
                        if (name === "rub") {
                          const payload = item.payload as { units: number }
                          return [
                            <span key={name}>
                              {fmtRub(Number(value))}{" "}
                              <span className="text-muted-foreground">
                                ({fmtNum(payload.units, 1)} шт)
                              </span>
                            </span>,
                          ]
                        }
                        return [String(value)]
                      }}
                    />
                  }
                />
                {hasArrival && (
                  <ReferenceLine
                    x={arrivalLabel ?? undefined}
                    stroke="oklch(0.65 0.16 155)"
                    strokeDasharray="4 4"
                    label={{
                      value: "приход",
                      position: "top",
                      fontSize: 10,
                      fill: "oklch(0.45 0.14 155)",
                    }}
                  />
                )}
                <Bar dataKey="rub" fill="var(--color-rub)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
