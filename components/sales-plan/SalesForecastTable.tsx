"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProductForecastDialog } from "./ProductForecastDialog"
import type { ProductForecast } from "@/lib/sales-forecast"
import { ArrowUpDown, RotateCcw, Calculator } from "lucide-react"
import {
  saveBaselineOverrides,
  clearBaselineOverrides,
  saveLeadTimes,
  bulkUpdateArrivalDates,
} from "@/app/actions/sales-plan"

type SortKey =
  | "hierarchy" // дефолт: порядок как в /prices/wb (Направление→Бренд→Категория→Подкатегория→name)
  | "salesRub"
  | "salesUnits"
  | "ordersUnits"
  | "stockNow"
  | "baseline"
  | "buyoutPct"
  | "endStockUnits"
  | "endStockRub"
  | "name"
  | "sku"

interface Props {
  products: ProductForecast[]
  endStockDateLabel: string
  currentOverrides: Record<string, number>
  /** Текущие применённые lead times (с учётом override) */
  currentDeliveryDays: number
  currentReturnDays: number
  /** Базовые значения (для сброса) */
  defaultDeliveryDays: number
  defaultReturnDays: number
}

function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

// Адаптивный формат: целые если |n| >= 2, иначе 1 знак после запятой.
// Применяется к заказам / выкупам / зак-в-день в таблице.
function fmtAdaptive(n: number): string {
  return Math.abs(n) >= 2 ? fmtNum(Math.round(n), 0) : fmtNum(n, 1)
}

function fmtRub(n: number): string {
  if (Math.abs(n) >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} М`
  }
  if (Math.abs(n) >= 10_000) {
    return `${(n / 1_000).toLocaleString("ru-RU", { maximumFractionDigits: 0 })} К`
  }
  return fmtNum(Math.round(n))
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + "%"
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso + "T00:00:00Z")
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  })
}

export function SalesForecastTable({
  products,
  endStockDateLabel,
  currentOverrides,
  currentDeliveryDays,
  currentReturnDays,
  defaultDeliveryDays,
  defaultReturnDays,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [sortKey, setSortKey] = useState<SortKey>("hierarchy")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [activeProduct, setActiveProduct] = useState<ProductForecast | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  // Pending drafts:
  //   drafts[pid] — корректировка заказов/день (planned либо baseline)
  //   arrivalDrafts[pid] — изменения даты прихода (глобально, в БД)
  //   deliveryDraft / returnDraft — кастомные lead times
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const [pid, v] of Object.entries(currentOverrides)) {
      init[pid] = String(v)
    }
    return init
  })
  const [arrivalDrafts, setArrivalDrafts] = useState<Record<string, string>>({})
  const [deliveryDraft, setDeliveryDraft] = useState<string>(
    String(currentDeliveryDays),
  )
  const [returnDraft, setReturnDraft] = useState<string>(
    String(currentReturnDays),
  )

  // Текст драфта для конкретной строки: pending → currentOverride → ""
  function draftValueFor(pid: string): string {
    if (Object.prototype.hasOwnProperty.call(drafts, pid)) return drafts[pid]
    return currentOverrides[pid] !== undefined ? String(currentOverrides[pid]) : ""
  }

  function setDraft(pid: string, value: string) {
    setDrafts((prev) => ({ ...prev, [pid]: value }))
  }

  // Дата прихода drafts (yyyy-mm-dd или "" → сбросить)
  function arrivalDraftFor(p: ProductForecast): string {
    if (Object.prototype.hasOwnProperty.call(arrivalDrafts, p.productId))
      return arrivalDrafts[p.productId]
    return p.arrivalDate ?? ""
  }
  function setArrivalDraft(pid: string, value: string) {
    setArrivalDrafts((prev) => ({ ...prev, [pid]: value }))
  }

  // Подсчёт «грязного» состояния:
  // 1) baseline-корректировки vs currentOverrides
  // 2) arrival drafts vs текущее p.arrivalDate
  // 3) deliveryDraft / returnDraft vs currentDeliveryDays / currentReturnDays
  const productById = useMemo(() => {
    const m = new Map<string, ProductForecast>()
    for (const p of products) m.set(p.productId, p)
    return m
  }, [products])

  const pendingChangedCount = useMemo(() => {
    let cnt = 0
    // baseline overrides
    for (const [pid, txt] of Object.entries(drafts)) {
      const parsed = txt.trim() === "" ? null : parseFloat(txt.replace(",", "."))
      const cur = currentOverrides[pid] ?? null
      if (parsed === null && cur === null) continue
      if (parsed === null && cur !== null) {
        cnt++
        continue
      }
      if (parsed !== null && cur === null) {
        cnt++
        continue
      }
      if (parsed !== null && cur !== null && Math.abs(parsed - cur) > 1e-6) {
        cnt++
      }
    }
    // arrival drafts
    for (const [pid, txt] of Object.entries(arrivalDrafts)) {
      const product = productById.get(pid)
      const cur = product?.arrivalDate ?? ""
      const next = txt.trim()
      if (next !== cur) cnt++
    }
    // lead times
    const delNum = parseInt(deliveryDraft, 10)
    const retNum = parseInt(returnDraft, 10)
    if (
      Number.isFinite(delNum) &&
      delNum >= 0 &&
      delNum !== currentDeliveryDays
    ) {
      cnt++
    }
    if (
      Number.isFinite(retNum) &&
      retNum >= 0 &&
      retNum !== currentReturnDays
    ) {
      cnt++
    }
    return cnt
  }, [
    drafts,
    arrivalDrafts,
    deliveryDraft,
    returnDraft,
    currentOverrides,
    currentDeliveryDays,
    currentReturnDays,
    productById,
  ])

  const hasActiveOverrides = Object.keys(currentOverrides).length > 0
  const hasCustomLeadTimes =
    currentDeliveryDays !== defaultDeliveryDays ||
    currentReturnDays !== defaultReturnDays

  function applyRecalc() {
    // 1) Baseline overrides
    const finalOverrides: Record<string, number> = {}
    for (const [pid, txt] of Object.entries(drafts)) {
      const trimmed = txt.trim().replace(",", ".")
      if (trimmed === "") continue
      const num = parseFloat(trimmed)
      if (!Number.isFinite(num) || num < 0) continue
      finalOverrides[pid] = num
    }
    // 2) Arrival drafts: только реальные изменения отправляем
    const arrivalUpdates: Record<string, string | null> = {}
    for (const [pid, txt] of Object.entries(arrivalDrafts)) {
      const product = productById.get(pid)
      const cur = product?.arrivalDate ?? ""
      const next = txt.trim()
      if (next === cur) continue
      arrivalUpdates[pid] = next === "" ? null : next
    }
    // 3) Lead times
    const delNum = parseInt(deliveryDraft, 10)
    const retNum = parseInt(returnDraft, 10)
    const validLeadTimes =
      Number.isFinite(delNum) &&
      delNum >= 0 &&
      Number.isFinite(retNum) &&
      retNum >= 0
    startTransition(async () => {
      const r1 = await saveBaselineOverrides(finalOverrides)
      if (!r1.ok) {
        toast.error(r1.error)
        return
      }
      if (validLeadTimes) {
        const r2 = await saveLeadTimes({
          deliveryDays: delNum,
          returnDays: retNum,
        })
        if (!r2.ok) {
          toast.error(r2.error)
          return
        }
      }
      if (Object.keys(arrivalUpdates).length > 0) {
        const r3 = await bulkUpdateArrivalDates(arrivalUpdates)
        if (!r3.ok) {
          toast.error(r3.error)
          return
        }
      }
      toast.success("Модель пересчитана")
      setArrivalDrafts({})
      router.refresh()
    })
  }

  function applyReset() {
    if (
      !confirm("Сбросить все корректировки и вернуться к базовым настройкам?")
    ) {
      return
    }
    startTransition(async () => {
      const res = await clearBaselineOverrides()
      if (res.ok) {
        toast.success("Корректировки сброшены (даты прихода — без изменений, они глобальные)")
        setDrafts({})
        setArrivalDrafts({})
        setDeliveryDraft(String(defaultDeliveryDays))
        setReturnDraft(String(defaultReturnDays))
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  const sorted = useMemo(() => {
    // hierarchy = просто массив в том порядке, в котором пришёл с сервера
    // (там уже PRODUCT_HIERARCHY_ORDER_BY)
    if (sortKey === "hierarchy") return products
    const accessor: Record<Exclude<SortKey, "hierarchy">, (p: ProductForecast) => number | string> = {
      salesRub: (p) => p.salesRub,
      salesUnits: (p) => p.salesUnits,
      ordersUnits: (p) => p.ordersUnits,
      stockNow: (p) => p.stockNow,
      baseline: (p) => p.baselineUsed,
      buyoutPct: (p) => p.buyoutPct,
      endStockUnits: (p) => p.endStockUnits,
      endStockRub: (p) => p.endStockRub,
      name: (p) => p.name.toLocaleLowerCase("ru"),
      sku: (p) => p.sku,
    }
    const arr = [...products]
    arr.sort((a, b) => {
      const av = accessor[sortKey](a)
      const bv = accessor[sortKey](b)
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv), "ru")
        : String(bv).localeCompare(String(av), "ru")
    })
    return arr
  }, [products, sortKey, sortDir])

  function toggleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc")
    } else {
      setSortKey(k)
      setSortDir(k === "name" || k === "sku" ? "asc" : "desc")
    }
  }

  function open(p: ProductForecast) {
    setActiveProduct(p)
    setDialogOpen(true)
  }

  const totalRub = products.reduce((s, p) => s + p.salesRub, 0)
  const totalUnits = products.reduce((s, p) => s + p.salesUnits, 0)
  const totalOrders = products.reduce((s, p) => s + p.ordersUnits, 0)
  const totalEndStockUnits = products.reduce((s, p) => s + p.endStockUnits, 0)
  const totalEndStockRub = products.reduce((s, p) => s + p.endStockRub, 0)

  return (
    <>
      <div className="flex-none flex items-center justify-between gap-3 flex-wrap rounded-md border bg-muted/30 p-3">
        <div className="flex items-center gap-4 flex-wrap text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">К клиенту:</span>
            <Input
              type="number"
              min={0}
              max={60}
              step={1}
              value={deliveryDraft}
              onChange={(e) => setDeliveryDraft(e.target.value)}
              disabled={isPending}
              className={`h-7 w-14 text-right tabular-nums ${currentDeliveryDays !== defaultDeliveryDays ? "border-blue-500 text-blue-600 dark:text-blue-500" : ""}`}
            />
            <span className="text-muted-foreground">дн</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">От клиента:</span>
            <Input
              type="number"
              min={0}
              max={60}
              step={1}
              value={returnDraft}
              onChange={(e) => setReturnDraft(e.target.value)}
              disabled={isPending}
              className={`h-7 w-14 text-right tabular-nums ${currentReturnDays !== defaultReturnDays ? "border-blue-500 text-blue-600 dark:text-blue-500" : ""}`}
            />
            <span className="text-muted-foreground">дн</span>
          </div>
          <div className="text-muted-foreground">
            {hasActiveOverrides && (
              <span className="text-blue-600 dark:text-blue-500 font-medium">
                · Корректировок: {Object.keys(currentOverrides).length}
              </span>
            )}
            {hasCustomLeadTimes && (
              <span className="text-blue-600 dark:text-blue-500 font-medium ml-1">
                · lead-times изменены
              </span>
            )}
            {pendingChangedCount > 0 && (
              <span className="ml-2 text-amber-600 dark:text-amber-500 font-medium">
                · Несохранённых: {pendingChangedCount}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={applyReset}
            disabled={isPending || (!hasActiveOverrides && !hasCustomLeadTimes)}
            className="gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Вернуться к базовым
          </Button>
          <Button
            size="sm"
            onClick={applyRecalc}
            disabled={isPending || pendingChangedCount === 0}
            className="gap-1.5"
          >
            <Calculator className="h-3.5 w-3.5" />
            Пересчитать модель
            {pendingChangedCount > 0 && ` (${pendingChangedCount})`}
          </Button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto rounded-md border">
        <table className="w-full caption-bottom text-sm border-separate border-spacing-0">
          <thead className="bg-background">
            <tr>
              <TableHead className="sticky top-0 z-20 bg-background border-b w-16">Фото</TableHead>
              <SortableHead
                label="SKU"
                k="sku"
                cur={sortKey}
                dir={sortDir}
                onClick={toggleSort}
                className="w-28"
              />
              <SortableHead
                label="Наименование"
                k="name"
                cur={sortKey}
                dir={sortDir}
                onClick={toggleSort}
                className="max-w-[140px]"
              />
              <TableHead>Бренд</TableHead>
              <TableHead>Категория</TableHead>
              <SortableHead
                label="Сток"
                k="stockNow"
                cur={sortKey}
                dir={sortDir}
                onClick={toggleSort}
                className="text-right w-20"
              />
              <SortableHead
                label="База/д"
                k="baseline"
                cur={sortKey}
                dir={sortDir}
                onClick={toggleSort}
                className="text-right w-20"
              />
              <SortableHead
                label="Выкуп%"
                k="buyoutPct"
                cur={sortKey}
                dir={sortDir}
                onClick={toggleSort}
                className="text-right w-20"
              />
              <TableHead className="sticky top-0 z-20 bg-background border-b text-right w-24">Приход</TableHead>
              <SortableHead
                label="Заказы"
                k="ordersUnits"
                cur={sortKey}
                dir={sortDir}
                onClick={toggleSort}
                className="text-right w-24"
              />
              <TableHead className="sticky top-0 z-20 bg-background border-b text-right w-20" title="Текущая базовая ставка заказов в день (override → база 7д)">
                Зак/день
              </TableHead>
              <TableHead className="sticky top-0 z-20 bg-background border-b text-right w-24" title="Введи новое число и нажми «Пересчитать модель»">
                Коррект.
              </TableHead>
              <SortableHead
                label="Выкупы"
                k="salesUnits"
                cur={sortKey}
                dir={sortDir}
                onClick={toggleSort}
                className="text-right w-24"
              />
              <SortableHead
                label="Выручка"
                k="salesRub"
                cur={sortKey}
                dir={sortDir}
                onClick={toggleSort}
                className="text-right w-28"
              />
              <SortableHead
                label={`Ост ${endStockDateLabel} (шт)`}
                k="endStockUnits"
                cur={sortKey}
                dir={sortDir}
                onClick={toggleSort}
                className="text-right w-24"
              />
              <SortableHead
                label={`Ост ${endStockDateLabel} (₽)`}
                k="endStockRub"
                cur={sortKey}
                dir={sortDir}
                onClick={toggleSort}
                className="text-right w-28"
              />
            </tr>
          </thead>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={16}
                  className="text-center py-12 text-muted-foreground"
                >
                  Товары не найдены
                </TableCell>
              </TableRow>
            )}
            {sorted.map((p) => (
              <TableRow
                key={p.productId}
                onClick={() => open(p)}
                className="cursor-pointer hover:bg-muted/50"
              >
                <TableCell>
                  {p.photoUrl ? (
                    <img
                      src={p.photoUrl}
                      alt={p.name}
                      className="w-10 h-12 object-cover rounded"
                    />
                  ) : (
                    <div className="w-10 h-12 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                      —
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                <TableCell className="font-medium max-w-[140px]">
                  <span className="line-clamp-2">{p.name}</span>
                </TableCell>
                <TableCell className="text-sm">{p.brandName}</TableCell>
                <TableCell className="text-sm">
                  {p.categoryName ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtNum(p.stockNow)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtNum(p.baselineOrdersPerDay, 2)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtPct(p.buyoutPct)}
                  {p.buyoutSource === "subcategory" && (
                    <span
                      className="text-blue-500 ml-0.5"
                      title="средний % по подкатегории (нет собственной funnel-истории)"
                    >
                      ↑
                    </span>
                  )}
                  {p.buyoutSource === "global" && (
                    <span
                      className="text-amber-500 ml-0.5"
                      title="глобальное среднее (ни своей истории, ни по подкатегории)"
                    >
                      *
                    </span>
                  )}
                </TableCell>
                <TableCell
                  className="text-right text-sm whitespace-nowrap"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex flex-col items-end gap-1">
                    <span>
                      {p.arrivalQty > 0 ? (
                        fmtNum(p.arrivalQty)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </span>
                    <Input
                      type="date"
                      value={arrivalDraftFor(p)}
                      onChange={(e) =>
                        setArrivalDraft(p.productId, e.target.value)
                      }
                      disabled={isPending}
                      className={`h-6 text-[11px] w-32 ${arrivalDraftFor(p) !== (p.arrivalDate ?? "") ? "border-amber-500 text-amber-600 dark:text-amber-500" : ""}`}
                      title="Дата прихода (глобальная). После «Пересчитать модель» сохраняется в БД — откат через «Базовые» не сработает."
                    />
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtAdaptive(p.ordersUnits)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${p.rateOverride !== null ? "text-blue-600 dark:text-blue-500 font-medium" : p.plannedTargetUsed !== null ? "text-emerald-700 dark:text-emerald-500" : ""}`}
                  title={
                    p.rateOverride !== null
                      ? p.overrideAppliesTo === "planned"
                        ? `Корректировка плана активна. Базовое из 7д: ${fmtAdaptive(p.baselineOrdersPerDay)}; план до коррекции: ${p.plannedTargetPerDay != null ? fmtAdaptive(p.plannedTargetPerDay) : "—"}`
                        : `Корректировка baseline активна. 7д avg: ${fmtAdaptive(p.baselineOrdersPerDay)}`
                      : p.plannedTargetUsed !== null
                        ? `План из /purchase-plan; baseline 7д: ${fmtAdaptive(p.baselineOrdersPerDay)}`
                        : "База: avg orders/day за 7 дней (funnel)"
                  }
                >
                  {fmtAdaptive(p.effectiveRate)}
                  {p.plannedTargetUsed !== null && (
                    <span className="ml-0.5 text-[10px] opacity-70">план</span>
                  )}
                </TableCell>
                <TableCell
                  className="p-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Input
                    type="number"
                    min={0}
                    step="0.1"
                    inputMode="decimal"
                    placeholder={
                      p.plannedTargetPerDay !== null
                        ? fmtAdaptive(p.plannedTargetPerDay)
                        : fmtAdaptive(p.baselineOrdersPerDay)
                    }
                    value={draftValueFor(p.productId)}
                    onChange={(e) => setDraft(p.productId, e.target.value)}
                    disabled={isPending}
                    className="h-7 text-right tabular-nums"
                    title={
                      p.plannedTargetPerDay !== null
                        ? `Меняет ПЛАН из /purchase-plan (${fmtAdaptive(p.plannedTargetPerDay)} шт/д). Очисти → план вернётся.`
                        : `Меняет baseline (avg 7д: ${fmtAdaptive(p.baselineOrdersPerDay)} шт/д). Очисти → baseline вернётся.`
                    }
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtAdaptive(p.salesUnits)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {fmtRub(p.salesRub)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtNum(Math.round(p.endStockUnits), 0)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {fmtRub(p.endStockRub)}
                </TableCell>
              </TableRow>
            ))}
            {sorted.length > 0 && (
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell colSpan={9} className="text-right">
                  Итого по {sorted.length} товарам:
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtAdaptive(totalOrders)}
                </TableCell>
                <TableCell />
                <TableCell />
                <TableCell className="text-right tabular-nums">
                  {fmtAdaptive(totalUnits)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-500">
                  {fmtRub(totalRub)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtNum(Math.round(totalEndStockUnits), 0)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtRub(totalEndStockRub)}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
      </div>
      <ProductForecastDialog
        product={activeProduct}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  )
}

function SortableHead({
  label,
  k,
  cur,
  dir,
  onClick,
  className,
}: {
  label: string
  k: SortKey
  cur: SortKey
  dir: "asc" | "desc"
  onClick: (k: SortKey) => void
  className?: string
}) {
  const active = cur === k
  return (
    <TableHead className={`sticky top-0 z-20 bg-background border-b ${className ?? ""}`}>
      <button
        onClick={() => onClick(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${active ? "text-foreground" : "text-muted-foreground"}`}
      >
        {label}
        <ArrowUpDown
          className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40"}`}
        />
        {active && (
          <span className="text-[10px] ml-0.5">
            {dir === "asc" ? "↑" : "↓"}
          </span>
        )}
      </button>
    </TableHead>
  )
}
