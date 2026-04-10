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
import { PromoTooltip } from "@/components/prices/PromoTooltip"
import { setUserPreference } from "@/app/actions/user-preferences"

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
}: PriceCalculatorTableProps) {
  // ── Column widths state (план 260410-mya) ───────────────────────
  // Merge: DEFAULT_WIDTHS + сохранённые значения (незнакомые ключи игнорируются)
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(
    () => ({
      ...DEFAULT_WIDTHS,
      ...(initialColumnWidths ?? {}),
    }),
  )

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
    <div className="rounded-md border">
      <div className="relative overflow-x-auto">
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
              {/* Остальные 27 колонок — Статус цены + 26 расчётных */}
              {SCROLL_COLUMNS.map(({ key, label }) => (
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
                      {/* Sticky 1: Фото (rowSpan всего Product) */}
                      {isFirstRowOfProduct && (
                        <td
                          rowSpan={group.totalRowsInProduct}
                          style={{
                            width: columnWidths.photo,
                            minWidth: columnWidths.photo,
                            left: stickyLefts.photo,
                          }}
                          className="sticky z-10 bg-background border-r align-top p-2 group-hover:bg-muted"
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
                          style={{
                            width: columnWidths.svodka,
                            minWidth: columnWidths.svodka,
                            left: stickyLefts.svodka,
                          }}
                          className="sticky z-10 bg-background border-r align-top p-3 group-hover:bg-muted"
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
                          style={{
                            width: columnWidths.yarlyk,
                            minWidth: columnWidths.yarlyk,
                            left: stickyLefts.yarlyk,
                          }}
                          className="sticky z-10 bg-background border-r align-top p-2 text-sm group-hover:bg-muted"
                        >
                          {cardGroup.card.label ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      )}

                      {/* Sticky 4: Артикул (rowSpan card) — shadow-разделитель */}
                      {isFirstRowOfCard && (
                        <td
                          rowSpan={cardGroup.priceRows.length}
                          style={{
                            width: columnWidths.artikul,
                            minWidth: columnWidths.artikul,
                            left: stickyLefts.artikul,
                          }}
                          className="sticky z-10 bg-background border-r align-top p-2 font-mono text-xs group-hover:bg-muted shadow-[4px_0_6px_-1px_rgba(0,0,0,0.08)]"
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

                      {/* ── 26 расчётных колонок ─────────────────── */}
                      {/* COLUMN_ORDER[4]: Процент выкупа (из WbCard) — оставляем fmtPctSimple */}
                      <td
                        style={{
                          width: columnWidths.buyoutPct,
                          minWidth: columnWidths.buyoutPct,
                        }}
                        className={CELL_CLASS}
                      >
                        {fmtPctSimple(cardGroup.card.buyoutPct ?? null)}
                      </td>
                      {/* COLUMN_ORDER[5]: Цена для установки */}
                      <td
                        style={{
                          width: columnWidths.sellerPriceBeforeDiscount,
                          minWidth: columnWidths.sellerPriceBeforeDiscount,
                        }}
                        className={CELL_CLASS}
                      >
                        {fmtMoneyInt(row.sellerPriceBeforeDiscount)}
                      </td>
                      {/* COLUMN_ORDER[6]: Скидка продавца % */}
                      <td
                        style={{
                          width: columnWidths.sellerDiscountPct,
                          minWidth: columnWidths.sellerDiscountPct,
                        }}
                        className={CELL_CLASS}
                      >
                        {fmtPctInt(row.sellerDiscountPct)}
                      </td>
                      {/* COLUMN_ORDER[7]: Цена продавца (output) */}
                      <td
                        style={{
                          width: columnWidths.sellerPrice,
                          minWidth: columnWidths.sellerPrice,
                        }}
                        className={CELL_CLASS}
                      >
                        {fmtMoneyInt(row.computed.sellerPrice)}
                      </td>
                      {/* COLUMN_ORDER[8]: Скидка WB % */}
                      <td
                        style={{
                          width: columnWidths.wbDiscountPct,
                          minWidth: columnWidths.wbDiscountPct,
                        }}
                        className={CELL_CLASS}
                      >
                        {fmtPctInt(row.wbDiscountPct)}
                      </td>
                      {/* COLUMN_ORDER[9]: Цена со скидкой WB (output) */}
                      <td
                        style={{
                          width: columnWidths.priceAfterWbDiscount,
                          minWidth: columnWidths.priceAfterWbDiscount,
                        }}
                        className={CELL_CLASS}
                      >
                        {fmtMoneyInt(row.computed.priceAfterWbDiscount)}
                      </td>
                      {/* COLUMN_ORDER[10]: WB Клуб % */}
                      <td
                        style={{
                          width: columnWidths.clubDiscountPct,
                          minWidth: columnWidths.clubDiscountPct,
                        }}
                        className={CELL_CLASS}
                      >
                        {fmtPctInt(row.clubDiscountPct)}
                      </td>
                      {/* COLUMN_ORDER[11]: Цена со скидкой WB клуба (output) */}
                      <td
                        style={{
                          width: columnWidths.priceAfterClubDiscount,
                          minWidth: columnWidths.priceAfterClubDiscount,
                        }}
                        className={CELL_CLASS}
                      >
                        {fmtMoneyInt(row.computed.priceAfterClubDiscount)}
                      </td>
                      {/* COLUMN_ORDER[12]: Кошелёк % */}
                      <td
                        style={{
                          width: columnWidths.walletPct,
                          minWidth: columnWidths.walletPct,
                        }}
                        className={CELL_CLASS}
                      >
                        {fmtPctInt(row.walletPct)}
                      </td>
                      {/* COLUMN_ORDER[13]: Цена с WB кошельком (output) */}
                      <td
                        style={{
                          width: columnWidths.priceAfterWallet,
                          minWidth: columnWidths.priceAfterWallet,
                        }}
                        className={CELL_CLASS}
                      >
                        {fmtMoneyInt(row.computed.priceAfterWallet)}
                      </td>
                      {/* COLUMN_ORDER[14]: Эквайринг руб. (output) */}
                      <td
                        style={{
                          width: columnWidths.acquiringAmount,
                          minWidth: columnWidths.acquiringAmount,
                        }}
                        className={CELL_CLASS}
                      >
                        {fmtMoneyInt(row.computed.acquiringAmount)}
                      </td>
                      {/* COLUMN_ORDER[15]: Комиссия % — оставляем fmtPctSimple */}
                      <td
                        style={{
                          width: columnWidths.commFbwPct,
                          minWidth: columnWidths.commFbwPct,
                        }}
                        className={CELL_CLASS}
                      >
                        {fmtPctSimple(row.commFbwPct)}
                      </td>
                      {/* COLUMN_ORDER[16]: Комиссия руб. (output) */}
                      <td
                        style={{
                          width: columnWidths.commissionAmount,
                          minWidth: columnWidths.commissionAmount,
                        }}
                        className={CELL_CLASS}
                      >
                        {fmtMoneyInt(row.computed.commissionAmount)}
                      </td>
                      {/* COLUMN_ORDER[17]: ДРР % */}
                      <td
                        style={{
                          width: columnWidths.drrPct,
                          minWidth: columnWidths.drrPct,
                        }}
                        className={CELL_CLASS}
                      >
                        {fmtPctInt(row.drrPct)}
                      </td>
                      {/* COLUMN_ORDER[18]: Реклама руб. (output) */}
                      <td
                        style={{
                          width: columnWidths.drrAmount,
                          minWidth: columnWidths.drrAmount,
                        }}
                        className={CELL_CLASS}
                      >
                        {fmtMoneyInt(row.computed.drrAmount)}
                      </td>
                      {/* COLUMN_ORDER[19]: Тариф джем руб. (output) */}
                      <td
                        style={{
                          width: columnWidths.jemAmount,
                          minWidth: columnWidths.jemAmount,
                        }}
                        className={CELL_CLASS}
                      >
                        {fmtMoneyInt(row.computed.jemAmount)}
                      </td>
                      {/* COLUMN_ORDER[20]: К перечислению (output) */}
                      <td
                        style={{
                          width: columnWidths.transferAmount,
                          minWidth: columnWidths.transferAmount,
                        }}
                        className={CELL_CLASS}
                      >
                        {fmtMoneyInt(row.computed.transferAmount)}
                      </td>
                      {/* COLUMN_ORDER[21]: Закупка руб. */}
                      <td
                        style={{
                          width: columnWidths.costPrice,
                          minWidth: columnWidths.costPrice,
                        }}
                        className={CELL_CLASS}
                      >
                        {fmtMoneyInt(row.costPrice)}
                      </td>
                      {/* COLUMN_ORDER[22]: Брак руб. (output) */}
                      <td
                        style={{
                          width: columnWidths.defectAmount,
                          minWidth: columnWidths.defectAmount,
                        }}
                        className={CELL_CLASS}
                      >
                        {fmtMoneyInt(row.computed.defectAmount)}
                      </td>
                      {/* COLUMN_ORDER[23]: Доставка руб. */}
                      <td
                        style={{
                          width: columnWidths.deliveryAmount,
                          minWidth: columnWidths.deliveryAmount,
                        }}
                        className={CELL_CLASS}
                      >
                        {fmtMoneyInt(row.computed.deliveryAmount)}
                      </td>
                      {/* COLUMN_ORDER[24]: Кредит руб. (output) */}
                      <td
                        style={{
                          width: columnWidths.creditAmount,
                          minWidth: columnWidths.creditAmount,
                        }}
                        className={CELL_CLASS}
                      >
                        {fmtMoneyInt(row.computed.creditAmount)}
                      </td>
                      {/* COLUMN_ORDER[25]: Общие расходы руб. (output) */}
                      <td
                        style={{
                          width: columnWidths.overheadAmount,
                          minWidth: columnWidths.overheadAmount,
                        }}
                        className={CELL_CLASS}
                      >
                        {fmtMoneyInt(row.computed.overheadAmount)}
                      </td>
                      {/* COLUMN_ORDER[26]: Налог руб. (output) */}
                      <td
                        style={{
                          width: columnWidths.taxAmount,
                          minWidth: columnWidths.taxAmount,
                        }}
                        className={CELL_CLASS}
                      >
                        {fmtMoneyInt(row.computed.taxAmount)}
                      </td>
                      {/* COLUMN_ORDER[27]: Прибыль руб. (подсветка) */}
                      <td
                        style={{
                          width: columnWidths.profit,
                          minWidth: columnWidths.profit,
                        }}
                        className={cn(
                          CELL_CLASS,
                          profitClass(row.computed.profit),
                        )}
                      >
                        {fmtMoneyInt(row.computed.profit)}
                      </td>
                      {/* COLUMN_ORDER[28]: Re продаж % (подсветка, с десятыми) */}
                      <td
                        style={{
                          width: columnWidths.returnOnSalesPct,
                          minWidth: columnWidths.returnOnSalesPct,
                        }}
                        className={cn(
                          CELL_CLASS,
                          profitClass(row.computed.returnOnSalesPct),
                        )}
                      >
                        {fmtPct(row.computed.returnOnSalesPct, true)}
                      </td>
                      {/* COLUMN_ORDER[29]: ROI % (подсветка, с десятыми) */}
                      <td
                        style={{
                          width: columnWidths.roiPct,
                          minWidth: columnWidths.roiPct,
                        }}
                        className={cn(
                          CELL_CLASS,
                          profitClass(row.computed.roiPct),
                        )}
                      >
                        {fmtPct(row.computed.roiPct, true)}
                      </td>
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
