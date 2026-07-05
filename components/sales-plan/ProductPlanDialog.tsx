"use client"

import { useState, useTransition, useCallback } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
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
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import { getProductPlanDays, saveDayOverrides, saveProductPlanParams } from "@/app/actions/sales-plan"
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

// ── Типы ─────────────────────────────────────────────────────────────────────

type Tab = "days" | "params" | "chart"

interface ProductPlanDialogProps {
  productId: string
  productName: string
  productSku: string
  months: string[]
  readOnly: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  today: string
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
}: ProductPlanDialogProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>("days")
  const [selectedMonth, setSelectedMonth] = useState<string>(months[0] ?? "")

  // Загруженные данные дней
  const [days, setDays] = useState<PlanDayRow[]>([])
  const [productInput, setProductInput] = useState<ProductPlanInput | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Локальные правки дней для realtime
  const [dayDrafts, setDayDrafts] = useState<Record<string, string>>({})

  const [, startTransition] = useTransition()

  // Загрузка данных месяца
  const loadMonth = useCallback(async (month: string) => {
    setLoading(true)
    setLoadError(null)
    setDayDrafts({})
    try {
      const result = await getProductPlanDays(productId, month)
      if (result.ok) {
        setDays(result.days)
        setProductInput(result.productInput)
      } else {
        setLoadError(result.error)
      }
    } catch (e) {
      setLoadError(String(e))
    } finally {
      setLoading(false)
    }
  }, [productId])

  // При открытии диалога загружаем первый месяц
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && months.length > 0) {
      const m = months[0]
      setSelectedMonth(m)
      loadMonth(m)
    }
    if (!nextOpen) {
      setDayDrafts({})
    }
    onOpenChange(nextOpen)
  }

  // Смена месяца
  function handleMonthChange(month: string) {
    setSelectedMonth(month)
    loadMonth(month)
  }

  // Realtime пересчёт Сток(расч) при изменении дневного инпута
  // Создаём мерженный productInput с dayDrafts
  function getMergedDays(): PlanDayRow[] {
    if (!productInput) return days

    // Мержим dayDrafts в productInput.dayOverrides
    const mergedOverrides = { ...productInput.dayOverrides }
    for (const [date, txt] of Object.entries(dayDrafts)) {
      const num = parseFloat(txt.replace(",", "."))
      if (Number.isFinite(num) && num >= 0) {
        mergedOverrides[date] = num
      } else if (txt.trim() === "") {
        delete mergedOverrides[date]
      }
    }

    const mergedInput: ProductPlanInput = {
      ...productInput,
      dayOverrides: mergedOverrides,
    }

    // Получаем horizon из первого и последнего дней
    const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date))
    const horizonFrom = sortedDays[0]?.date ?? today
    const horizonTo = sortedDays[sortedDays.length - 1]?.date ?? today

    // Собираем SalesPlanInputs для computeSalesPlan (клиентский pure)
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
      // Ошибка пересчёта — возвращаем оригинальные дни
    }
    return days
  }

  const displayDays = Object.keys(dayDrafts).length > 0 ? getMergedDays() : days

  // Сохранить дневные правки
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
      onOpenChange(false)
      router.refresh()
    })
  }

  // Метки месяцев для селектора
  const MONTH_LABEL: Record<string, string> = {
    "2026-07-01": "Июль", "2026-08-01": "Август", "2026-09-01": "Сентябрь",
    "2026-10-01": "Октябрь", "2026-11-01": "Ноябрь", "2026-12-01": "Декабрь",
  }
  function monthLabel(m: string) { return MONTH_LABEL[m] ?? m.slice(0, 7) }

  const hasDayDrafts = Object.keys(dayDrafts).length > 0

  // График данных
  const chartData = displayDays.map((d) => ({
    date: formatDateShort(d.date),
    план: Math.round(d.ordersUnits),
  }))

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-baseline gap-3">
            <span className="font-mono text-sm text-muted-foreground">{productSku}</span>
            <span className="truncate">{productName}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Табы */}
        <div className="flex gap-1 border-b -mt-2">
          {(["days", "params", "chart"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "days" ? "Дни" : tab === "params" ? "Параметры" : "График"}
            </button>
          ))}
        </div>

        {/* Вкладка «Дни» */}
        {activeTab === "days" && (
          <div className="space-y-3">
            {/* Селектор месяца */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-muted-foreground">Месяц:</label>
              <select
                value={selectedMonth}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-sm"
              >
                {months.map((m) => (
                  <option key={m} value={m}>{monthLabel(m)}</option>
                ))}
              </select>
              {hasDayDrafts && (
                <span className="text-xs text-primary">Есть несохранённые правки</span>
              )}
            </div>

            {loading && (
              <div className="py-8 text-center text-sm text-muted-foreground">Загрузка…</div>
            )}
            {loadError && (
              <div className="py-4 text-center text-sm text-red-500">{loadError}</div>
            )}

            {!loading && !loadError && displayDays.length > 0 && (
              <div className="overflow-auto max-h-[400px] border rounded">
                <table className="w-full border-separate border-spacing-0 text-xs">
                  <thead className="bg-background sticky top-0">
                    <tr>
                      <th className="sticky top-0 bg-background border-b px-2 h-8 text-left font-medium">Дата</th>
                      <th className="sticky top-0 bg-background border-b px-2 h-8 text-right font-medium">
                        План шт{!readOnly && " (правка)"}
                      </th>
                      <th className="sticky top-0 bg-background border-b px-2 h-8 text-right font-medium">План ₽</th>
                      <th className="sticky top-0 bg-background border-b px-2 h-8 text-right font-medium">Сток(расч)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayDays.map((d) => {
                      const hasOverride = productInput?.dayOverrides[d.date] !== undefined
                      const hasDraft = dayDrafts[d.date] !== undefined
                      return (
                        <tr key={d.date} className="hover:bg-muted/30">
                          <td className="px-2 py-1 border-b">
                            {formatDateFull(d.date)}
                          </td>
                          <td className="px-2 py-1 border-b text-right">
                            {!readOnly ? (
                              <input
                                type="number"
                                step="1"
                                min="0"
                                value={dayDrafts[d.date] ?? (hasOverride ? String(productInput!.dayOverrides[d.date]) : String(Math.round(d.ordersUnits)))}
                                onChange={(e) => {
                                  setDayDrafts((prev) => ({ ...prev, [d.date]: e.target.value }))
                                }}
                                className="h-6 w-16 rounded border bg-background px-1 text-right tabular-nums"
                              />
                            ) : (
                              <span className="tabular-nums">
                                {Math.round(d.ordersUnits)}
                                {(hasOverride || hasDraft) && <span className="ml-0.5 text-primary">*</span>}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1 border-b text-right tabular-nums">
                            {fmtRub(d.buyoutsRub)}
                          </td>
                          <td className={`px-2 py-1 border-b text-right tabular-nums ${
                            d.stockEnd <= 0 ? "text-red-500 font-medium" : ""
                          }`}>
                            {Math.round(d.stockEnd)}
                            {d.stockEnd <= 0 && <span className="ml-1 text-[10px]">⚠</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && !loadError && displayDays.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Нет данных для этого месяца
              </div>
            )}

            {/* Кнопки */}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="h-9 px-4 rounded-md border text-sm hover:bg-muted transition-colors"
              >
                Закрыть
              </button>
              {!readOnly && (
                <button
                  type="button"
                  onClick={handleSaveDays}
                  disabled={!hasDayDrafts}
                  className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                  Сохранить и пересчитать
                </button>
              )}
            </div>
          </div>
        )}

        {/* Вкладка «Параметры» */}
        {activeTab === "params" && (
          <ParamsTab
            productId={productId}
            productInput={productInput}
            months={months}
            monthLabel={monthLabel}
            readOnly={readOnly}
            onClose={() => onOpenChange(false)}
            onSaved={() => router.refresh()}
          />
        )}

        {/* Вкладка «График» */}
        {activeTab === "chart" && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-sm text-muted-foreground">Месяц:</label>
              <select
                value={selectedMonth}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-sm"
              >
                {months.map((m) => (
                  <option key={m} value={m}>{monthLabel(m)}</option>
                ))}
              </select>
            </div>
            {loading && (
              <div className="py-8 text-center text-sm text-muted-foreground">Загрузка…</div>
            )}
            {!loading && chartData.length > 0 && (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                  <Tooltip
                    formatter={(value: unknown) => [fmtNum(Number(value)), "Заказы шт"]}
                  />
                  <Bar dataKey="план" fill="var(--primary)" opacity={0.8} />
                  {/* ReferenceLine для приходов — Wave 6 */}
                  {displayDays.some((d) => d.stockEnd <= 0) && (
                    <ReferenceLine y={0} stroke="var(--destructive)" strokeDasharray="3 3" />
                  )}
                </BarChart>
              </ResponsiveContainer>
            )}
            {!loading && chartData.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">Нет данных</div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Вкладка «Параметры» ────────────────────────────────────────────────────────

interface ParamsTabProps {
  productId: string
  productInput: ProductPlanInput | null
  months: string[]
  monthLabel: (m: string) => string
  readOnly: boolean
  onClose: () => void
  onSaved: () => void
}

function ParamsTab({ productId, productInput, months, monthLabel, readOnly, onClose, onSaved }: ParamsTabProps) {
  const [selectedMonth, setSelectedMonth] = useState(months[0] ?? "")
  const [priceRub, setPriceRub] = useState<string>("")
  const [isPending, startTransition] = useTransition()

  // Заполнить из productInput
  const currentLevel = productInput?.monthLevels.find((l) => l.month === selectedMonth)
  const displayPriceRub = priceRub !== "" ? priceRub : (currentLevel?.priceRub?.toFixed(0) ?? "")
  const avgPriceRub = productInput?.avgPriceRub ?? 0
  const buyoutPct = (productInput?.buyoutPct ?? 0) * 100

  function handleSave() {
    const price = displayPriceRub.trim() === "" ? null : parseFloat(displayPriceRub.replace(",", "."))
    startTransition(async () => {
      const r = await saveProductPlanParams({
        productId,
        month: selectedMonth,
        priceRub: price,
        buyoutPct: null,
      })
      if (r.ok) {
        onSaved()
        onClose()
      } else {
        // Импорт toast не нужен — это внутренний компонент
        console.error(r.error)
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm text-muted-foreground">Месяц:</label>
        <select
          value={selectedMonth}
          onChange={(e) => { setSelectedMonth(e.target.value); setPriceRub("") }}
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="space-y-1">
          <label className="text-muted-foreground text-xs">Плановая цена ₽ (override)</label>
          <input
            type="number"
            step="1"
            min="0"
            value={displayPriceRub}
            disabled={readOnly}
            onChange={(e) => setPriceRub(e.target.value)}
            placeholder={`≈ ${Math.round(avgPriceRub)} (из funnel)`}
            className="h-8 w-full rounded-md border bg-background px-2 text-sm tabular-nums disabled:opacity-50"
          />
        </div>
        <div className="space-y-1">
          <label className="text-muted-foreground text-xs">% выкупа (read-only)</label>
          <div className="h-8 flex items-center text-sm tabular-nums text-muted-foreground">
            {buyoutPct.toFixed(1)}%
            <span className="ml-2 text-[10px]">({productInput?.buyoutSource ?? "—"})</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-9 px-4 rounded-md border text-sm hover:bg-muted transition-colors"
        >
          Закрыть
        </button>
        {!readOnly && (
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            Сохранить
          </button>
        )}
      </div>
    </div>
  )
}
