// components/prices/PriceCalculatorTable.tsx
// Phase 7: главная таблица раздела «Управление ценами WB».
//
// Фичи:
// - 4 sticky колонки слева: Фото / Сводка / Ярлык / Артикул (D-08)
// - Колонка «Статус цены» (current badge / promo name / calculated name)
// - 26 расчётных колонок (COLUMN_ORDER[4..29] из lib/pricing-math.ts)
// - Группировка через rowSpan (D-07):
//     Фото+Сводка — rowSpan всех строк всех карточек Product
//     Ярлык+Артикул — rowSpan ценовых строк одной WbCard
// - Indicator strips (D-10):
//     regular = border-l-4 border-l-blue-500
//     auto    = border-l-4 border-l-purple-500
//     calculated = border-l-4 border-l-amber-500
//     current = без полоски, primary Badge
// - Clickable rows → onRowClick prop (модалка подключается в плане 07-09)
// - Подсветка Прибыль/Re продаж/ROI (D-13, PRICES-16):
//     ≥0 → text-green-600 font-medium
//     <0 → text-red-600 font-medium

"use client"

import * as React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import {
  type PricingInputs,
  type PricingOutputs,
} from "@/lib/pricing-math"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { PromoTooltip } from "@/components/prices/PromoTooltip"
import { setUserPreference } from "@/app/actions/user-preferences"
import { ChevronDown, Eye } from "lucide-react"

// ──────────────────────────────────────────────────────────────────
// Types (exported для использования в плане 07-08 + плане 07-09)
// ──────────────────────────────────────────────────────────────────

export type PriceRowType = "current" | "regular" | "auto" | "calculated"

/**
 * Одна ценовая строка таблицы. Все input-поля и computed-outputs,
 * необходимые для отображения 26 расчётных колонок.
 *
 * Заполняется в плане 07-08 (RSC page) — для каждой строки вызывается
 * calculatePricing(inputs) и результат кладётся в `computed`.
 */
export interface PriceRow {
  /** Уникальный ID строки (для React key). */
  id: string
  /** Тип строки — влияет на indicator strip и label cell. */
  type: PriceRowType

  /** Название строки для колонки «Статус цены»: «Весенняя распродажа»,
   *  «Расчётная цена 1» и т.д. Для type=current не используется (рендерится Badge). */
  label: string

  // ── input-поля для 26 колонок таблицы ────────────────────────────
  /** Цена для установки (priceBeforeDiscount, ₽) — COLUMN_ORDER idx 5 */
  sellerPriceBeforeDiscount: number
  /** Скидка продавца (%) — COLUMN_ORDER idx 6 */
  sellerDiscountPct: number
  /** Скидка WB / СПП (%) — COLUMN_ORDER idx 8 */
  wbDiscountPct: number
  /** Скидка WB клуба (%) — COLUMN_ORDER idx 10 */
  clubDiscountPct: number
  /** Кошелёк WB (%) — COLUMN_ORDER idx 12 */
  walletPct: number
  /** Комиссия FBW ИУ (%) — COLUMN_ORDER idx 15 */
  commFbwPct: number
  /** ДРР (%) — COLUMN_ORDER idx 17 */
  drrPct: number
  /** Себестоимость (₽) — COLUMN_ORDER idx 21 */
  costPrice: number
  /** Процент брака (%) — используется в defectAmount, отображается только если явно включено */
  defectRatePct: number
  /** Доставка на маркетплейс (₽) — COLUMN_ORDER idx 23 */
  deliveryCostRub: number

  // ── promo metadata (только для regular/auto) ─────────────────────
  promotionDescription?: string | null
  promotionAdvantages?: readonly string[] | null
  /** ISO-строка начала акции (для отображения сроков в тултипе). */
  promotionStartDateTime?: string | null
  /** ISO-строка конца акции. */
  promotionEndDateTime?: string | null

  // ── calculated metadata (только для calculated) ──────────────────
  calculatedSlot?: 1 | 2 | 3

  /** Готовый расчёт юнит-экономики — 18 числовых полей. */
  computed: PricingOutputs

  /** Полный набор inputs, использованных при серверном расчёте.
   *  Позволяет модалке (план 07-09) начать с этих значений без повторного
   *  запроса БД. */
  inputs: PricingInputs

  /** Дополнительный контекст для модалки (план 07-09) — нужен для server
   *  actions updateProductOverride / updateSubcategoryDefault /
   *  updateCategoryDefault / updateProductDelivery. */
  context: {
    productId: string
    subcategoryId: string | null
    categoryId: string | null
  }
}

/** Группа ценовых строк, привязанных к одной WbCard. */
export interface WbCardRowGroup {
  card: {
    id: string
    nmId: number
    label?: string | null
    /** Процент выкупа за месяц (%) — COLUMN_ORDER idx 4. Может быть null. */
    buyoutPct?: number | null
  }
  priceRows: PriceRow[]
}

/** Группа карточек, привязанных к одному Product. */
export interface ProductGroup {
  product: {
    id: string
    name: string
    photoUrl: string | null
    /** Сумма WbCard.stockQty по всем карточкам Product. */
    totalStock: number
    /** Сумма WbCard.avgSalesSpeed7d по всем карточкам Product. */
    totalAvgSalesSpeed: number
  }
  cards: WbCardRowGroup[]
  /** Сумма priceRows.length по всем cards — нужно для rowSpan Фото+Сводка. */
  totalRowsInProduct: number
}

interface PriceCalculatorTableProps {
  groups: ProductGroup[]
  /** Клик по любой ценовой строке — модалка подключается в плане 07-09. */
  onRowClick?: (
    card: WbCardRowGroup["card"],
    row: PriceRow,
    productId: string,
  ) => void
  /** Сохранённые ширины столбцов из UserPreference (план 260410-mya). */
  initialColumnWidths?: Record<string, number>
  /** Список ключей скрытых колонок из UserPreference («Вид»). */
  initialHiddenColumns?: string[]
}

// ──────────────────────────────────────────────────────────────────
// Column resize constants (план 260410-mya)
// ──────────────────────────────────────────────────────────────────

/** Ключи всех 30 колонок в порядке рендера.
 *  Используется как ключ в columnWidths state + как id для drag-handle.
 *  Первые 4 — sticky колонки, остальные 26 — скроллируемые. */
const COLUMN_KEYS = [
  // Sticky (4)
  "photo",
  "svodka",
  "yarlyk",
  "artikul",
  // Scroll: Статус цены + 25 расчётных (соответствуют COLUMN_ORDER[4..29])
  "status",
  "buyoutPct",
  "sellerPriceBeforeDiscount",
  "sellerDiscountPct",
  "sellerPrice",
  "wbDiscountPct",
  "priceAfterWbDiscount",
  "clubDiscountPct",
  "priceAfterClubDiscount",
  "walletPct",
  "priceAfterWallet",
  "acquiringAmount",
  "commFbwPct",
  "commissionAmount",
  "drrPct",
  "drrAmount",
  "jemAmount",
  "transferAmount",
  "costPrice",
  "defectAmount",
  "deliveryAmount",
  "creditAmount",
  "overheadAmount",
  "taxAmount",
  "profit",
  "returnOnSalesPct",
  "roiPct",
] as const

type ColumnKey = (typeof COLUMN_KEYS)[number]

/** Дефолтные ширины колонок в px.
 *  Sum ≈ 2480px → гарантированно шире любого экрана → скролл всегда работает. */
const DEFAULT_WIDTHS: Record<ColumnKey, number> = {
  photo: 128,
  svodka: 200,
  yarlyk: 72,
  artikul: 112,
  status: 180,
  buyoutPct: 80,
  sellerPriceBeforeDiscount: 110,
  sellerDiscountPct: 90,
  sellerPrice: 100,
  wbDiscountPct: 80,
  priceAfterWbDiscount: 110,
  clubDiscountPct: 80,
  priceAfterClubDiscount: 110,
  walletPct: 80,
  priceAfterWallet: 110,
  acquiringAmount: 95,
  commFbwPct: 90,
  commissionAmount: 100,
  drrPct: 70,
  drrAmount: 95,
  jemAmount: 100,
  transferAmount: 110,
  costPrice: 100,
  defectAmount: 90,
  deliveryAmount: 100,
  creditAmount: 95,
  overheadAmount: 110,
  taxAmount: 90,
  profit: 100,
  returnOnSalesPct: 90,
  roiPct: 80,
}

const MIN_COLUMN_WIDTH = 60
const RESIZE_SAVE_DEBOUNCE_MS = 500
const PREFERENCE_KEY = "prices.wb.columnWidths"
const HIDDEN_PREFERENCE_KEY = "prices.wb.hiddenColumns"

/** Колонки, которые ПОЛЬЗОВАТЕЛЬ МОЖЕТ СКРЫТЬ через кнопку «Вид».
 *  Из списка исключены: 4 sticky колонки (photo/svodka/yarlyk/artikul) и
 *  «status» (колонка с названием строки — критична для понимания таблицы). */
const HIDEABLE_COLUMN_KEYS: ColumnKey[] = [
  "buyoutPct",
  "sellerPriceBeforeDiscount",
  "sellerDiscountPct",
  "sellerPrice",
  "wbDiscountPct",
  "priceAfterWbDiscount",
  "clubDiscountPct",
  "priceAfterClubDiscount",
  "walletPct",
  "priceAfterWallet",
  "acquiringAmount",
  "commFbwPct",
  "commissionAmount",
  "drrPct",
  "drrAmount",
  "jemAmount",
  "transferAmount",
  "costPrice",
  "defectAmount",
  "deliveryAmount",
  "creditAmount",
  "overheadAmount",
  "taxAmount",
  "profit",
  "returnOnSalesPct",
  "roiPct",
]

/** 26 скроллируемых колонок: ключ + label для рендера thead.
 *  Порядок СТРОГО соответствует порядку td в tbody. */
const SCROLL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "status", label: "Статус цены" },
  { key: "buyoutPct", label: "Процент выкупа" },
  { key: "sellerPriceBeforeDiscount", label: "Цена для установки" },
  { key: "sellerDiscountPct", label: "Скидка продавца" },
  { key: "sellerPrice", label: "Цена продавца" },
  { key: "wbDiscountPct", label: "Скидка WB" },
  { key: "priceAfterWbDiscount", label: "Цена со скидкой WB" },
  { key: "clubDiscountPct", label: "WB Клуб" },
  { key: "priceAfterClubDiscount", label: "Цена со скидкой WB клуба" },
  { key: "walletPct", label: "Кошелёк" },
  { key: "priceAfterWallet", label: "Цена с WB кошельком" },
  { key: "acquiringAmount", label: "Эквайринг" },
  { key: "commFbwPct", label: "Комиссия, %" },
  { key: "commissionAmount", label: "Комиссия, руб." },
  { key: "drrPct", label: "ДРР, %" },
  { key: "drrAmount", label: "Реклама, руб." },
  { key: "jemAmount", label: "Тариф джем, руб." },
  { key: "transferAmount", label: "К перечислению" },
  { key: "costPrice", label: "Закупка, руб." },
  { key: "defectAmount", label: "Брак, руб." },
  { key: "deliveryAmount", label: "Доставка на маркеплейс, руб." },
  { key: "creditAmount", label: "Кредит, руб." },
  { key: "overheadAmount", label: "Общие расходы, руб." },
  { key: "taxAmount", label: "Налог, руб." },
  { key: "profit", label: "Прибыль, руб." },
  { key: "returnOnSalesPct", label: "Re продаж, %" },
  { key: "roiPct", label: "ROI, %" },
]

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

/** Форматирование денег: 2 знака, ру локаль, «—» для NaN/∞. */
function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return "—"
  return n.toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Форматирование денег без дробной части (целые рубли, ру локаль).
 *  Addendum 260410-mya: только отображение, расчёт в lib/pricing-math.ts остаётся precise. */
function fmtMoneyInt(n: number): string {
  if (!Number.isFinite(n)) return "—"
  return Math.round(n).toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

/** Форматирование процентов: 1 знак, опц. знак +/− для accessibility. */
function fmtPct(n: number, withSign = false): string {
  if (!Number.isFinite(n)) return "—"
  const rounded = Math.round(n * 10) / 10
  const prefix = withSign && rounded > 0 ? "+" : ""
  return `${prefix}${rounded.toFixed(1)}%`
}

/** Форматирование процента без знака, с 1 десятичной. */
function fmtPctSimple(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return `${(Math.round(n * 10) / 10).toFixed(1)}%`
}

/** Форматирование процента без дробной части, для колонок где пользователь
 *  не хочет видеть десятые (addendum 260410-mya). */
function fmtPctInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return `${Math.round(n)}%`
}

/** Стандартный класс расчётной ячейки (text-xs, tabular-nums, right-align). */
const CELL_CLASS =
  "px-2 py-1 h-10 text-xs leading-tight tabular-nums text-right align-middle"

/** Класс для подсветки прибыли/Re/ROI. */
function profitClass(value: number): string {
  return value >= 0
    ? "text-green-600 dark:text-green-500 font-medium"
    : "text-red-600 dark:text-red-500 font-medium"
}

/** Dropdown «Вид» — выбор какие колонки скрыть в таблице. */
function ColumnVisibilityDropdown({
  hidden,
  onToggle,
  onReset,
}: {
  hidden: Set<ColumnKey>
  onToggle: (key: ColumnKey) => void
  onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const hiddenCount = hidden.size
  const labelByKey = new Map(SCROLL_COLUMNS.map((c) => [c.key, c.label]))

  return (
    <div ref={ref} className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
        className={cn(
          "gap-1.5",
          hiddenCount > 0 && "border-primary text-primary",
        )}
      >
        <Eye className="h-3.5 w-3.5" />
        {hiddenCount > 0 ? `Вид (скрыто ${hiddenCount})` : "Вид"}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            open && "rotate-180",
          )}
        />
      </Button>
      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 w-[280px] max-h-[400px] overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          <div className="flex items-center justify-between px-2 py-1.5 border-b mb-1">
            <span className="text-xs font-medium text-muted-foreground">
              Скрыть колонки
            </span>
            <button
              type="button"
              onClick={onReset}
              className="text-xs text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
              disabled={hiddenCount === 0}
            >
              Показать все
            </button>
          </div>
          {HIDEABLE_COLUMN_KEYS.map((key) => {
            const label = labelByKey.get(key) ?? key
            const isVisible = !hidden.has(key)
            return (
              <label
                key={key}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
              >
                <Checkbox
                  checked={isVisible}
                  onCheckedChange={() => onToggle(key)}
                />
                <span className="truncate">{label}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Drag handle на правой границе <th>. Захватывает mouse events и
 *  двойным кликом сбрасывает колонку к дефолту. */
function ColumnResizeHandle({
  onMouseDown,
  onDoubleClick,
}: {
  onMouseDown: (e: React.MouseEvent) => void
  onDoubleClick: (e: React.MouseEvent) => void
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 z-50"
      title="Потяните чтобы изменить ширину. Двойной клик — сброс к дефолту."
    />
  )
}

// ──────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────

export function PriceCalculatorTable({
  groups,
  onRowClick,
  initialColumnWidths,
  initialHiddenColumns,
}: PriceCalculatorTableProps) {
  // ── Column widths state (план 260410-mya) ───────────────────────
  // Merge: DEFAULT_WIDTHS + сохранённые значения (незнакомые ключи игнорируются)
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(
    () => ({
      ...DEFAULT_WIDTHS,
      ...(initialColumnWidths ?? {}),
    }),
  )

  // ── Hidden columns state (фильтр «Вид») ─────────────────────────
  const [hiddenColumns, setHiddenColumns] = useState<Set<ColumnKey>>(() => {
    const valid = (initialHiddenColumns ?? []).filter((k): k is ColumnKey =>
      HIDEABLE_COLUMN_KEYS.includes(k as ColumnKey),
    )
    return new Set(valid)
  })

  const hiddenSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleHiddenSave = useCallback((next: Set<ColumnKey>) => {
    if (hiddenSaveTimerRef.current) clearTimeout(hiddenSaveTimerRef.current)
    hiddenSaveTimerRef.current = setTimeout(async () => {
      const result = await setUserPreference(
        HIDDEN_PREFERENCE_KEY,
        Array.from(next),
      )
      if (!result.ok) {
        toast.error(`Не удалось сохранить вид таблицы: ${result.error}`)
      }
    }, 300)
  }, [])

  const toggleColumn = useCallback(
    (key: ColumnKey) => {
      setHiddenColumns((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        scheduleHiddenSave(next)
        return next
      })
    },
    [scheduleHiddenSave],
  )

  const resetHiddenColumns = useCallback(() => {
    setHiddenColumns(() => {
      const empty = new Set<ColumnKey>()
      scheduleHiddenSave(empty)
      return empty
    })
  }, [scheduleHiddenSave])

  // Debounced save таймер
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleSave = useCallback((widths: Record<ColumnKey, number>) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const result = await setUserPreference(PREFERENCE_KEY, widths)
      if (!result.ok) {
        toast.error(`Не удалось сохранить ширины: ${result.error}`)
      }
    }, RESIZE_SAVE_DEBOUNCE_MS)
  }, [])

  // Resize drag state — храним в ref чтобы не ре-рендерить на каждое движение
  const resizeStateRef = useRef<{
    key: ColumnKey
    startX: number
    startWidth: number
  } | null>(null)
  const rafIdRef = useRef<number | null>(null)

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const state = resizeStateRef.current
    if (!state) return
    if (rafIdRef.current != null) return // throttle via rAF

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null
      const s = resizeStateRef.current
      if (!s) return
      const delta = e.clientX - s.startX
      const newWidth = Math.max(MIN_COLUMN_WIDTH, s.startWidth + delta)
      setColumnWidths((prev) => ({ ...prev, [s.key]: newWidth }))
    })
  }, [])

  const handleMouseUp = useCallback(() => {
    resizeStateRef.current = null
    if (rafIdRef.current != null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
    document.removeEventListener("mousemove", handleMouseMove)
    document.removeEventListener("mouseup", handleMouseUp)
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
    // Сохранить актуальные widths (читаем из функционального setState для гарантии свежего значения)
    setColumnWidths((current) => {
      scheduleSave(current)
      return current
    })
  }, [handleMouseMove, scheduleSave])

  const startResize = useCallback(
    (e: React.MouseEvent, key: ColumnKey) => {
      e.preventDefault()
      e.stopPropagation()
      resizeStateRef.current = {
        key,
        startX: e.clientX,
        startWidth: columnWidths[key],
      }
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
    },
    [columnWidths, handleMouseMove, handleMouseUp],
  )

  const resetColumnWidth = useCallback(
    (key: ColumnKey) => {
      setColumnWidths((prev) => {
        const next = { ...prev, [key]: DEFAULT_WIDTHS[key] }
        scheduleSave(next)
        return next
      })
    },
    [scheduleSave],
  )

  // Cleanup на unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (hiddenSaveTimerRef.current) clearTimeout(hiddenSaveTimerRef.current)
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current)
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  // Cumulative sticky left offsets (пересчитываются на каждый render)
  const stickyLefts = {
    photo: 0,
    svodka: columnWidths.photo,
    yarlyk: columnWidths.photo + columnWidths.svodka,
    artikul:
      columnWidths.photo + columnWidths.svodka + columnWidths.yarlyk,
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-md border py-16 text-center text-muted-foreground">
        <p className="text-sm font-medium">
          Нет карточек с привязкой к товарам
        </p>
        <p className="text-xs mt-2">
          Синхронизируйте карточки WB и привяжите их к товарам на странице{" "}
          <a href="/cards/wb" className="text-primary underline">
            Карточки товаров → WB
          </a>
          , затем вернитесь сюда.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-md border h-full flex flex-col min-h-0">
      {/* Toolbar: кнопка «Вид» для настройки видимости колонок */}
      <div className="flex items-center justify-end gap-2 px-2 py-1 border-b bg-muted/20">
        <ColumnVisibilityDropdown
          hidden={hiddenColumns}
          onToggle={toggleColumn}
          onReset={resetHiddenColumns}
        />
      </div>
      {/* overflow-auto на ОБЕ оси + flex-1 — thead sticky работает
          внутри этого скролл-контейнера, шапка страницы не прокручивается. */}
      <div className="relative overflow-auto flex-1 min-h-0">
        <table
          className="caption-bottom text-sm border-collapse table-fixed"
          style={{ width: "max-content", minWidth: "100%" }}
        >
          <thead className="sticky top-0 z-30 bg-background border-b">
            <tr className="min-h-[56px]">
              {/* Sticky 1: Фото */}
              <th
                style={{
                  width: columnWidths.photo,
                  minWidth: columnWidths.photo,
                  left: stickyLefts.photo,
                }}
                className="sticky z-40 bg-background border-r px-2 py-2 text-[11px] font-medium text-muted-foreground text-center align-middle whitespace-normal break-words leading-tight relative"
              >
                Фото
                <ColumnResizeHandle
                  onMouseDown={(e) => startResize(e, "photo")}
                  onDoubleClick={() => resetColumnWidth("photo")}
                />
              </th>
              {/* Sticky 2: Сводка */}
              <th
                style={{
                  width: columnWidths.svodka,
                  minWidth: columnWidths.svodka,
                  left: stickyLefts.svodka,
                }}
                className="sticky z-40 bg-background border-r px-3 py-2 text-[11px] font-medium text-muted-foreground text-center align-middle whitespace-normal break-words leading-tight relative"
              >
                Сводка
                <ColumnResizeHandle
                  onMouseDown={(e) => startResize(e, "svodka")}
                  onDoubleClick={() => resetColumnWidth("svodka")}
                />
              </th>
              {/* Sticky 3: Ярлык */}
              <th
                style={{
                  width: columnWidths.yarlyk,
                  minWidth: columnWidths.yarlyk,
                  left: stickyLefts.yarlyk,
                }}
                className="sticky z-40 bg-background border-r px-2 py-2 text-[11px] font-medium text-muted-foreground text-center align-middle whitespace-normal break-words leading-tight relative"
              >
                Ярлык
                <ColumnResizeHandle
                  onMouseDown={(e) => startResize(e, "yarlyk")}
                  onDoubleClick={() => resetColumnWidth("yarlyk")}
                />
              </th>
              {/* Sticky 4: Артикул — правая граница sticky-зоны, shadow-разделитель */}
              <th
                style={{
                  width: columnWidths.artikul,
                  minWidth: columnWidths.artikul,
                  left: stickyLefts.artikul,
                }}
                className="sticky z-40 bg-background border-r px-2 py-2 text-[11px] font-medium text-muted-foreground text-center align-middle whitespace-normal break-words leading-tight relative shadow-[4px_0_6px_-1px_rgba(0,0,0,0.08)]"
              >
                Артикул
                <ColumnResizeHandle
                  onMouseDown={(e) => startResize(e, "artikul")}
                  onDoubleClick={() => resetColumnWidth("artikul")}
                />
              </th>
              {/* Остальные 27 колонок — Статус цены + 26 расчётных.
                  Скрытые через «Вид» не рендерим (status исключён из hideable). */}
              {SCROLL_COLUMNS.filter(
                ({ key }) => !hiddenColumns.has(key),
              ).map(({ key, label }) => (
                <th
                  key={key}
                  style={{
                    width: columnWidths[key],
                    minWidth: columnWidths[key],
                  }}
                  className="px-2 py-2 text-[11px] font-medium text-muted-foreground text-center align-middle whitespace-normal break-words leading-tight relative"
                >
                  {label}
                  <ColumnResizeHandle
                    onMouseDown={(e) => startResize(e, key)}
                    onDoubleClick={() => resetColumnWidth(key)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group, gIdx) => {
              // Плоский индекс строки внутри Product (для rowSpan якорей)
              let productRowIdx = 0

              return group.cards.flatMap((cardGroup, cardIdx) =>
                cardGroup.priceRows.map((row, rowIdx) => {
                  const isFirstRowOfProduct = productRowIdx === 0
                  const isFirstRowOfCard = rowIdx === 0
                  // Жирный разделитель между Product — только на верхней
                  // границе первой строки не-первой группы.
                  const isProductBoundary = gIdx > 0 && isFirstRowOfProduct
                  productRowIdx++

                  const stripClass =
                    row.type === "regular"
                      ? "border-l-4 border-l-blue-500 bg-blue-50/30 dark:bg-blue-500/10"
                      : row.type === "auto"
                        ? "border-l-4 border-l-purple-500 bg-purple-50/30 dark:bg-purple-500/10"
                        : row.type === "calculated"
                          ? "border-l-4 border-l-amber-500 bg-amber-50/30 dark:bg-amber-500/10"
                          : ""

                  return (
                    <tr
                      key={row.id}
                      onClick={() =>
                        onRowClick?.(cardGroup.card, row, group.product.id)
                      }
                      className={cn(
                        "h-10 cursor-pointer group hover:bg-muted/50",
                        isProductBoundary && "border-t-4 border-t-border",
                        !isProductBoundary &&
                          isFirstRowOfProduct &&
                          "border-t",
                        !isFirstRowOfProduct &&
                          isFirstRowOfCard &&
                          "border-t border-t-border/60",
                      )}
                    >
                      {/* Sticky 1: Фото (rowSpan всего Product) — метаданные товара,
                          не реагирует на клик (stopPropagation) и не подсвечивается на hover */}
                      {isFirstRowOfProduct && (
                        <td
                          rowSpan={group.totalRowsInProduct}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: columnWidths.photo,
                            minWidth: columnWidths.photo,
                            left: stickyLefts.photo,
                          }}
                          className="sticky z-10 bg-background border-r align-top p-2 cursor-default"
                        >
                          <div className="flex items-start justify-center">
                            {group.product.photoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={group.product.photoUrl}
                                alt={group.product.name}
                                className="w-28 h-[150px] rounded border object-cover aspect-[3/4]"
                              />
                            ) : (
                              <div className="w-28 h-[150px] rounded border bg-muted" />
                            )}
                          </div>
                        </td>
                      )}

                      {/* Sticky 2: Сводка (rowSpan всего Product) */}
                      {isFirstRowOfProduct && (
                        <td
                          rowSpan={group.totalRowsInProduct}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: columnWidths.svodka,
                            minWidth: columnWidths.svodka,
                            left: stickyLefts.svodka,
                          }}
                          className="sticky z-10 bg-background border-r align-top p-3 cursor-default"
                        >
                          <div className="flex flex-col gap-1">
                            <div className="text-sm font-medium leading-snug line-clamp-3">
                              {group.product.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Остаток:{" "}
                              <span className="text-foreground tabular-nums">
                                {group.product.totalStock}
                              </span>{" "}
                              шт
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Скорость 7д:{" "}
                              <span className="text-foreground tabular-nums">
                                {group.product.totalAvgSalesSpeed.toFixed(1)}
                              </span>{" "}
                              шт/день
                            </div>
                          </div>
                        </td>
                      )}

                      {/* Sticky 3: Ярлык (rowSpan card) */}
                      {isFirstRowOfCard && (
                        <td
                          rowSpan={cardGroup.priceRows.length}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: columnWidths.yarlyk,
                            minWidth: columnWidths.yarlyk,
                            left: stickyLefts.yarlyk,
                          }}
                          className="sticky z-10 bg-background border-r align-top p-2 text-sm cursor-default"
                        >
                          {cardGroup.card.label ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      )}

                      {/* Sticky 4: Артикул (rowSpan card) — shadow-разделитель.
                          Клик копирует nmId в буфер (вместо открытия модалки). */}
                      {isFirstRowOfCard && (
                        <td
                          rowSpan={cardGroup.priceRows.length}
                          onClick={(e) => {
                            e.stopPropagation()
                            const nmId = String(cardGroup.card.nmId)
                            navigator.clipboard
                              ?.writeText(nmId)
                              .then(() => toast.success(`Артикул ${nmId} скопирован`))
                              .catch(() => toast.error("Не удалось скопировать"))
                          }}
                          title="Нажмите, чтобы скопировать артикул"
                          style={{
                            width: columnWidths.artikul,
                            minWidth: columnWidths.artikul,
                            left: stickyLefts.artikul,
                          }}
                          className="sticky z-10 bg-background border-r align-top p-2 font-mono text-xs cursor-copy hover:text-primary shadow-[4px_0_6px_-1px_rgba(0,0,0,0.08)]"
                        >
                          {cardGroup.card.nmId}
                        </td>
                      )}

                      {/* Колонка «Статус цены» — индикаторная полоска на
                          эту ячейку (первая не-sticky), чтобы визуально
                          маркировать тип строки. */}
                      <td
                        style={{
                          width: columnWidths.status,
                          minWidth: columnWidths.status,
                        }}
                        className={cn(
                          "px-2 py-1 h-10 text-sm align-middle",
                          stripClass,
                        )}
                      >
                        {row.type === "current" && (
                          <Badge
                            variant="outline"
                            className="bg-primary/10 text-primary border-primary/30"
                          >
                            Текущая
                          </Badge>
                        )}
                        {(row.type === "regular" || row.type === "auto") && (
                          <PromoTooltip
                            description={row.promotionDescription}
                            advantages={row.promotionAdvantages}
                            startDateTime={row.promotionStartDateTime}
                            endDateTime={row.promotionEndDateTime}
                          >
                            {row.label}
                          </PromoTooltip>
                        )}
                        {row.type === "calculated" && (
                          <span className="text-sm font-medium">
                            {row.label}
                          </span>
                        )}
                      </td>

                      {/* ── 26 расчётных колонок (скрываемые через «Вид») ── */}
                      {([
                        ["buyoutPct", fmtPctSimple(cardGroup.card.buyoutPct ?? null)],
                        ["sellerPriceBeforeDiscount", fmtMoneyInt(row.sellerPriceBeforeDiscount)],
                        ["sellerDiscountPct", fmtPctInt(row.sellerDiscountPct)],
                        ["sellerPrice", fmtMoneyInt(row.computed.sellerPrice)],
                        ["wbDiscountPct", fmtPctInt(row.wbDiscountPct)],
                        ["priceAfterWbDiscount", fmtMoneyInt(row.computed.priceAfterWbDiscount)],
                        ["clubDiscountPct", fmtPctInt(row.clubDiscountPct)],
                        ["priceAfterClubDiscount", fmtMoneyInt(row.computed.priceAfterClubDiscount)],
                        ["walletPct", fmtPctInt(row.walletPct)],
                        ["priceAfterWallet", fmtMoneyInt(row.computed.priceAfterWallet)],
                        ["acquiringAmount", fmtMoneyInt(row.computed.acquiringAmount)],
                        ["commFbwPct", fmtPctSimple(row.commFbwPct)],
                        ["commissionAmount", fmtMoneyInt(row.computed.commissionAmount)],
                        ["drrPct", fmtPctInt(row.drrPct)],
                        ["drrAmount", fmtMoneyInt(row.computed.drrAmount)],
                        ["jemAmount", fmtMoneyInt(row.computed.jemAmount)],
                        ["transferAmount", fmtMoneyInt(row.computed.transferAmount)],
                        ["costPrice", fmtMoneyInt(row.costPrice)],
                        ["defectAmount", fmtMoneyInt(row.computed.defectAmount)],
                        ["deliveryAmount", fmtMoneyInt(row.computed.deliveryAmount)],
                        ["creditAmount", fmtMoneyInt(row.computed.creditAmount)],
                        ["overheadAmount", fmtMoneyInt(row.computed.overheadAmount)],
                        ["taxAmount", fmtMoneyInt(row.computed.taxAmount)],
                        ["profit", fmtMoneyInt(row.computed.profit), profitClass(row.computed.profit)],
                        ["returnOnSalesPct", fmtPct(row.computed.returnOnSalesPct, true), profitClass(row.computed.returnOnSalesPct)],
                        ["roiPct", fmtPct(row.computed.roiPct, true), profitClass(row.computed.roiPct)],
                      ] as [ColumnKey, string, string?][])
                        .filter(([k]) => !hiddenColumns.has(k))
                        .map(([k, content, extraClass]) => (
                          <td
                            key={k}
                            style={{
                              width: columnWidths[k],
                              minWidth: columnWidths[k],
                            }}
                            className={extraClass ? cn(CELL_CLASS, extraClass) : CELL_CLASS}
                          >
                            {content}
                          </td>
                        ))}
                    </tr>
                  )
                }),
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
