"use client"

import { useState, useTransition, useCallback, useMemo } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts"
import {
  getProductPlanDays,
  getProductPlanHorizon,
  saveDayOverrides,
  saveMonthLevels,
} from "@/app/actions/sales-plan"
import { computeSalesPlan } from "@/lib/sales-plan/engine"
import type { ProductPlanInput, PlanDayRow, SalesPlanInputs } from "@/lib/sales-plan/types"

// ── Форматирование ──────────────────────────────────────────────────────────

function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function fmtRub(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} М`
  if (Math.abs(n) >= 10_000) return `${(n / 1_000).toLocaleString("ru-RU", { maximumFractionDigits: 0 })} К`
  return fmtNum(Math.round(n))
}

function formatDateFull(iso: string): string {
  const d = new Date(iso + "T00:00:00Z")
  return d.toLocaleDateString("ru-RU", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" })
}

function formatDateShort(iso: string): string {
  const d = new Date(iso + "T00:00:00Z")
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", timeZone: "UTC" })
}

function parseNum(txt: string): number | null {
  const n = parseFloat(txt.replace(",", "."))
  return Number.isFinite(n) ? n : null
}

// ── Типы ─────────────────────────────────────────────────────────────────────

interface ProductPlanDialogProps {
  productId: string
  productName: string
  productSku: string
  months: string[]
  readOnly: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  today: string
  abcStatus?: "A" | "B" | "C" | null
}

// Метки месяцев
const MONTH_LABEL: Record<string, string> = {
  "2026-07-01": "Июль",
  "2026-08-01": "Август",
  "2026-09-01": "Сентябрь",
  "2026-10-01": "Октябрь",
  "2026-11-01": "Ноябрь",
  "2026-12-01": "Декабрь",
}
function monthLabel(m: string): string {
  return MONTH_LABEL[m] ?? m.slice(0, 7)
}

// ── CustomTooltip ─────────────────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number | null; color: string }>
  label?: string
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-md border bg-background p-2 shadow-md text-xs min-w-[160px]">
      <div className="font-medium mb-1.5">{label}</div>
      {payload.map((p) =>
        p.value !== null && p.value !== undefined ? (
          <div key={p.name} className="flex items-center justify-between gap-3">
            <span style={{ color: p.color }}>{p.name}</span>
            <span className="tabular-nums font-medium">{fmtNum(p.value)}</span>
          </div>
        ) : null,
      )}
    </div>
  )
}

// ── Компонент ─────────────────────────────────────────────────────────────────

export function ProductPlanDialog({
  productId,
  productName,
  productSku,
  months,
  readOnly,
  open,
  onOpenChange,
  today,
  abcStatus,
}: ProductPlanDialogProps) {
  const router = useRouter()

  // ── Горизонт-данные ──────────────────────────────────────────────────────
  const [productInput, setProductInput] = useState<ProductPlanInput | null>(null)
  const [daysAll, setDaysAll] = useState<PlanDayRow[]>([])
  const [factUnits, setFactUnits] = useState<Array<{ date: string; units: number }>>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Черновики уровней (ключ = month ISO "2026-07-01")
  const [levelDrafts, setLevelDrafts] = useState<Record<string, { orders: string; price: string }>>({})

  // ── Дни-секция (details) ─────────────────────────────────────────────────
  const [selectedMonth, setSelectedMonth] = useState<string>(months[0] ?? "")
  const [monthDays, setMonthDays] = useState<PlanDayRow[]>([])
  const [monthLoading, setMonthLoading] = useState(false)
  const [monthError, setMonthError] = useState<string | null>(null)
  // Дневные черновики — поднимаем в общий стейт чтобы влиять на главный график
  const [dayDrafts, setDayDrafts] = useState<Record<string, string>>({})

  const [, startTransition] = useTransition()

  // ── Загрузка горизонта ───────────────────────────────────────────────────
  const loadHorizon = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    setLevelDrafts({})
    setDayDrafts({})
    try {
      const r = await getProductPlanHorizon(productId)
      if (r.ok) {
        setProductInput(r.productInput)
        setDaysAll(r.days)
        setFactUnits(r.factUnitsDaily)
      } else {
        setLoadError(r.error)
      }
    } catch (e) {
      setLoadError(String(e))
    } finally {
      setLoading(false)
    }
  }, [productId])

  // ── Загрузка дней месяца ─────────────────────────────────────────────────
  const loadMonth = useCallback(
    async (month: string) => {
      setMonthLoading(true)
      setMonthError(null)
      try {
        const r = await getProductPlanDays(productId, month)
        if (r.ok) {
          setMonthDays(r.days)
        } else {
          setMonthError(r.error)
        }
      } catch (e) {
        setMonthError(String(e))
      } finally {
        setMonthLoading(false)
      }
    },
    [productId],
  )

  // ── Открытие диалога ─────────────────────────────────────────────────────
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      loadHorizon()
      if (months.length > 0) {
        const m = months[0]
        setSelectedMonth(m)
        loadMonth(m)
      }
    }
    if (!nextOpen) {
      setDayDrafts({})
      setLevelDrafts({})
    }
    onOpenChange(nextOpen)
  }

  // ── Realtime-пересчёт графика ────────────────────────────────────────────
  const { displayDays, mergedProductResult } = useMemo(() => {
    if (!productInput || daysAll.length === 0) {
      return { displayDays: daysAll, mergedProductResult: null }
    }
    try {
      // Собираем monthLevels из drafts
      const allMonthKeys = new Set([
        ...productInput.monthLevels.map((l) => l.month),
        ...Object.keys(levelDrafts),
      ])
      const mergedMonthLevels = [...allMonthKeys].map((month) => {
        const existing = productInput.monthLevels.find((l) => l.month === month)
        const draft = levelDrafts[month]
        const orders =
          draft?.orders.trim() === "" || draft === undefined
            ? existing?.targetOrdersPerDay ?? null
            : parseNum(draft.orders)
        const price =
          draft?.price.trim() === "" || draft === undefined
            ? existing?.priceRub ?? null
            : parseNum(draft.price)
        return {
          month,
          targetOrdersPerDay: orders,
          priceRub: price,
          buyoutPct: existing?.buyoutPct ?? null,
        }
      })

      // Мержим dayDrafts
      const mergedDayOverrides = { ...productInput.dayOverrides }
      for (const [date, txt] of Object.entries(dayDrafts)) {
        const num = parseFloat(txt.replace(",", "."))
        if (Number.isFinite(num) && num >= 0) {
          mergedDayOverrides[date] = num
        } else if (txt.trim() === "") {
          delete mergedDayOverrides[date]
        }
      }

      const mergedInput: ProductPlanInput = {
        ...productInput,
        monthLevels: mergedMonthLevels,
        dayOverrides: mergedDayOverrides,
      }

      const horizonFrom = daysAll[0]?.date ?? today
      const horizonTo = daysAll[daysAll.length - 1]?.date ?? today

      const inputs: SalesPlanInputs = {
        today,
        horizonFrom,
        horizonTo,
        deliveryDays: 3,
        returnDays: 3,
        wbInboundLagDays: 0,
        products: [mergedInput],
      }

      const result = computeSalesPlan(inputs)
      const pr = result.products[0]
      if (pr) {
        return { displayDays: pr.days, mergedProductResult: pr }
      }
    } catch {
      // fallback
    }
    return { displayDays: daysAll, mergedProductResult: null }
  }, [productInput, daysAll, levelDrafts, dayDrafts, today])

  // ── Данные графика ───────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const factByDate = new Map<string, number>()
    for (const f of factUnits) {
      factByDate.set(f.date, f.units)
    }
    return displayDays.map((d) => ({
      date: d.date,
      label: formatDateShort(d.date),
      plan: Math.round(d.ordersUnits),
      fact: d.date <= today ? (factByDate.get(d.date) ?? 0) : null,
      stock: Math.round(d.stockEnd),
    }))
  }, [displayDays, factUnits, today])

  // ── Итоги H2 ────────────────────────────────────────────────────────────
  const h2Totals = useMemo(() => {
    const source = mergedProductResult ?? { monthTotals: [], days: displayDays }
    if (mergedProductResult) {
      const totalRub = mergedProductResult.monthTotals.reduce((s, m) => s + m.buyoutsRub, 0)
      const totalUnits = mergedProductResult.monthTotals.reduce((s, m) => s + m.ordersUnits, 0)
      return { totalRub, totalUnits }
    }
    // Fallback: считаем из displayDays
    const totalRub = source.days.reduce((s, d) => s + d.buyoutsRub, 0)
    const totalUnits = source.days.reduce((s, d) => s + d.ordersUnits, 0)
    return { totalRub, totalUnits }
  }, [mergedProductResult, displayDays])

  // ── Сохранение уровней ───────────────────────────────────────────────────
  function handleSaveLevels() {
    const changedMonths = Object.keys(levelDrafts)
    if (changedMonths.length === 0) return

    const payload = changedMonths.map((month) => {
      const draft = levelDrafts[month]
      const orders = draft.orders.trim() === "" ? null : parseNum(draft.orders)
      const price = draft.price.trim() === "" ? null : parseNum(draft.price)
      return {
        productId,
        month,
        targetOrdersPerDay: orders,
        priceRub: price,
        buyoutPct: null as number | null,
      }
    })

    startTransition(async () => {
      const r = await saveMonthLevels(payload)
      if (!r.ok) {
        toast.error(r.error || "Не удалось сохранить")
        return
      }
      toast.success("Уровни сохранены")
      router.refresh()
      onOpenChange(false)
    })
  }

  // ── Сохранение дневных правок ────────────────────────────────────────────
  function handleSaveDays() {
    const overrides: Record<string, number | null> = {}
    for (const [date, txt] of Object.entries(dayDrafts)) {
      if (txt.trim() === "") {
        overrides[date] = null
      } else {
        const num = parseFloat(txt.replace(",", "."))
        if (Number.isFinite(num) && num >= 0) {
          overrides[date] = num
        }
      }
    }
    if (Object.keys(overrides).length === 0) return
    startTransition(async () => {
      const r = await saveDayOverrides({ productId, overrides })
      if (!r.ok) {
        toast.error(r.error || "Не удалось сохранить")
        return
      }
      toast.success("Дневные правки сохранены")
      router.refresh()
      onOpenChange(false)
    })
  }

  // ── Realtime Сток(расч) для таблицы дней ────────────────────────────────
  function getMergedMonthDays(): PlanDayRow[] {
    if (!productInput) return monthDays

    const mergedDayOverrides = { ...productInput.dayOverrides }
    for (const [date, txt] of Object.entries(dayDrafts)) {
      const num = parseFloat(txt.replace(",", "."))
      if (Number.isFinite(num) && num >= 0) {
        mergedDayOverrides[date] = num
      } else if (txt.trim() === "") {
        delete mergedDayOverrides[date]
      }
    }

    const mergedInput: ProductPlanInput = {
      ...productInput,
      dayOverrides: mergedDayOverrides,
    }

    const horizonFrom = daysAll[0]?.date ?? today
    const horizonTo = daysAll[daysAll.length - 1]?.date ?? today

    const inputs: SalesPlanInputs = {
      today,
      horizonFrom,
      horizonTo,
      deliveryDays: 3,
      returnDays: 3,
      wbInboundLagDays: 0,
      products: [mergedInput],
    }

    try {
      const result = computeSalesPlan(inputs)
      const pr = result.products[0]
      if (pr) {
        const prefix = selectedMonth.slice(0, 7)
        return pr.days.filter((d) => d.date.startsWith(prefix))
      }
    } catch {
      // fallback
    }
    return monthDays
  }

  const displayMonthDays = Object.keys(dayDrafts).length > 0 ? getMergedMonthDays() : monthDays

  const hasDayDrafts = Object.keys(dayDrafts).length > 0
  const hasLevelDrafts = Object.keys(levelDrafts).length > 0

  // ── Arrivals ─────────────────────────────────────────────────────────────
  const sortedArrivals = useMemo(
    () => [...(productInput?.arrivals ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
    [productInput],
  )

  const stockoutDate = mergedProductResult?.firstStockoutDate ?? null
  const lostUnits = mergedProductResult?.lostUnitsToStockout ?? 0
  const lostRub = mergedProductResult?.lostRubToStockout ?? 0

  // ── Метаданные ABC ───────────────────────────────────────────────────────
  const ABC_CLASSES: Record<string, string> = {
    A: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
    B: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-400",
    C: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-400",
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[95vw] xl:max-w-7xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-baseline gap-3">
            <span className="font-mono text-sm text-muted-foreground">{productSku}</span>
            <span className="truncate">{productName}</span>
          </DialogTitle>

          {/* Мета-строка */}
          {productInput && (
            <div className="flex gap-3 flex-wrap text-xs text-muted-foreground mt-1">
              {abcStatus && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ABC_CLASSES[abcStatus] ?? ""}`}
                >
                  ABC: {abcStatus}
                </span>
              )}
              <span>Сток: {productInput.stockNow}</span>
              <span>
                Скорость: {productInput.baselineOrdersPerDay.toFixed(1)} зак/день (baseline)
              </span>
              <span>
                % выкупа: {(productInput.buyoutPct * 100).toFixed(1)}% ({productInput.buyoutSource})
              </span>
            </div>
          )}
        </DialogHeader>

        {loading && (
          <div className="py-12 text-center text-sm text-muted-foreground">Загрузка…</div>
        )}
        {loadError && (
          <div className="py-6 text-center text-sm text-destructive">{loadError}</div>
        )}

        {!loading && !loadError && productInput && (
          <div className="space-y-6">
            {/* ── 2. ГЛАВНЫЙ ГРАФИК ─────────────────────────────────────────── */}
            <section>
              <h3 className="text-sm font-medium mb-2">График горизонта</h3>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={340}>
                  <ComposedChart data={chartData} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      interval={Math.max(0, Math.floor(chartData.length / 14))}
                      minTickGap={16}
                    />
                    <YAxis
                      yAxisId="units"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    />
                    <YAxis
                      yAxisId="stock"
                      orientation="right"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />

                    {/* Факт — только прошедшие дни */}
                    <Bar
                      yAxisId="units"
                      dataKey="fact"
                      name="Факт, шт/день"
                      fill="var(--chart-1)"
                    />

                    {/* План */}
                    <Bar
                      yAxisId="units"
                      dataKey="plan"
                      name="План, шт/день"
                      fill="var(--chart-2)"
                      opacity={0.75}
                    />

                    {/* Сток — правая ось */}
                    <Line
                      yAxisId="stock"
                      dataKey="stock"
                      name="Сток (расч)"
                      type="monotone"
                      stroke="var(--chart-iu)"
                      strokeWidth={1.5}
                      dot={false}
                    />

                    {/* ReferenceLine «сегодня» */}
                    {(() => {
                      const todayPoint = chartData.find((d) => d.date === today)
                      return todayPoint ? (
                        <ReferenceLine
                          yAxisId="units"
                          x={todayPoint.label}
                          stroke="var(--muted-foreground)"
                          strokeDasharray="4 4"
                          label={{
                            value: "сегодня",
                            position: "top",
                            fontSize: 10,
                            fill: "var(--muted-foreground)",
                          }}
                        />
                      ) : null
                    })()}

                    {/* Приходы */}
                    {sortedArrivals.map((arrival) => {
                      const point = chartData.find((d) => d.date === arrival.date)
                      if (!point) return null
                      const isVirtual = arrival.source === "virtual"
                      const labelText =
                        sortedArrivals.length > 6
                          ? `×${arrival.qty}`
                          : `↓${arrival.qty}`
                      return (
                        <ReferenceLine
                          key={`${arrival.refId}-${arrival.date}`}
                          yAxisId="units"
                          x={point.label}
                          stroke={isVirtual ? "var(--chart-iu)" : "var(--chart-2)"}
                          strokeDasharray={isVirtual ? "4 4" : undefined}
                          label={{
                            value: labelText,
                            position: "top",
                            fontSize: 9,
                            fill: "var(--muted-foreground)",
                          }}
                        />
                      )
                    })}
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">Нет данных</div>
              )}
            </section>

            {/* ── 3. СЕТКА УРОВНЕЙ ────────────────────────────────────────── */}
            <section>
              <h3 className="text-sm font-medium mb-2">Уровни продаж по месяцам</h3>
              <div className="grid grid-cols-3 xl:grid-cols-6 gap-3">
                {months.map((month) => {
                  const level = productInput.monthLevels.find((l) => l.month === month)
                  const draft = levelDrafts[month]
                  const ordersVal =
                    draft?.orders !== undefined
                      ? draft.orders
                      : level?.targetOrdersPerDay != null
                        ? String(Math.round(level.targetOrdersPerDay * 10) / 10)
                        : ""
                  const priceVal =
                    draft?.price !== undefined
                      ? draft.price
                      : level?.priceRub != null
                        ? String(Math.round(level.priceRub))
                        : ""
                  return (
                    <div key={month} className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">
                        {monthLabel(month)}
                      </div>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={ordersVal}
                        placeholder={`авто ${productInput.baselineOrdersPerDay.toFixed(1)}`}
                        disabled={readOnly}
                        onChange={(e) =>
                          setLevelDrafts((prev) => ({
                            ...prev,
                            [month]: {
                              orders: e.target.value,
                              price: prev[month]?.price ?? "",
                            },
                          }))
                        }
                        className="h-8 w-full rounded-md border bg-background px-2 text-sm tabular-nums disabled:opacity-50"
                      />
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={priceVal}
                        placeholder={`≈${Math.round(productInput.avgPriceRub)}`}
                        disabled={readOnly}
                        onChange={(e) =>
                          setLevelDrafts((prev) => ({
                            ...prev,
                            [month]: {
                              orders: prev[month]?.orders ?? "",
                              price: e.target.value,
                            },
                          }))
                        }
                        className="h-8 w-full rounded-md border bg-background px-2 text-sm tabular-nums disabled:opacity-50"
                      />
                    </div>
                  )
                })}
              </div>

              {/* Итоги H2 */}
              <div className="mt-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  План H2: {fmtRub(h2Totals.totalRub)} · {Math.round(h2Totals.totalUnits)} шт
                </span>
              </div>

              {/* Кнопки уровней */}
              <div className="flex justify-end gap-2 mt-3">
                {!readOnly && (
                  <button
                    type="button"
                    onClick={handleSaveLevels}
                    disabled={!hasLevelDrafts}
                    className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
                  >
                    Сохранить
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="h-9 px-4 rounded-md border text-sm hover:bg-muted transition-colors"
                >
                  Закрыть
                </button>
              </div>
            </section>

            {/* ── 4. ПРИХОДЫ ──────────────────────────────────────────────── */}
            <section>
              <h3 className="text-sm font-medium mb-2">Приходы партий</h3>
              {sortedArrivals.length === 0 ? (
                <div className="text-sm text-muted-foreground">Приходов в горизонте нет</div>
              ) : (
                <ul className="space-y-1">
                  {sortedArrivals.map((a) => (
                    <li key={`${a.refId}-${a.date}`} className="text-sm tabular-nums">
                      {formatDateShort(a.date)} — {a.qty} шт —{" "}
                      {a.source === "purchase" || a.source === "incoming-legacy" ? (
                        <span className="text-blue-600 dark:text-blue-400">📦 закупка</span>
                      ) : (
                        <span className="text-violet-600 dark:text-violet-400">◇ виртуальная</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* Стокаут */}
              {stockoutDate && (
                <div className="mt-2 text-sm text-destructive">
                  Стокаут: {formatDateShort(stockoutDate)} · потеряно ≈ {Math.round(lostUnits)} шт
                  {lostRub > 0 && <span> / {fmtRub(lostRub)}</span>}
                </div>
              )}
            </section>

            {/* ── 5. ПРАВКА ПО ДНЯМ ───────────────────────────────────────── */}
            <details className="rounded-md border">
              <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">
                Правка по дням
                {hasDayDrafts && (
                  <span className="ml-2 text-xs text-primary">• есть несохранённые правки</span>
                )}
              </summary>
              <div className="p-3 space-y-3">
                {/* Селектор месяца */}
                <div className="flex items-center gap-3">
                  <label className="text-sm text-muted-foreground">Месяц:</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => {
                      setSelectedMonth(e.target.value)
                      loadMonth(e.target.value)
                    }}
                    className="h-8 rounded-md border bg-background px-2 text-sm"
                  >
                    {months.map((m) => (
                      <option key={m} value={m}>
                        {monthLabel(m)}
                      </option>
                    ))}
                  </select>
                </div>

                {monthLoading && (
                  <div className="py-4 text-center text-sm text-muted-foreground">Загрузка…</div>
                )}
                {monthError && (
                  <div className="py-2 text-center text-sm text-destructive">{monthError}</div>
                )}

                {!monthLoading && !monthError && displayMonthDays.length > 0 && (
                  <div className="overflow-auto max-h-[360px] border rounded">
                    <table className="w-full border-separate border-spacing-0 text-xs">
                      <thead className="bg-background sticky top-0">
                        <tr>
                          <th className="sticky top-0 bg-background border-b px-2 h-8 text-left font-medium">
                            Дата
                          </th>
                          <th className="sticky top-0 bg-background border-b px-2 h-8 text-right font-medium">
                            План шт{!readOnly && " (правка)"}
                          </th>
                          <th className="sticky top-0 bg-background border-b px-2 h-8 text-right font-medium">
                            Сток(расч)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayMonthDays.map((d) => {
                          const hasOverride =
                            productInput.dayOverrides[d.date] !== undefined
                          const hasDraft = dayDrafts[d.date] !== undefined
                          return (
                            <tr key={d.date} className="hover:bg-muted/30">
                              <td className="px-2 py-1 border-b">{formatDateFull(d.date)}</td>
                              <td className="px-2 py-1 border-b text-right">
                                {!readOnly ? (
                                  <input
                                    type="number"
                                    step="1"
                                    min="0"
                                    value={
                                      dayDrafts[d.date] ??
                                      (hasOverride
                                        ? String(productInput.dayOverrides[d.date])
                                        : String(Math.round(d.ordersUnits)))
                                    }
                                    onChange={(e) =>
                                      setDayDrafts((prev) => ({
                                        ...prev,
                                        [d.date]: e.target.value,
                                      }))
                                    }
                                    className="h-6 w-16 rounded border bg-background px-1 text-right tabular-nums"
                                  />
                                ) : (
                                  <span className="tabular-nums">
                                    {Math.round(d.ordersUnits)}
                                    {(hasOverride || hasDraft) && (
                                      <span className="ml-0.5 text-primary">*</span>
                                    )}
                                  </span>
                                )}
                              </td>
                              <td
                                className={`px-2 py-1 border-b text-right tabular-nums ${
                                  d.stockEnd <= 0 ? "text-destructive font-medium" : ""
                                }`}
                              >
                                {Math.round(d.stockEnd)}
                                {d.stockEnd <= 0 && (
                                  <span className="ml-1 text-[10px]">⚠</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {!monthLoading && !monthError && displayMonthDays.length === 0 && (
                  <div className="py-4 text-center text-sm text-muted-foreground">
                    Нет данных для этого месяца
                  </div>
                )}

                {/* Кнопка сохранения дней */}
                {!readOnly && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveDays}
                      disabled={!hasDayDrafts}
                      className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
                    >
                      Сохранить и пересчитать
                    </button>
                  </div>
                )}
              </div>
            </details>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
