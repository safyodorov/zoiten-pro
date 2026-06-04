// components/stock/StockProductTable.tsx
// Phase 14 (STOCK-16, STOCK-17, STOCK-18, STOCK-19): Client sticky-таблица Product-level остатков.
//
// Структура:
//   - 4 sticky колонки: Фото (left-0, 80px) | Сводка (left-[80px], 240px) | Ярлык (left-[320px], 80px) | Артикул (left-[400px], 120px)
//   - 2-уровневый header: группы (top-0) + sub-columns О/З/Об/Д (top-[40px])
//   - 6 групп колонок: Производство(2: кол-во+дата) | РФ(1) | Иваново(1) | МП(4) | WB(4) | Ozon(4)
//     (порядок изменён 2026-04-22: Производство перед РФ для наглядности планируемого прихода)
//   - rowSpan: Фото+Сводка rowSpan = 1 + N_articles (Сводная строка + per-article строки)
//   - DeficitCell: 3-уровневая цветовая кодировка (зелёный/жёлтый/красный)
//   - Inline-поля (debounced 500ms): Производство (кол-во+дата → ProductIncoming, синхр.
//     с /purchase-plan и /sales-plan) и Иваново (→ Product.ivanovoStock, глобально).
//
// Паттерн sticky: components/prices/PriceCalculatorTable.tsx — accumulated left, z-20/30, bg-background.

"use client"

import React, { useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { calculateStockMetrics, deficitThreshold } from "@/lib/stock-math"
import {
  updateProductionStock,
  updateProductionArrivalDate,
  updateIvanovoStock,
} from "@/app/actions/stock"
import type { StockProductRow } from "@/lib/stock-data"

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

/**
 * Форматирует числовое значение ячейки О/З/Об/Д.
 * n < 10  → toFixed(1) (точность для малых значений)
 * n >= 10 → Math.floor (целые)
 */
function formatStockValue(n: number): string {
  if (n < 10) return n.toFixed(1)
  return Math.floor(n).toString()
}

/** Целое число с отбрасыванием дробной части (Math.trunc корректен для negative: -1.7 → -1). */
function formatInt(n: number): string {
  return Math.trunc(n).toString()
}

// ──────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────

/** Ячейка О/З — числовое значение или «—». */
function StockCell({ value }: { value: number | null }) {
  return (
    <TableCell className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right">
      {value !== null ? (
        formatStockValue(value)
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </TableCell>
  )
}

/** Ячейка Об — всегда целое с отбрасыванием дробной части. */
function IntCell({ value }: { value: number | null }) {
  return (
    <TableCell className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right">
      {value !== null ? (
        formatInt(value)
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </TableCell>
  )
}

/** Ячейка Д с 3-уровневой цветовой кодировкой:
 *  Д ≤ 0              → зелёный (норма)
 *  0 < Д < threshold  → жёлтый (предупреждение)
 *  Д ≥ threshold      → красный font-medium (критический дефицит)
 *  null               → «—» text-muted-foreground
 */
function DeficitCell({
  deficit,
  threshold,
}: {
  deficit: number | null
  threshold: number | null
}) {
  return (
    <TableCell
      className={cn(
        "px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right border-r",
        deficit === null && "text-muted-foreground",
        deficit !== null && deficit <= 0 && "text-green-600 dark:text-green-500",
        deficit !== null &&
          deficit > 0 &&
          (threshold === null || deficit < threshold) &&
          "text-yellow-600 dark:text-yellow-400",
        deficit !== null &&
          threshold !== null &&
          deficit >= threshold &&
          "text-red-600 dark:text-red-500 font-medium",
      )}
    >
      {deficit !== null ? formatInt(deficit) : "—"}
    </TableCell>
  )
}

// ──────────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────────

interface StockProductTableProps {
  products: StockProductRow[]
  turnoverNormDays: number
}

// ──────────────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────────────

export function StockProductTable({ products, turnoverNormDays }: StockProductTableProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // Отдельный таймер на каждый productId — паттерн из GlobalRatesBar
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  /**
   * Debounced save (500ms) с namespaced-ключом таймера (несколько полей на товар).
   * После сохранения: toast.success + router.refresh() для RSC re-render.
   */
  const debouncedSave = (
    key: string,
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    successMsg: string,
  ) => {
    const existing = timersRef.current.get(key)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await action()
        if (result.ok) {
          toast.success(successMsg)
          router.refresh()
        } else {
          toast.error(`Не удалось сохранить: ${result.error}`)
        }
      })
    }, 500)

    timersRef.current.set(key, timer)
  }

  const saveProduction = (productId: string, value: number | null) =>
    debouncedSave(`prod:${productId}`, () => updateProductionStock(productId, value), "Производство обновлено")
  const saveArrivalDate = (productId: string, dateIso: string | null) =>
    debouncedSave(`date:${productId}`, () => updateProductionArrivalDate(productId, dateIso), "Дата прихода обновлена")
  const saveIvanovo = (productId: string, value: number | null) =>
    debouncedSave(`iv:${productId}`, () => updateIvanovoStock(productId, value), "Иваново обновлено")

  // ── Empty state ────────────────────────────────────────────────
  if (products.length === 0) {
    return (
      <div className="text-center py-16">
        <h3 className="text-sm font-medium">Нет товаров для отображения</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Добавьте товары в разделе Товары и привяжите артикулы WB.
        </p>
      </div>
    )
  }

  // ── Table ──────────────────────────────────────────────────────
  return (
    <div className="overflow-auto border rounded h-full">
      <table className="w-full caption-bottom text-sm border-separate border-spacing-0">
        <thead className="bg-background">
          {/* ── Уровень 1: группы колонок ── */}
          <tr>
            {/* Sticky 4 колонки с rowSpan=2 */}
            <TableHead
              rowSpan={2}
              className="sticky left-0 top-0 z-30 bg-background w-20 text-xs font-medium text-center border-b border-r align-middle"
            >
              Фото
            </TableHead>
            <TableHead
              rowSpan={2}
              className="sticky left-[80px] top-0 z-30 bg-background w-60 text-xs font-medium text-center border-b border-r align-middle"
            >
              Сводка
            </TableHead>
            <TableHead
              rowSpan={2}
              className="sticky left-[320px] top-0 z-30 bg-background w-20 text-xs font-medium text-center border-b border-r align-middle"
            >
              Ярлык
            </TableHead>
            <TableHead
              rowSpan={2}
              className="sticky left-[400px] top-0 z-30 bg-background w-[120px] text-xs font-medium text-center border-b border-r align-middle"
            >
              Артикул
            </TableHead>

            {/* Группы: Производство (2 col: кол-во + дата прихода), РФ (1), Иваново (1) */}
            <TableHead
              colSpan={2}
              className="sticky top-0 z-20 bg-background text-xs font-medium text-center border-b border-r px-2"
              title="Производство = заказано (План закупок/продаж): кол-во + дата прихода на склад Иваново"
            >
              Производство
            </TableHead>
            <TableHead
              colSpan={1}
              className="sticky top-0 z-20 bg-background text-xs font-medium text-center border-b border-r px-2"
              title="Итого по РФ = Иваново + МП"
            >
              РФ
            </TableHead>
            <TableHead
              colSpan={1}
              className="sticky top-0 z-20 bg-background text-xs font-medium text-center border-b border-r px-2"
            >
              Иваново
            </TableHead>

            {/* Группы: МП / WB / Ozon — по 4 sub-columns */}
            <TableHead
              colSpan={4}
              className="sticky top-0 z-20 bg-background text-xs font-medium text-center border-b border-r px-2"
            >
              МП
            </TableHead>
            <TableHead
              colSpan={4}
              className="sticky top-0 z-20 bg-background text-xs font-medium text-center border-b border-r px-2"
            >
              WB
            </TableHead>
            <TableHead
              colSpan={4}
              className="sticky top-0 z-20 bg-background text-xs font-medium text-center border-b border-r px-2"
            >
              Ozon
            </TableHead>
          </tr>

          {/* ── Уровень 2: sub-columns О/З/Об/Д ── */}
          <tr>
            {/* Производство → О (кол-во, inline) + Дата прихода (inline) */}
            <TableHead
              className="sticky top-[40px] z-20 bg-background text-xs text-muted-foreground text-center border-b px-2 py-1 w-[88px] min-w-[88px]"
              title="Заказано, шт"
            >
              О
            </TableHead>
            <TableHead
              className="sticky top-[40px] z-20 bg-background text-xs text-muted-foreground text-center border-b border-r px-2 py-1 w-[130px] min-w-[130px]"
              title="Дата прихода на склад Иваново"
            >
              Дата
            </TableHead>
            {/* РФ → только О */}
            <TableHead
              className="sticky top-[40px] z-20 bg-background text-xs text-muted-foreground text-center border-b border-r px-2 py-1"
              title="Остаток (шт)"
            >
              О
            </TableHead>
            {/* Иваново → только О */}
            <TableHead
              className="sticky top-[40px] z-20 bg-background text-xs text-muted-foreground text-center border-b border-r px-2 py-1"
              title="Остаток (шт)"
            >
              О
            </TableHead>

            {/* МП / WB / Ozon — по 4 sub-columns */}
            {(["mp", "wb", "ozon"] as const).flatMap((group) => [
              <TableHead
                key={`${group}-o`}
                className="sticky top-[40px] z-20 bg-background text-xs text-muted-foreground text-center border-b px-2 py-1"
                title="Остаток (шт)"
              >
                О
              </TableHead>,
              <TableHead
                key={`${group}-z`}
                className="sticky top-[40px] z-20 bg-background text-xs text-muted-foreground text-center border-b px-2 py-1"
                title="Заказы в день (шт/д)"
              >
                З
              </TableHead>,
              <TableHead
                key={`${group}-ob`}
                className="sticky top-[40px] z-20 bg-background text-xs text-muted-foreground text-center border-b px-2 py-1"
                title="Оборачиваемость (дней)"
              >
                Об
              </TableHead>,
              <TableHead
                key={`${group}-d`}
                className="sticky top-[40px] z-20 bg-background text-xs text-muted-foreground text-center border-b border-r px-2 py-1"
                title="Дефицит (дней). Красный = срочно, жёлтый = пора думать, зелёный = всё ок"
              >
                Д
              </TableHead>,
            ])}
          </tr>
        </thead>

        <TableBody>
          {products.map((p, idx) => {
            const rowSpan = 1 + p.articles.length

            // Агрегированные метрики МП и WB
            const mpMetrics = calculateStockMetrics({
              stock: p.aggregates.mpTotalStock,
              ordersPerDay: p.aggregates.mpTotalOrdersPerDay,
              turnoverNormDays,
            })
            const wbMetrics = calculateStockMetrics({
              stock: p.aggregates.wbTotalStock,
              ordersPerDay: p.aggregates.wbTotalOrdersPerDay,
              turnoverNormDays,
            })
            const mpThreshold = deficitThreshold(turnoverNormDays, p.aggregates.mpTotalOrdersPerDay)
            const wbThreshold = deficitThreshold(turnoverNormDays, p.aggregates.wbTotalOrdersPerDay)

            return (
              <React.Fragment key={p.id}>
                {/* ── Сводная строка Product ── */}
                <TableRow
                  className={cn(idx > 0 && "border-t-4 border-t-border")}
                >
                  {/* Фото: rowSpan = 1 + N_articles */}
                  <TableCell
                    rowSpan={rowSpan}
                    className="sticky left-0 z-20 bg-background border-r w-20 align-top p-2"
                  >
                    <div className="sticky top-2 flex justify-center">
                      {p.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        // Используем обычный <img>, а не next/image, т.к. middleware блокирует
                        // internal fetch /_next/image к /uploads/* (редирект на /login) → "received null"
                        <img
                          src={p.photoUrl}
                          alt={p.name}
                          width={72}
                          height={96}
                          className="rounded border object-cover aspect-[3/4]"
                        />
                      ) : (
                        <div className="w-[72px] h-[96px] rounded border bg-muted/30 flex items-center justify-center text-xs text-muted-foreground">
                          —
                        </div>
                      )}
                    </div>
                  </TableCell>

                  {/* Сводка: rowSpan, имя/sku/бренд/категория */}
                  <TableCell
                    rowSpan={rowSpan}
                    className="sticky left-[80px] z-20 bg-background border-r w-60 align-top p-3"
                  >
                    <div className="flex flex-col gap-1">
                      {/* quick 260513-phu: always-on Tooltip с полным названием.
                          base-ui TooltipTrigger через render-prop подменяет <button> на <div>. */}
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <div className="text-sm font-medium leading-snug line-clamp-2 cursor-default" />
                          }
                        >
                          {p.name}
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="max-w-sm text-sm">{p.name}</div>
                        </TooltipContent>
                      </Tooltip>
                      <div className="text-xs text-muted-foreground">{p.sku}</div>
                      <div className="text-xs text-muted-foreground">{p.brandName}</div>
                      {p.categoryName && (
                        <div className="text-xs text-muted-foreground">{p.categoryName}</div>
                      )}
                    </div>
                  </TableCell>

                  {/* Ярлык (ABC) — только в Сводной строке */}
                  <TableCell className="sticky left-[320px] z-20 bg-background border-r w-20 align-top text-center text-xs">
                    {p.abcStatus ?? "—"}
                  </TableCell>

                  {/* Артикул Сводной = «Все» */}
                  <TableCell className="sticky left-[400px] z-20 bg-background border-r w-[120px] text-xs font-medium">
                    Сводная
                  </TableCell>

                  {/* Производство — inline input (перенесено перед РФ 2026-04-22).
                      w-full у input + фикс ширина ячейки w-[88px] → колонка стабильна
                      и в Сводной (input), и в per-article (StockCell).
                      border-r убран — симметрия с РФ/Иваново StockCell. */}
                  <TableCell className="px-2 py-1 h-8 text-xs tabular-nums text-right w-[88px] min-w-[88px]">
                    <input
                      type="number"
                      min={0}
                      max={9999999}
                      className="h-7 w-full rounded border border-input bg-transparent px-1.5 text-xs tabular-nums text-right focus:ring-2 focus:ring-ring outline-none"
                      defaultValue={p.productionStock ?? ""}
                      placeholder="—"
                      aria-label={`Производство (заказано): ${p.name}`}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === "") {
                          saveProduction(p.id, null)
                        } else {
                          const parsed = parseInt(v, 10)
                          if (!isNaN(parsed) && parsed >= 0) {
                            saveProduction(p.id, parsed)
                          }
                        }
                      }}
                    />
                  </TableCell>

                  {/* Производство — Дата прихода на склад Иваново (inline) */}
                  <TableCell className="px-2 py-1 h-8 text-xs w-[130px] min-w-[130px]">
                    <input
                      type="date"
                      className="h-7 w-full rounded border border-input bg-transparent px-1.5 text-xs focus:ring-2 focus:ring-ring outline-none"
                      defaultValue={p.productionArrivalDate ?? ""}
                      aria-label={`Дата прихода: ${p.name}`}
                      onChange={(e) => {
                        const v = e.target.value
                        saveArrivalDate(p.id, v === "" ? null : v)
                      }}
                    />
                  </TableCell>

                  {/* РФ — О (агрегат Иваново + МП, БЕЗ Производства) */}
                  <StockCell value={p.aggregates.rfTotalStock} />

                  {/* Иваново — О (ручной ввод, глобально) */}
                  <TableCell className="px-2 py-1 h-8 text-xs tabular-nums text-right">
                    <input
                      type="number"
                      min={0}
                      max={999999}
                      className="h-7 w-full rounded border border-input bg-transparent px-1.5 text-xs tabular-nums text-right focus:ring-2 focus:ring-ring outline-none"
                      defaultValue={p.ivanovoStock ?? ""}
                      placeholder="—"
                      aria-label={`Иваново: ${p.name}`}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === "") {
                          saveIvanovo(p.id, null)
                        } else {
                          const parsed = parseInt(v, 10)
                          if (!isNaN(parsed) && parsed >= 0) {
                            saveIvanovo(p.id, parsed)
                          }
                        }
                      }}
                    />
                  </TableCell>

                  {/* МП О/З/Об/Д — Об integer */}
                  <StockCell value={p.aggregates.mpTotalStock} />
                  <StockCell value={p.aggregates.mpTotalOrdersPerDay} />
                  <IntCell value={mpMetrics.turnoverDays} />
                  <DeficitCell deficit={mpMetrics.deficit} threshold={mpThreshold} />

                  {/* WB О/З/Об/Д — Об integer */}
                  <StockCell value={p.aggregates.wbTotalStock} />
                  <StockCell value={p.aggregates.wbTotalOrdersPerDay} />
                  <IntCell value={wbMetrics.turnoverDays} />
                  <DeficitCell deficit={wbMetrics.deficit} threshold={wbThreshold} />

                  {/* Ozon — placeholder «—» */}
                  <StockCell value={null} />
                  <StockCell value={null} />
                  <StockCell value={null} />
                  <StockCell value={null} />
                </TableRow>

                {/* ── Per-article строки ── */}
                {p.articles.map((a) => {
                  const isWb = a.wbCard !== null
                  const aMetrics = isWb
                    ? calculateStockMetrics({
                        stock: a.wbCard!.stockQty,
                        ordersPerDay: a.wbCard!.avgSalesSpeed7d,
                        turnoverNormDays,
                      })
                    : { turnoverDays: null, deficit: null }
                  const aThreshold = isWb
                    ? deficitThreshold(turnoverNormDays, a.wbCard!.avgSalesSpeed7d)
                    : null

                  return (
                    <TableRow key={a.id} className="border-t border-t-border/60">
                      {/* Фото + Сводка — заняты rowSpan из Сводной строки */}

                      {/* Ярлык — «—» для per-article строк */}
                      <TableCell className="sticky left-[320px] z-20 bg-background border-r w-20 text-center text-xs text-muted-foreground">
                        —
                      </TableCell>

                      {/* Артикул */}
                      <TableCell className="sticky left-[400px] z-20 bg-background border-r w-[120px] text-xs">
                        {a.marketplaceName}: {a.article}
                      </TableCell>

                      {/* Производство(кол-во+дата)/РФ/Иваново — только product-level в Сводной строке. */}
                      <TableCell className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right text-muted-foreground w-[88px] min-w-[88px]">—</TableCell>
                      <TableCell className="px-2 py-1 h-8 text-xs text-center text-muted-foreground w-[130px] min-w-[130px]">—</TableCell>
                      <StockCell value={null} />
                      <StockCell value={null} />

                      {/* МП per-article (только WB сейчас) */}
                      <StockCell value={isWb ? a.wbCard!.stockQty : null} />
                      <StockCell value={isWb ? a.wbCard!.avgSalesSpeed7d : null} />
                      <IntCell value={aMetrics.turnoverDays} />
                      <DeficitCell deficit={aMetrics.deficit} threshold={aThreshold} />

                      {/* WB per-article */}
                      <StockCell value={isWb ? a.wbCard!.stockQty : null} />
                      <StockCell value={isWb ? a.wbCard!.avgSalesSpeed7d : null} />
                      <IntCell value={aMetrics.turnoverDays} />
                      <DeficitCell deficit={aMetrics.deficit} threshold={aThreshold} />

                      {/* Ozon — placeholder */}
                      <StockCell value={null} />
                      <StockCell value={null} />
                      <StockCell value={null} />
                      <StockCell value={null} />
                    </TableRow>
                  )
                })}
              </React.Fragment>
            )
          })}
        </TableBody>
      </table>
    </div>
  )
}
