// components/stock/StockProductTable.tsx
// Phase 14 (STOCK-16, STOCK-17, STOCK-18, STOCK-19): Client sticky-таблица Product-level остатков.
//
// Структура:
//   - 4 sticky колонки: Фото (left-0, 80px) | Сводка (left-[80px], 240px) | Ярлык (left-[320px], 80px) | Артикул (left-[400px], 120px)
//   - 2-уровневый header: группы (top-0) + sub-columns О/З/Об/Д (top-[40px])
//   - 6 групп колонок: РФ(1) | Иваново(1) | Производство(1 inline input) | МП(4) | WB(4) | Ozon(4)
//   - rowSpan: Фото+Сводка rowSpan = 1 + N_articles (Сводная строка + per-article строки)
//   - DeficitCell: 3-уровневая цветовая кодировка (зелёный/жёлтый/красный)
//   - Inline productionStock input: debounced 500ms через updateProductionStock server action
//
// Паттерн sticky: components/prices/PriceCalculatorTable.tsx — accumulated left, z-20/30, bg-background.

"use client"

import React, { useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { calculateStockMetrics, deficitThreshold } from "@/lib/stock-math"
import { updateProductionStock } from "@/app/actions/stock"
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

// ──────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────

/** Ячейка О/З/Об — числовое значение или «—». */
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
      {deficit !== null ? formatStockValue(deficit) : "—"}
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
   * Debounced save productionStock — 500ms.
   * После сохранения: toast.success + router.refresh() для RSC re-render.
   */
  const debouncedSaveProduction = (productId: string, value: number | null) => {
    const existing = timersRef.current.get(productId)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await updateProductionStock(productId, value)
        if (result.ok) {
          toast.success("Производство обновлено")
          router.refresh()
        } else {
          const errMsg = "error" in result ? result.error : "Неизвестная ошибка"
          toast.error(`Не удалось сохранить производство: ${errMsg}`)
        }
      })
    }, 500)

    timersRef.current.set(productId, timer)
  }

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
    <div className="overflow-x-auto border rounded">
      <Table>
        <TableHeader>
          {/* ── Уровень 1: группы колонок ── */}
          <TableRow>
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

            {/* Группы: РФ (1 col), Иваново (1 col), Производство (1 col) */}
            <TableHead
              colSpan={1}
              className="sticky top-0 z-20 bg-background text-xs font-medium text-center border-b border-r px-2"
              title="Итого по РФ = Иваново + Производство + МП"
            >
              РФ
            </TableHead>
            <TableHead
              colSpan={1}
              className="sticky top-0 z-20 bg-background text-xs font-medium text-center border-b border-r px-2"
            >
              Иваново
            </TableHead>
            <TableHead
              colSpan={1}
              className="sticky top-0 z-20 bg-background text-xs font-medium text-center border-b border-r px-2"
            >
              Производство
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
          </TableRow>

          {/* ── Уровень 2: sub-columns О/З/Об/Д ── */}
          <TableRow>
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
            {/* Производство → только О (inline input в данных) */}
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
          </TableRow>
        </TableHeader>

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
                      <div className="text-sm font-medium leading-snug line-clamp-2">
                        {p.name}
                      </div>
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

                  {/* РФ — О (агрегат Иваново + Производство + МП) */}
                  <StockCell value={p.aggregates.rfTotalStock} />

                  {/* Иваново — О */}
                  <StockCell value={p.ivanovoStock} />

                  {/* Производство — inline input */}
                  <TableCell className="px-2 py-1 text-xs tabular-nums text-right">
                    <input
                      type="number"
                      min={0}
                      max={99999}
                      className="h-8 w-20 rounded border border-input bg-transparent px-2 text-xs tabular-nums text-right focus:ring-2 focus:ring-ring outline-none"
                      defaultValue={p.productionStock ?? ""}
                      placeholder="—"
                      aria-label={`Производство: ${p.name}`}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === "") {
                          debouncedSaveProduction(p.id, null)
                        } else {
                          const parsed = parseInt(v, 10)
                          if (!isNaN(parsed) && parsed >= 0) {
                            debouncedSaveProduction(p.id, parsed)
                          }
                        }
                      }}
                    />
                  </TableCell>

                  {/* МП О/З/Об/Д */}
                  <StockCell value={p.aggregates.mpTotalStock} />
                  <StockCell value={p.aggregates.mpTotalOrdersPerDay} />
                  <StockCell value={mpMetrics.turnoverDays} />
                  <DeficitCell deficit={mpMetrics.deficit} threshold={mpThreshold} />

                  {/* WB О/З/Об/Д */}
                  <StockCell value={p.aggregates.wbTotalStock} />
                  <StockCell value={p.aggregates.wbTotalOrdersPerDay} />
                  <StockCell value={wbMetrics.turnoverDays} />
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

                      {/* РФ/Иваново/Производство — только агрегат в Сводной строке */}
                      <StockCell value={null} />
                      <StockCell value={null} />
                      <StockCell value={null} />

                      {/* МП per-article (только WB сейчас) */}
                      <StockCell value={isWb ? a.wbCard!.stockQty : null} />
                      <StockCell value={isWb ? a.wbCard!.avgSalesSpeed7d : null} />
                      <StockCell value={aMetrics.turnoverDays} />
                      <DeficitCell deficit={aMetrics.deficit} threshold={aThreshold} />

                      {/* WB per-article */}
                      <StockCell value={isWb ? a.wbCard!.stockQty : null} />
                      <StockCell value={isWb ? a.wbCard!.avgSalesSpeed7d : null} />
                      <StockCell value={aMetrics.turnoverDays} />
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
      </Table>
    </div>
  )
}
