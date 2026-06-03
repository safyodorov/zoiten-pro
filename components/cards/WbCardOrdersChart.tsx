"use client"
// components/cards/WbCardOrdersChart.tsx
// 2026-05-15 (quick 260515-o4o v2): ComposedChart с dual Y-axis (Bar qty + Line buyerPrice).
// max-w-[640px] — панель ~2× уже исходной, выровнена по левому краю. Card-shape.
// connectNulls={false} — линия рвётся на null (дни без snapshot цены).

import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { DayPoint } from "@/lib/wb-orders-chart"

interface Props {
  nmId: number
  timeSeries: DayPoint[] // 28 точек: qty + (опц.) buyerPrice
  /** Опциональные метаданные для встроенной legend (используется в /prices/wb).
   *  Если не переданы — секция «Остаток/В пути/Дни» не рендерится (для /cards/wb). */
  stockQty?: number | null
  inWayToClient?: number | null
  inWayFromClient?: number | null
  daysLeft?: number | null
}

const chartConfig = {
  qty: { label: "Заказы", color: "var(--chart-1)" },
  buyerPrice: { label: "Цена покупателя (₽)", color: "var(--chart-2)" },
  discountWb: { label: "СПП (%)", color: "var(--chart-3)" },
} satisfies ChartConfig

export function WbCardOrdersChart({
  nmId,
  timeSeries,
  stockQty,
  inWayToClient,
  inWayFromClient,
  daysLeft,
}: Props) {
  // CONTEXT.md §График: 28 баров. avg30d = sum(28)/28. avg7d = sum(last 7)/7.
  const last7 = timeSeries.slice(-7)
  const sumAll = timeSeries.reduce((s, d) => s + d.qty, 0)
  const sum7 = last7.reduce((s, d) => s + d.qty, 0)
  const avg30d = timeSeries.length > 0 ? sumAll / timeSeries.length : 0
  const avg7d = last7.length > 0 ? sum7 / last7.length : 0

  // Текущая цена покупателя — последняя не-null buyerPrice в массиве.
  const lastBuyerPrice = (() => {
    for (let i = timeSeries.length - 1; i >= 0; i--) {
      const v = timeSeries[i]?.buyerPrice
      if (v != null) return v
    }
    return null
  })()

  // Текущая СПП — последняя не-null discountWb.
  const lastDiscountWb = (() => {
    for (let i = timeSeries.length - 1; i >= 0; i--) {
      const v = timeSeries[i]?.discountWb
      if (v != null) return v
    }
    return null
  })()

  return (
    <div className="max-w-[640px] py-4 px-2">
      <div className="grid grid-cols-[1fr_auto] gap-6 items-center rounded-md border bg-card p-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground mb-1">
            арт. {nmId} · заказы, цена покупателя и СПП · 28 дней
          </div>
          <ChartContainer config={chartConfig} className="h-40 w-full">
            <ComposedChart
              data={timeSeries}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                vertical={false}
                strokeDasharray="2 2"
                opacity={0.3}
              />
              <XAxis
                dataKey="date"
                tickFormatter={(s: string) => s.slice(5)}
                fontSize={10}
                tickLine={false}
                axisLine={false}
                interval={6}
              />
              <YAxis
                yAxisId="qty"
                orientation="left"
                allowDecimals={false}
                fontSize={10}
                tickLine={false}
                axisLine={false}
                width={28}
              />
              <YAxis
                yAxisId="price"
                orientation="right"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                width={42}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => `${Math.round(v)}`}
              />
              {/* Скрытая ось для линии СПП (%) — отдельный масштаб, без лишних тиков. */}
              <YAxis yAxisId="spp" hide domain={["auto", "auto"]} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(label) => `Дата: ${label}`}
                    formatter={(value, name, item) => {
                      // quick 260518-gg3: ru-RU тысячи с пробелом + пробел
                      // между label и value (mimicking default ChartTooltipContent layout).
                      const numValue =
                        typeof value === "number" ? value : Number(value)
                      const formatted = !Number.isFinite(numValue)
                        ? String(value)
                        : name === "discountWb"
                          ? numValue.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + " %"
                          : numValue.toLocaleString("ru-RU")
                      const label =
                        name === "qty"
                          ? "Заказы"
                          : name === "buyerPrice"
                            ? "Цена покупателя (₽)"
                            : name === "discountWb"
                              ? "СПП (%)"
                              : String(name)
                      const indicatorColor =
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (item as any)?.payload?.fill ?? (item as any)?.color
                      return (
                        <>
                          <div
                            className="shrink-0 rounded-[2px] h-2.5 w-2.5"
                            style={{
                              backgroundColor: indicatorColor,
                              borderColor: indicatorColor,
                            }}
                          />
                          <div className="flex flex-1 justify-between items-center leading-none gap-2">
                            <span className="text-muted-foreground">
                              {label}
                            </span>
                            <span className="font-mono font-medium text-foreground tabular-nums">
                              {formatted}
                            </span>
                          </div>
                        </>
                      )
                    }}
                  />
                }
              />
              <Bar
                yAxisId="qty"
                dataKey="qty"
                fill="var(--color-qty)"
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
              <Line
                yAxisId="price"
                type="monotone"
                dataKey="buyerPrice"
                stroke="var(--color-buyerPrice)"
                strokeWidth={2}
                dot={{ r: 1.5, fill: "var(--color-buyerPrice)" }}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="spp"
                type="monotone"
                dataKey="discountWb"
                stroke="var(--color-discountWb)"
                strokeWidth={2}
                strokeDasharray="4 2"
                dot={{ r: 1.5, fill: "var(--color-discountWb)" }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ChartContainer>
        </div>
        {/* 2026-05-22: легенда стала единым столбцом + добавлены Остаток/В пути/Дни.
            Метрики продаж/цены сверху (крупнее), per-card остатки снизу (компактные).
            Тонкая горизонтальная линия отделяет блоки. */}
        <div className="flex flex-col gap-2 text-sm min-w-[125px] pr-1">
          <div>
            <div className="text-muted-foreground text-[11px]">Ср. за месяц</div>
            <div className="text-lg font-semibold tabular-nums leading-tight">
              {avg30d.toFixed(1)}
              <span className="text-[11px] text-muted-foreground font-normal">
                {" "}
                / день
              </span>
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-[11px]">Ср. за 7 дней</div>
            <div className="text-lg font-semibold tabular-nums leading-tight">
              {avg7d.toFixed(1)}
              <span className="text-[11px] text-muted-foreground font-normal">
                {" "}
                / день
              </span>
            </div>
          </div>
          {lastBuyerPrice != null && (
            <div>
              <div className="text-muted-foreground text-[11px]">Цена сейчас</div>
              <div
                className="text-lg font-semibold tabular-nums leading-tight"
                style={{ color: "var(--chart-2)" }}
              >
                {lastBuyerPrice.toLocaleString("ru-RU")}
                <span className="text-[11px] text-muted-foreground font-normal">
                  {" "}
                  ₽
                </span>
              </div>
            </div>
          )}
          {lastDiscountWb != null && (
            <div>
              <div className="text-muted-foreground text-[11px]">СПП сейчас</div>
              <div
                className="text-lg font-semibold tabular-nums leading-tight"
                style={{ color: "var(--chart-3)" }}
              >
                {lastDiscountWb.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}
                <span className="text-[11px] text-muted-foreground font-normal">
                  {" "}
                  %
                </span>
              </div>
            </div>
          )}
          {/* Остаток / В пути / Дни — компактный блок, разделитель сверху */}
          {(stockQty != null || daysLeft != null) && (
            <div className="pt-1.5 mt-0.5 border-t border-border/60 flex flex-col gap-0.5 text-[11px]">
              {stockQty != null && (
                <div className="flex justify-between gap-2 whitespace-nowrap">
                  <span className="text-muted-foreground">Остаток</span>
                  <span className="font-medium tabular-nums">{stockQty} шт</span>
                </div>
              )}
              {(inWayToClient ?? 0) + (inWayFromClient ?? 0) > 0 && (
                <div
                  className="flex justify-between gap-2 whitespace-nowrap"
                  title={`В пути к клиенту: ${inWayToClient ?? 0} шт.\nВ пути от клиента: ${inWayFromClient ?? 0} шт.`}
                >
                  <span className="text-muted-foreground">В пути</span>
                  <span className="font-medium tabular-nums text-amber-700 dark:text-amber-400">
                    → {inWayToClient ?? 0} / {inWayFromClient ?? 0} ←
                  </span>
                </div>
              )}
              {daysLeft != null && (
                <div className="flex justify-between gap-2 whitespace-nowrap">
                  <span className="text-muted-foreground">Дни</span>
                  <span
                    className={`font-medium tabular-nums ${
                      daysLeft <= 14
                        ? "text-red-600 dark:text-red-400"
                        : ""
                    }`}
                  >
                    {daysLeft} дн
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
