"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import Image from "next/image"
import { RotateCcw, Calculator, Scale, Eraser } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TableBody, TableCell, TableRow } from "@/components/ui/table"
import { IncomingBadges, IncomingBadgesLegend } from "./IncomingBadges"
import { ProductPlanCell } from "./ProductPlanCell"
import { ProductPlanDialog } from "./ProductPlanDialog"
import { saveMonthLevels, scaleMonthLevels, resetMonthLevelsToAuto, updateProductAbcStatus, updateProductOrderEnabled } from "@/app/actions/sales-plan"
import type { ProductPlanResult, ArrivalBatch, PlanDayRow } from "@/lib/sales-plan/types"

// ── Форматирование чисел ────────────────────────────────────────────────────────

function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

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

// ── Типы ──────────────────────────────────────────────────────────────────────

// Сериализуемые факт-данные (Map→объект для RSC→client границы)
type FactMonthByProduct = Record<string, Record<string, {
  buyoutsRub: number
  ordersRub: number
  buyoutsUnits: number
  ordersUnits: number
}>>

interface ProductRow {
  productId: string
  sku: string
  name: string
  photoUrl: string | null
  stockNow: number
  baselineOrdersPerDay: number
  avgPriceRub: number
  // monthLevels как запись для быстрого lookup: month → targetOrdersPerDay
  currentLevels: Record<string, number | null>
  // dayOverrides месяца → маркер •д
  dayOverrideMonths: string[]
  arrivals: ArrivalBatch[]
  abcStatus: "A" | "B" | "C" | null
  orderEnabled: boolean
  effectiveOrderEnabled: boolean
  planResult: ProductPlanResult
}

type Mode = "compare" | "edit"

interface ProductPlanTableProps {
  products: ProductRow[]
  months: string[]        // ["2026-07-01", ..., "2026-12-01"]
  mode: Mode
  readOnly: boolean
  canManage: boolean
  factByProduct: FactMonthByProduct
  today: string
}

// ── Sticky-константы ──────────────────────────────────────────────────────────

const STICKY_TH = "sticky top-0 z-20 bg-background border-b text-xs px-2 h-8 align-middle whitespace-nowrap font-medium"
const STICKY_TD = "sticky z-10 bg-background border-r text-xs px-2 align-middle"

const ABC_CLASSES: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400",
  B: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-400",
  C: "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-400",
}

const MONTH_LABEL: Record<string, string> = {
  "2026-07-01": "Июл", "2026-08-01": "Авг", "2026-09-01": "Сен",
  "2026-10-01": "Окт", "2026-11-01": "Ноя", "2026-12-01": "Дек",
}

function monthLabel(m: string): string {
  return MONTH_LABEL[m] ?? m.slice(0, 7)
}

function daysInMonth(monthIso: string): number {
  const [y, mo] = monthIso.split("-").map(Number)
  return new Date(y, mo, 0).getDate()
}

// Агрегат факта по месяцу для товара
function getMonthFact(
  factByProduct: FactMonthByProduct,
  productId: string,
  monthIso: string,
): { buyoutsRub: number; buyoutsUnits: number } | null {
  const byDate = factByProduct[productId]
  if (!byDate) return null
  let buyoutsRub = 0, buyoutsUnits = 0, hasData = false
  const prefix = monthIso.slice(0, 7)
  for (const [date, row] of Object.entries(byDate)) {
    if (date.startsWith(prefix)) {
      buyoutsRub += row.buyoutsRub
      buyoutsUnits += row.buyoutsUnits
      hasData = true
    }
  }
  return hasData ? { buyoutsRub, buyoutsUnits } : null
}

// ── SP-16: хелперы бейджа среза ──────────────────────────────────────────────

/** Первый приход строго после reference-даты (стокаут или today). ISO или null. */
function nextArrivalAfter(arrivals: ArrivalBatch[], ref: string): string | null {
  const future = arrivals.map((a) => a.date).filter((d) => d > ref).sort()
  return future[0] ?? null
}

/** "2026-09-28" -> "28.09" */
function fmtDayMonth(iso: string): string {
  const [, m, d] = iso.split("-")
  return `${d}.${m}`
}

const MONTH_SHORT: Record<string, string> = {
  "01": "янв", "02": "фев", "03": "мар", "04": "апр", "05": "май", "06": "июн",
  "07": "июл", "08": "авг", "09": "сен", "10": "окт", "11": "ноя", "12": "дек",
}
/** "2026-09-01" -> "сен" */
function fmtMonthShort(iso: string): string {
  return MONTH_SHORT[iso.slice(5, 7)] ?? iso.slice(0, 7)
}

/**
 * Per-month срез из дней движка. Возвращает недолив ЭТОГО месяца в единицах и ₽,
 * и его долю от планового спроса месяца (rateRequested). Данные из planResult.days.
 * planUnits — Σ ordersUnits (после сток-лимита), requested — Σ rateRequested (до лимита).
 */
function monthShortfall(
  days: PlanDayRow[],
  monthPrefix: string,     // "2026-09"
  avgPriceRub: number,
): { lostUnits: number; lostRub: number; lostShare: number } {
  let requested = 0, filled = 0
  for (const d of days) {
    if (!d.date.startsWith(monthPrefix)) continue
    requested += d.rateRequested
    filled += d.ordersUnits
  }
  const lostUnits = Math.max(0, requested - filled)
  return {
    lostUnits,
    lostRub: lostUnits * avgPriceRub,
    lostShare: requested > 0 ? lostUnits / requested : 0,
  }
}

// ── ProductPlanTable ──────────────────────────────────────────────────────────

export function ProductPlanTable({
  products,
  months,
  mode,
  readOnly,
  canManage,
  factByProduct,
  today,
}: ProductPlanTableProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Bulk-drafts: Record<productId, Record<month, string>>
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({})

  // Диалог
  const [dialogProductId, setDialogProductId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Автопротяжка вперёд (D-1): по умолчанию ВКЛ, сессионное состояние
  const [distributeForward, setDistributeForward] = useState(true)

  // Сброс ручных уровней → авто
  const [isResetting, startResetTransition] = useTransition()

  // Scale месяца
  const [scaleDialogOpen, setScaleDialogOpen] = useState(false)
  const [scaleMonth, setScaleMonth] = useState<string | null>(null)
  const [scaleFactor, setScaleFactor] = useState("1.1")
  const [isScaling, startScaleTransition] = useTransition()

  // Подсчёт изменившихся ячеек (pending changed count)
  const pendingChangedCount = useMemo(() => {
    let cnt = 0
    for (const [pid, monthDrafts] of Object.entries(drafts)) {
      const product = products.find((p) => p.productId === pid)
      if (!product) continue
      for (const [month, txt] of Object.entries(monthDrafts)) {
        const parsed = txt.trim() === "" ? null : parseFloat(txt.replace(",", "."))
        const cur = product.currentLevels[month] ?? null
        if (parsed === null && cur === null) continue
        if (parsed === null && cur !== null) { cnt++; continue }
        if (parsed !== null && cur === null) { cnt++; continue }
        if (parsed !== null && cur !== null && Math.abs(parsed - cur) > 1e-6) cnt++
      }
    }
    return cnt
  }, [drafts, products])

  function setDraft(pid: string, month: string, value: string) {
    setDrafts((prev) => ({
      ...prev,
      [pid]: { ...(prev[pid] ?? {}), [month]: value },
    }))
  }

  function clearDraft(pid: string, month: string) {
    setDrafts((prev) => ({
      ...prev,
      [pid]: { ...(prev[pid] ?? {}), [month]: "" },
    }))
  }

  // «Пересчитать план (N)»
  function applyRecalc() {
    const payload: Array<{
      productId: string
      month: string
      targetOrdersPerDay: number | null
      priceRub: number | null
      buyoutPct: number | null
    }> = []

    for (const [pid, monthDrafts] of Object.entries(drafts)) {
      for (const [month, txt] of Object.entries(monthDrafts)) {
        const trimmed = txt.trim().replace(",", ".")
        const parsed = trimmed === "" ? null : parseFloat(trimmed)
        const targetOrdersPerDay = parsed !== null && Number.isFinite(parsed) && parsed >= 0
          ? parsed
          : null

        payload.push({
          productId: pid,
          month,
          targetOrdersPerDay,
          priceRub: null,
          buyoutPct: null,
        })
      }
    }

    if (payload.length === 0) return

    startTransition(async () => {
      const r = await saveMonthLevels(payload, { distributeForward, horizonMonths: months })
      if (!r.ok) {
        toast.error(r.error || "Не удалось сохранить")
        return
      }
      router.refresh()
      setDrafts({})
    })
  }

  // «Масштабировать месяц»
  function handleScale() {
    if (!scaleMonth) return
    const factor = parseFloat(scaleFactor.replace(",", "."))
    if (!Number.isFinite(factor) || factor <= 0) {
      toast.error("Введите корректный коэффициент")
      return
    }

    startScaleTransition(async () => {
      const r = await scaleMonthLevels({ month: scaleMonth, factor })
      if (!r.ok) {
        toast.error(r.error || "Не удалось масштабировать")
        return
      }
      toast.success(
        `Масштабировано: ${r.scaledCount ?? 0} с уровнем, ${r.materializedCount ?? 0} материализовано из baseline`,
      )
      setScaleDialogOpen(false)
      setScaleMonth(null)
      router.refresh()
    })
  }

  // Итоги по строкам
  const totals = useMemo(() => {
    const byMonth: Record<string, { planRub: number; factRub: number }> = {}
    let totalPlanRub = 0, totalFactRub = 0

    for (const p of products) {
      for (const month of months) {
        const mt = p.planResult.monthTotals.find((t) => t.month === month)
        const planRub = mt ? mt.buyoutsRub : 0
        const factRow = getMonthFact(factByProduct, p.productId, month)
        const factRub = factRow?.buyoutsRub ?? 0

        if (!byMonth[month]) byMonth[month] = { planRub: 0, factRub: 0 }
        byMonth[month].planRub += planRub
        byMonth[month].factRub += factRub
        totalPlanRub += planRub
        totalFactRub += factRub
      }
    }
    return { byMonth, totalPlanRub, totalFactRub }
  }, [products, months, factByProduct])

  const isEditMode = mode === "edit"

  // Открыть диалог товара
  function openDialog(productId: string) {
    setDialogProductId(productId)
    setDialogOpen(true)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Тулбар */}
      <div className="flex items-center gap-2 py-2 flex-wrap border-b px-2">
        {isEditMode && !readOnly && (
          <>
            <Button
              size="sm"
              disabled={pendingChangedCount === 0 || isPending}
              onClick={applyRecalc}
              className="gap-1.5"
            >
              <Calculator className="h-4 w-4" />
              Пересчитать план{pendingChangedCount > 0 ? ` (${pendingChangedCount})` : ""}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pendingChangedCount === 0 || isPending}
              onClick={() => setDrafts({})}
              className="gap-1.5"
            >
              <RotateCcw className="h-4 w-4" />
              Отменить правки
            </Button>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={distributeForward}
                onChange={(e) => setDistributeForward(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Распространить на последующие месяцы
            </label>
          </>
        )}
        {!readOnly && (
          <div className="flex items-center gap-1 ml-auto flex-wrap">
            <span className="text-xs text-muted-foreground">Масштабировать:</span>
            {months.map((m) => (
              <Button
                key={m}
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => {
                  setScaleMonth(m)
                  setScaleFactor("1.1")
                  setScaleDialogOpen(true)
                }}
              >
                <Scale className="h-3 w-3" />
                {monthLabel(m)}
              </Button>
            ))}
            <span className="text-xs text-muted-foreground ml-2">Сбросить ручные (месяц):</span>
            {months.map((m) => (
              <Button
                key={`reset-${m}`}
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs gap-1"
                disabled={isResetting}
                onClick={() => {
                  startResetTransition(async () => {
                    const r = await resetMonthLevelsToAuto({ month: m })
                    if (!r.ok) { toast.error(r.error || "Не удалось сбросить"); return }
                    toast.success(`Сброшено ручных уровней: ${r.deletedCount ?? 0}`)
                    router.refresh()
                  })
                }}
              >
                <Eraser className="h-3 w-3" />
                {monthLabel(m)}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Таблица */}
      <div className="overflow-auto flex-1 min-h-0">
        <table className="w-full border-separate border-spacing-0">
          <thead className="bg-background">
            <tr>
              {/* Sticky-left: Фото */}
              <th
                className={`${STICKY_TH} sticky left-0 z-30 border-r`}
                style={{ width: 60, minWidth: 60 }}
              >
                Фото
              </th>
              {/* Sticky: SKU */}
              <th
                className={`${STICKY_TH} sticky z-30 border-r`}
                style={{ left: 60, width: 90, minWidth: 90 }}
              >
                SKU
              </th>
              {/* Sticky: Название */}
              <th
                className={`${STICKY_TH} sticky z-30 border-r`}
                style={{ left: 150, width: 200, minWidth: 200 }}
              >
                Название
              </th>
              {/* Sticky: Приходы */}
              <th
                className={`${STICKY_TH} sticky z-30 border-r`}
                style={{ left: 350, width: 140, minWidth: 140 }}
              >
                Приходы
              </th>
              {/* Сток */}
              <th className={`${STICKY_TH} text-right border-r`} style={{ width: 70 }}>Сток</th>
              {/* ABC */}
              <th className={`${STICKY_TH} text-center border-r`} style={{ width: 56 }}>ABC</th>
              {/* Заказ */}
              <th className={`${STICKY_TH} text-center border-r`} style={{ width: 90 }}>Заказ</th>
              {/* Месяцы */}
              {months.map((m) => (
                <th
                  key={m}
                  className={`${STICKY_TH} text-center border-r`}
                  style={{ width: 110, minWidth: 100 }}
                >
                  {monthLabel(m)}
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    {daysInMonth(m)} дн
                  </span>
                </th>
              ))}
              {/* Итог */}
              <th className={`${STICKY_TH} text-right`} style={{ width: 100 }}>Итог ₽</th>
            </tr>
          </thead>
          <TableBody>
            {products.length === 0 && (
              <tr>
                <td colSpan={8 + months.length} className="py-12 text-center text-sm text-muted-foreground">
                  Нет товаров по выбранным фильтрам
                </td>
              </tr>
            )}
            {products.map((p) => {
              const totalRub = p.planResult.monthTotals.reduce((s, t) => s + t.buyoutsRub, 0)

              return (
                <TableRow
                  key={p.productId}
                  className="cursor-pointer group"
                  onClick={() => openDialog(p.productId)}
                >
                  {/* Фото */}
                  <TableCell
                    className={`${STICKY_TD} left-0 border-r w-[60px] p-1`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {p.photoUrl ? (
                      <Image
                        src={p.photoUrl}
                        alt={p.name}
                        width={40}
                        height={54}
                        className="object-cover rounded w-10 h-14"
                        unoptimized
                      />
                    ) : (
                      <div className="w-10 h-14 rounded bg-muted" />
                    )}
                  </TableCell>
                  {/* SKU */}
                  <TableCell
                    className={`${STICKY_TD} border-r font-mono text-xs`}
                    style={{ left: 60 }}
                  >
                    {p.sku}
                  </TableCell>
                  {/* Название */}
                  <TableCell
                    className={`${STICKY_TD} border-r`}
                    style={{ left: 150 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-start gap-1">
                      <span className="text-xs line-clamp-2 flex-1 cursor-pointer" onClick={() => openDialog(p.productId)}>{p.name}</span>
                      {!readOnly && (
                        <button
                          type="button"
                          title="Сбросить ручные уровни товара → авто"
                          disabled={isResetting}
                          onClick={(e) => {
                            e.stopPropagation()
                            startResetTransition(async () => {
                              const r = await resetMonthLevelsToAuto({ productId: p.productId })
                              if (!r.ok) { toast.error(r.error || "Не удалось сбросить"); return }
                              toast.success(`Сброшено: ${r.deletedCount ?? 0}`)
                              router.refresh()
                            })
                          }}
                          className="shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted rounded p-1"
                        >
                          <Eraser className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                  {/* Приходы */}
                  <TableCell
                    className={`${STICKY_TD} border-r`}
                    style={{ left: 350 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <IncomingBadges arrivals={p.arrivals} />
                  </TableCell>
                  {/* Сток */}
                  <TableCell className="text-right text-xs tabular-nums px-2 border-r">
                    {p.stockNow}
                  </TableCell>
                  {/* ABC */}
                  <TableCell className="text-center px-1 border-r" onClick={(e) => e.stopPropagation()}>
                    {canManage ? (
                      <select
                        value={p.abcStatus ?? ""}
                        disabled={isPending}
                        onChange={(e) => {
                          const v = e.target.value
                          const next = v === "" ? null : (v as "A" | "B" | "C")
                          startTransition(async () => {
                            const r = await updateProductAbcStatus(p.productId, next)
                            if (!r.ok) { toast.error(r.error || "Не удалось обновить ABC"); return }
                            router.refresh()
                          })
                        }}
                        className={`rounded px-1 py-0.5 text-xs font-semibold border ${p.abcStatus ? ABC_CLASSES[p.abcStatus] : "text-muted-foreground"}`}
                      >
                        <option value="">—</option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                      </select>
                    ) : (
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${p.abcStatus ? ABC_CLASSES[p.abcStatus] : "text-muted-foreground"}`}>
                        {p.abcStatus ?? "—"}
                      </span>
                    )}
                  </TableCell>
                  {/* Заказ */}
                  <TableCell className="text-center px-1 border-r" onClick={(e) => e.stopPropagation()}>
                    <label
                      className="inline-flex items-center gap-1 cursor-pointer text-xs"
                      title={p.abcStatus === "C" ? "Статус C — вне ассортимента" : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={p.effectiveOrderEnabled}
                        disabled={!canManage || isPending || p.abcStatus === "C"}
                        onChange={(e) => {
                          const enabled = e.target.checked
                          startTransition(async () => {
                            const r = await updateProductOrderEnabled(p.productId, enabled)
                            if (!r.ok) { toast.error(r.error || "Не удалось обновить флаг"); return }
                            router.refresh()
                          })
                        }}
                      />
                      <span className={p.effectiveOrderEnabled ? "" : "text-muted-foreground"}>
                        {p.effectiveOrderEnabled ? "заказ" : "нет"}
                      </span>
                    </label>
                  </TableCell>
                  {/* Месяцы */}
                  {months.map((month) => {
                    const mt = p.planResult.monthTotals.find((t) => t.month === month)
                    const planRub = mt?.buyoutsRub ?? 0
                    const planUnits = mt?.buyoutsUnits ?? 0
                    const factRow = getMonthFact(factByProduct, p.productId, month)
                    const isPast = month < today.slice(0, 8) + "01"
                    const isCurrent = month.slice(0, 7) === today.slice(0, 7)
                    const hasFactData = isPast || isCurrent
                    const pct = planRub > 0 && factRow
                      ? (factRow.buyoutsRub - planRub) / planRub
                      : null
                    const hasDayOverrides = p.dayOverrideMonths.includes(month)
                    const currentLevel = p.currentLevels[month] ?? null
                    const draftVal = drafts[p.productId]?.[month]

                    // Метрики среза (SP-16) — per-month из planResult.days, порог по доле потерь месяца.
                    const psr = p.planResult
                    const monthPrefix = month.slice(0, 7)
                    const monthPlanUnits = mt?.buyoutsUnits ?? 0
                    // Per-month недолив: Σ(rateRequested − ordersUnits) по дням ЭТОГО месяца.
                    const sf = monthShortfall(psr.days, monthPrefix, p.avgPriceRub)
                    // Стокаут пришёлся на этот месяц или раньше (для выбора reference-даты прихода)?
                    const stockoutInOrBefore = psr.firstStockoutDate != null && psr.firstStockoutDate.slice(0, 7) <= monthPrefix
                    // Ближайший приход после стокаута (или после today, если стокаут раньше горизонта):
                    const arrivalRef = psr.firstStockoutDate ?? today
                    const nextArr = nextArrivalAfter(p.arrivals, arrivalRef)
                    // Пустой месяц = ноль плана И был/есть стокаут (нет товара весь месяц).
                    const isEmptyMonth = monthPlanUnits < 0.5 && stockoutInOrBefore
                    // Срезанный месяц = собственный недолив месяца выше порога (D-4 ~2%), но не пустой.
                    const isCutMonth = !isEmptyMonth && sf.lostShare > 0.02
                    const cutPct = Math.round(sf.lostShare * 100)

                    return (
                      <TableCell
                        key={month}
                        className="text-right px-2 border-r align-top py-1"
                        onClick={(e) => {
                          if (isEditMode) e.stopPropagation()
                        }}
                      >
                        {isEditMode && !readOnly ? (
                          <ProductPlanCell
                            productId={p.productId}
                            month={month}
                            value={
                              draftVal !== undefined && draftVal.trim() !== ""
                                ? (parseFloat(draftVal.replace(",", ".")) || null)
                                : currentLevel
                            }
                            baseline={p.baselineOrdersPerDay}
                            readOnly={false}
                            hasDayOverrides={hasDayOverrides}
                            avgPriceRub={p.avgPriceRub}
                            onChange={(draft) => setDraft(p.productId, month, draft)}
                            onClear={() => clearDraft(p.productId, month)}
                          />
                        ) : (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="text-sm tabular-nums whitespace-nowrap">
                              П {fmtRub(planRub)}
                              {hasDayOverrides && (
                                <span className="ml-0.5 text-[10px] text-primary" title="Есть дневные правки">•д</span>
                              )}
                            </span>
                            {hasFactData && factRow && (
                              <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                                Ф {fmtRub(factRow.buyoutsRub)}
                              </span>
                            )}
                            {pct !== null && (
                              <span
                                className={`text-[10px] tabular-nums ${
                                  pct >= 0
                                    ? "text-emerald-600 dark:text-emerald-500"
                                    : pct >= -0.05
                                    ? "text-amber-600 dark:text-amber-500"
                                    : "text-destructive"
                                }`}
                              >
                                {pct >= 0 ? "+" : ""}{fmtPct(pct)}
                              </span>
                            )}
                            {!hasFactData && (
                              <span className="text-[10px] text-muted-foreground">
                                ≈ {fmtAdaptive(planUnits)} шт
                              </span>
                            )}
                            {isEmptyMonth && (
                              <span className="text-[11px] font-medium text-destructive whitespace-nowrap" title="План обнулён: нет товара">
                                ⚠ нет товара{nextArr ? ` · ${fmtDayMonth(nextArr)}` : ` · придёт в ${fmtMonthShort(month)}`}
                              </span>
                            )}
                            {isCutMonth && (
                              <span className="text-[11px] font-medium text-amber-600 whitespace-nowrap" title={`План месяца срезан на ${cutPct}% из-за нехватки стока`}>
                                срезано −{cutPct}%{nextArr ? ` · приход ${fmtDayMonth(nextArr)}` : ""}
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                    )
                  })}
                  {/* Итог */}
                  <TableCell className="text-right tabular-nums text-sm px-2">
                    {fmtRub(totalRub)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
          <tfoot>
            <tr>
              <td
                colSpan={4}
                className="sticky bottom-0 left-0 z-20 bg-muted border-t px-2 h-8 text-xs font-semibold"
                style={{ minWidth: 490 }}
              >
                Итого
              </td>
              <td className="sticky bottom-0 z-10 bg-muted border-t text-right tabular-nums text-xs px-2 border-r font-medium">
                {products.reduce((s, p) => s + p.stockNow, 0)}
              </td>
              <td className="sticky bottom-0 z-10 bg-muted border-t border-r" />
              <td className="sticky bottom-0 z-10 bg-muted border-t border-r" />
              {months.map((m) => {
                const t = totals.byMonth[m] ?? { planRub: 0, factRub: 0 }
                return (
                  <td key={m} className="sticky bottom-0 z-10 bg-muted border-t text-right px-2 border-r">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-xs font-semibold tabular-nums whitespace-nowrap">
                        {fmtRub(t.planRub)}
                      </span>
                      {t.factRub > 0 && (
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          Ф {fmtRub(t.factRub)}
                        </span>
                      )}
                    </div>
                  </td>
                )
              })}
              <td className="sticky bottom-0 z-10 bg-muted border-t text-right tabular-nums text-xs font-semibold px-2">
                {fmtRub(totals.totalPlanRub)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Легенда */}
      <div className="border-t px-4 py-2">
        <IncomingBadgesLegend />
      </div>

      {/* Диалог товара */}
      {dialogProductId && (
        <ProductPlanDialog
          productId={dialogProductId}
          productName={products.find((p) => p.productId === dialogProductId)?.name ?? ""}
          productSku={products.find((p) => p.productId === dialogProductId)?.sku ?? ""}
          months={months}
          readOnly={readOnly}
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) {
              // Обновляем данные после закрытия если были изменения
            }
          }}
          today={today}
        />
      )}

      {/* Диалог масштабирования */}
      {scaleDialogOpen && scaleMonth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg border shadow-xl p-6 max-w-sm w-full">
            <h3 className="font-semibold mb-4">
              Масштабировать {monthLabel(scaleMonth)} {scaleMonth.slice(0, 4)}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">
                  Коэффициент (например 1.1 = +10%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={scaleFactor}
                  onChange={(e) => setScaleFactor(e.target.value)}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm tabular-nums"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Товары с ручным уровнем — умножаются на коэффициент.
                Товары без уровня (авто) — материализуются из baseline × коэффициент.
                Дневные правки месяца не изменяются.
              </p>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setScaleDialogOpen(false)}
                >
                  Отмена
                </Button>
                <Button
                  size="sm"
                  disabled={isScaling}
                  onClick={handleScale}
                >
                  Масштабировать
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
