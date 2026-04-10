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

import { cn } from "@/lib/utils"
import {
  COLUMN_ORDER,
  type PricingInputs,
  type PricingOutputs,
} from "@/lib/pricing-math"
import { Badge } from "@/components/ui/badge"
import { PromoTooltip } from "@/components/prices/PromoTooltip"

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
}

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

/** Стандартный класс расчётной ячейки (text-xs, tabular-nums, right-align). */
const CELL_CLASS =
  "px-2 py-1 h-10 text-xs leading-tight tabular-nums text-right align-middle"

/** Класс для подсветки прибыли/Re/ROI. */
function profitClass(value: number): string {
  return value >= 0
    ? "text-green-600 dark:text-green-500 font-medium"
    : "text-red-600 dark:text-red-500 font-medium"
}

// ──────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────

export function PriceCalculatorTable({
  groups,
  onRowClick,
}: PriceCalculatorTableProps) {
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

  // ── Заголовки 26 расчётных колонок ───────────────────────────────
  // COLUMN_ORDER содержит 30 элементов; первые 4 (Сводка / Статус цены /
  // Ярлык / Артикул) рендерятся как sticky-колонки + label cell.
  // В скроллируемой области — колонки [4..29] (26 штук).
  const SCROLL_HEADERS = COLUMN_ORDER.slice(4)

  return (
    <div className="rounded-md border">
      <div className="relative overflow-x-auto">
        <table className="w-full caption-bottom text-sm border-collapse">
          <thead className="sticky top-0 z-30 bg-background border-b">
            <tr>
              {/* Sticky 1: Фото (w-32 — 128px, увеличено для читаемости) */}
              <th className="sticky left-0 z-40 bg-background border-r w-32 px-2 py-2 text-xs font-medium text-muted-foreground text-left">
                Фото
              </th>
              {/* Sticky 2: Сводка (left-32, w-60 — 128→368) */}
              <th className="sticky left-32 z-40 bg-background border-r w-60 px-3 py-2 text-xs font-medium text-muted-foreground text-left">
                Сводка
              </th>
              {/* Sticky 3: Ярлык (left-[368px], w-20 — 368→448) */}
              <th className="sticky left-[368px] z-40 bg-background border-r w-20 px-2 py-2 text-xs font-medium text-muted-foreground text-left">
                Ярлык
              </th>
              {/* Sticky 4: Артикул (left-[448px], w-28 — 448→560) */}
              <th className="sticky left-[448px] z-40 bg-background border-r w-28 px-2 py-2 text-xs font-medium text-muted-foreground text-left">
                Артикул
              </th>
              {/* Статус цены (label строки) */}
              <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-left min-w-[180px] whitespace-nowrap">
                Статус цены
              </th>
              {/* 26 расчётных колонок */}
              {SCROLL_HEADERS.map((header) => (
                <th
                  key={header}
                  className="px-2 py-2 text-xs font-medium text-muted-foreground text-right whitespace-nowrap"
                >
                  {header}
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
                      {/* Sticky 1: Фото (rowSpan всего Product) — w-32 (128px) */}
                      {isFirstRowOfProduct && (
                        <td
                          rowSpan={group.totalRowsInProduct}
                          className="sticky left-0 z-10 bg-background border-r w-32 align-top p-2 group-hover:bg-muted/50"
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
                          className="sticky left-32 z-10 bg-background border-r w-60 align-top p-3 group-hover:bg-muted/50"
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
                          className="sticky left-[368px] z-10 bg-background border-r w-20 align-top p-2 text-sm group-hover:bg-muted/50"
                        >
                          {cardGroup.card.label ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      )}

                      {/* Sticky 4: Артикул (rowSpan card) */}
                      {isFirstRowOfCard && (
                        <td
                          rowSpan={cardGroup.priceRows.length}
                          className="sticky left-[448px] z-10 bg-background border-r w-28 align-top p-2 font-mono text-xs group-hover:bg-muted/50"
                        >
                          {cardGroup.card.nmId}
                        </td>
                      )}

                      {/* Колонка «Статус цены» — индикаторная полоска на
                          эту ячейку (первая не-sticky), чтобы визуально
                          маркировать тип строки. */}
                      <td
                        className={cn(
                          "px-2 py-1 h-10 text-sm align-middle min-w-[180px]",
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
                      {/* COLUMN_ORDER[4]: Процент выкупа (из WbCard) */}
                      <td className={CELL_CLASS}>
                        {fmtPctSimple(cardGroup.card.buyoutPct ?? null)}
                      </td>
                      {/* COLUMN_ORDER[5]: Цена для установки */}
                      <td className={CELL_CLASS}>
                        {fmtMoney(row.sellerPriceBeforeDiscount)}
                      </td>
                      {/* COLUMN_ORDER[6]: Скидка продавца % */}
                      <td className={CELL_CLASS}>
                        {fmtPctSimple(row.sellerDiscountPct)}
                      </td>
                      {/* COLUMN_ORDER[7]: Цена продавца (output) */}
                      <td className={CELL_CLASS}>
                        {fmtMoney(row.computed.sellerPrice)}
                      </td>
                      {/* COLUMN_ORDER[8]: Скидка WB % */}
                      <td className={CELL_CLASS}>
                        {fmtPctSimple(row.wbDiscountPct)}
                      </td>
                      {/* COLUMN_ORDER[9]: Цена со скидкой WB (output) */}
                      <td className={CELL_CLASS}>
                        {fmtMoney(row.computed.priceAfterWbDiscount)}
                      </td>
                      {/* COLUMN_ORDER[10]: WB Клуб % */}
                      <td className={CELL_CLASS}>
                        {fmtPctSimple(row.clubDiscountPct)}
                      </td>
                      {/* COLUMN_ORDER[11]: Цена со скидкой WB клуба (output) */}
                      <td className={CELL_CLASS}>
                        {fmtMoney(row.computed.priceAfterClubDiscount)}
                      </td>
                      {/* COLUMN_ORDER[12]: Кошелёк % */}
                      <td className={CELL_CLASS}>
                        {fmtPctSimple(row.walletPct)}
                      </td>
                      {/* COLUMN_ORDER[13]: Цена с WB кошельком (output) */}
                      <td className={CELL_CLASS}>
                        {fmtMoney(row.computed.priceAfterWallet)}
                      </td>
                      {/* COLUMN_ORDER[14]: Эквайринг руб. (output) */}
                      <td className={CELL_CLASS}>
                        {fmtMoney(row.computed.acquiringAmount)}
                      </td>
                      {/* COLUMN_ORDER[15]: Комиссия % */}
                      <td className={CELL_CLASS}>
                        {fmtPctSimple(row.commFbwPct)}
                      </td>
                      {/* COLUMN_ORDER[16]: Комиссия руб. (output) */}
                      <td className={CELL_CLASS}>
                        {fmtMoney(row.computed.commissionAmount)}
                      </td>
                      {/* COLUMN_ORDER[17]: ДРР % */}
                      <td className={CELL_CLASS}>
                        {fmtPctSimple(row.drrPct)}
                      </td>
                      {/* COLUMN_ORDER[18]: Реклама руб. (output) */}
                      <td className={CELL_CLASS}>
                        {fmtMoney(row.computed.drrAmount)}
                      </td>
                      {/* COLUMN_ORDER[19]: Тариф джем руб. (output) */}
                      <td className={CELL_CLASS}>
                        {fmtMoney(row.computed.jemAmount)}
                      </td>
                      {/* COLUMN_ORDER[20]: К перечислению (output) */}
                      <td className={CELL_CLASS}>
                        {fmtMoney(row.computed.transferAmount)}
                      </td>
                      {/* COLUMN_ORDER[21]: Закупка руб. */}
                      <td className={CELL_CLASS}>
                        {fmtMoney(row.costPrice)}
                      </td>
                      {/* COLUMN_ORDER[22]: Брак руб. (output) */}
                      <td className={CELL_CLASS}>
                        {fmtMoney(row.computed.defectAmount)}
                      </td>
                      {/* COLUMN_ORDER[23]: Доставка руб. */}
                      <td className={CELL_CLASS}>
                        {fmtMoney(row.computed.deliveryAmount)}
                      </td>
                      {/* COLUMN_ORDER[24]: Кредит руб. (output) */}
                      <td className={CELL_CLASS}>
                        {fmtMoney(row.computed.creditAmount)}
                      </td>
                      {/* COLUMN_ORDER[25]: Общие расходы руб. (output) */}
                      <td className={CELL_CLASS}>
                        {fmtMoney(row.computed.overheadAmount)}
                      </td>
                      {/* COLUMN_ORDER[26]: Налог руб. (output) */}
                      <td className={CELL_CLASS}>
                        {fmtMoney(row.computed.taxAmount)}
                      </td>
                      {/* COLUMN_ORDER[27]: Прибыль руб. (подсветка) */}
                      <td
                        className={cn(
                          CELL_CLASS,
                          profitClass(row.computed.profit),
                        )}
                      >
                        {fmtMoney(row.computed.profit)}
                      </td>
                      {/* COLUMN_ORDER[28]: Re продаж % (подсветка) */}
                      <td
                        className={cn(
                          CELL_CLASS,
                          profitClass(row.computed.returnOnSalesPct),
                        )}
                      >
                        {fmtPct(row.computed.returnOnSalesPct, true)}
                      </td>
                      {/* COLUMN_ORDER[29]: ROI % (подсветка) */}
                      <td
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
