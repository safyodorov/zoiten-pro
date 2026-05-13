// components/stock/StockProductTable.tsx
// Phase 14 (STOCK-16, STOCK-17, STOCK-18, STOCK-19): Client sticky-таблица Product-level остатков.
// Quick 260513-phu: resizable columns + persist + Tooltip + copy SKU/article.
//
// Структура:
//   - 4 sticky колонки: Фото | Сводка | Ярлык | Артикул (cumulative left, ширины из hook)
//   - 2-уровневый header: группы (top-0) + sub-columns О/З/Об/Д (top-[40px])
//   - 6 групп колонок: Производство(1 inline input) | РФ(1) | Иваново(1) | МП(4) | WB(4) | Ozon(4)
//   - rowSpan: Фото+Сводка rowSpan = 1 + N_articles (Сводная строка + per-article строки)
//   - DeficitCell: 3-уровневая цветовая кодировка (зелёный/жёлтый/красный)
//   - Inline productionStock input: debounced 500ms через updateProductionStock server action
//
// Sticky pattern: CLAUDE.md «Sticky data-таблицы» — border-separate + table-fixed + bg-background.
// Resize: lib/use-resizable-columns.ts hook (DB persist через UserPreference key "stock.columnWidths").

"use client"

import React, { useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { calculateStockMetrics, deficitThreshold } from "@/lib/stock-math"
import { updateProductionStock } from "@/app/actions/stock"
import {
  useResizableColumns,
  ColumnResizeHandle,
} from "@/lib/use-resizable-columns"
import { copyToClipboard } from "@/lib/copy-to-clipboard"
import type { StockProductRow } from "@/lib/stock-data"

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

function formatStockValue(n: number): string {
  if (n < 10) return n.toFixed(1)
  return Math.floor(n).toString()
}

function formatInt(n: number): string {
  return Math.trunc(n).toString()
}

// ──────────────────────────────────────────────────────────────────
// Resizable columns: keys + defaults
// ──────────────────────────────────────────────────────────────────

type StockColumnKey =
  | "photo"
  | "svodka"
  | "yarlyk"
  | "artikul"
  | "production"
  | "rf"
  | "ivanovo"
  | "mpO"
  | "mpZ"
  | "mpOb"
  | "mpD"
  | "wbO"
  | "wbZ"
  | "wbOb"
  | "wbD"
  | "ozonO"
  | "ozonZ"
  | "ozonOb"
  | "ozonD"

const STOCK_DEFAULT_WIDTHS: Record<StockColumnKey, number> = {
  photo: 80,
  svodka: 240,
  yarlyk: 80,
  artikul: 120,
  production: 88,
  rf: 70,
  ivanovo: 70,
  mpO: 60,
  mpZ: 60,
  mpOb: 60,
  mpD: 60,
  wbO: 60,
  wbZ: 60,
  wbOb: 60,
  wbD: 60,
  ozonO: 60,
  ozonZ: 60,
  ozonOb: 60,
  ozonD: 60,
}

// ──────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────

function StockCell({
  value,
  width,
}: {
  value: number | null
  width: number
}) {
  return (
    <TableCell
      style={{ width, minWidth: width }}
      className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right"
    >
      {value !== null ? (
        formatStockValue(value)
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </TableCell>
  )
}

function IntCell({
  value,
  width,
}: {
  value: number | null
  width: number
}) {
  return (
    <TableCell
      style={{ width, minWidth: width }}
      className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right"
    >
      {value !== null ? (
        formatInt(value)
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </TableCell>
  )
}

function DeficitCell({
  deficit,
  threshold,
  width,
}: {
  deficit: number | null
  threshold: number | null
  width: number
}) {
  return (
    <TableCell
      style={{ width, minWidth: width }}
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
  /** quick 260513-phu: persisted column widths from UserPreference. */
  initialColumnWidths?: Partial<Record<string, number>> | null
}

// ──────────────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────────────

export function StockProductTable({
  products,
  turnoverNormDays,
  initialColumnWidths,
}: StockProductTableProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // quick 260513-phu: resizable widths через shared hook
  const { widths, startResize, resetColumnWidth } =
    useResizableColumns<StockColumnKey>(
      "stock.columnWidths",
      STOCK_DEFAULT_WIDTHS,
      initialColumnWidths as Partial<Record<StockColumnKey, number>> | null,
    )

  // Cumulative sticky left offsets — пересчитываются на каждый render когда widths меняются
  const stickyLefts = {
    photo: 0,
    svodka: widths.photo,
    yarlyk: widths.photo + widths.svodka,
    artikul: widths.photo + widths.svodka + widths.yarlyk,
  }

  // Отдельный таймер на каждый productId — паттерн из GlobalRatesBar
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  )

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
    <div className="overflow-auto border rounded h-full">
      <table className="w-full caption-bottom text-sm border-separate border-spacing-0 table-fixed">
        <thead className="bg-background">
          {/* ── Уровень 1: группы колонок ── */}
          <tr>
            {/* Sticky 4 колонки с rowSpan=2 */}
            <TableHead
              rowSpan={2}
              style={{
                width: widths.photo,
                minWidth: widths.photo,
                left: stickyLefts.photo,
              }}
              className="sticky top-0 z-30 bg-background text-xs font-medium text-center border-b border-r align-middle relative"
            >
              Фото
              <ColumnResizeHandle
                onMouseDown={(e) => startResize(e, "photo")}
                onDoubleClick={() => resetColumnWidth("photo")}
              />
            </TableHead>
            <TableHead
              rowSpan={2}
              style={{
                width: widths.svodka,
                minWidth: widths.svodka,
                left: stickyLefts.svodka,
              }}
              className="sticky top-0 z-30 bg-background text-xs font-medium text-center border-b border-r align-middle relative"
            >
              Сводка
              <ColumnResizeHandle
                onMouseDown={(e) => startResize(e, "svodka")}
                onDoubleClick={() => resetColumnWidth("svodka")}
              />
            </TableHead>
            <TableHead
              rowSpan={2}
              style={{
                width: widths.yarlyk,
                minWidth: widths.yarlyk,
                left: stickyLefts.yarlyk,
              }}
              className="sticky top-0 z-30 bg-background text-xs font-medium text-center border-b border-r align-middle relative"
            >
              Ярлык
              <ColumnResizeHandle
                onMouseDown={(e) => startResize(e, "yarlyk")}
                onDoubleClick={() => resetColumnWidth("yarlyk")}
              />
            </TableHead>
            <TableHead
              rowSpan={2}
              style={{
                width: widths.artikul,
                minWidth: widths.artikul,
                left: stickyLefts.artikul,
              }}
              className="sticky top-0 z-30 bg-background text-xs font-medium text-center border-b border-r align-middle relative"
            >
              Артикул
              <ColumnResizeHandle
                onMouseDown={(e) => startResize(e, "artikul")}
                onDoubleClick={() => resetColumnWidth("artikul")}
              />
            </TableHead>

            {/* Группы: Производство, РФ, Иваново — по 1 колонке (rowSpan=2). */}
            <TableHead
              rowSpan={2}
              style={{ width: widths.production, minWidth: widths.production }}
              className="sticky top-0 z-20 bg-background text-xs font-medium text-center border-b border-r px-2 align-middle relative"
            >
              Производство
              <ColumnResizeHandle
                onMouseDown={(e) => startResize(e, "production")}
                onDoubleClick={() => resetColumnWidth("production")}
              />
            </TableHead>
            <TableHead
              rowSpan={2}
              style={{ width: widths.rf, minWidth: widths.rf }}
              className="sticky top-0 z-20 bg-background text-xs font-medium text-center border-b border-r px-2 align-middle relative"
              title="Итого по РФ = Иваново + МП"
            >
              РФ
              <ColumnResizeHandle
                onMouseDown={(e) => startResize(e, "rf")}
                onDoubleClick={() => resetColumnWidth("rf")}
              />
            </TableHead>
            <TableHead
              rowSpan={2}
              style={{ width: widths.ivanovo, minWidth: widths.ivanovo }}
              className="sticky top-0 z-20 bg-background text-xs font-medium text-center border-b border-r px-2 align-middle relative"
            >
              Иваново
              <ColumnResizeHandle
                onMouseDown={(e) => startResize(e, "ivanovo")}
                onDoubleClick={() => resetColumnWidth("ivanovo")}
              />
            </TableHead>

            {/* Группы: МП / WB / Ozon — colSpan=4 (header строки 1), без resize.
                Resize вешается на sub-columns О/З/Об/Д ниже. */}
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
            {/* МП / WB / Ozon — по 4 sub-columns каждая, с resize handle */}
            {(["mp", "wb", "ozon"] as const).flatMap((group) => {
              const keys: StockColumnKey[] = [
                `${group}O` as StockColumnKey,
                `${group}Z` as StockColumnKey,
                `${group}Ob` as StockColumnKey,
                `${group}D` as StockColumnKey,
              ]
              const titles = [
                "Остаток (шт)",
                "Заказы в день (шт/д)",
                "Оборачиваемость (дней)",
                "Дефицит (дней). Красный = срочно, жёлтый = пора думать, зелёный = всё ок",
              ]
              const labels = ["О", "З", "Об", "Д"]
              return keys.map((key, i) => {
                const isLast = i === 3
                return (
                  <TableHead
                    key={key}
                    style={{
                      width: widths[key],
                      minWidth: widths[key],
                      top: 40,
                    }}
                    className={cn(
                      "sticky z-20 bg-background text-xs text-muted-foreground text-center border-b px-2 py-1 align-middle relative",
                      isLast ? "border-r" : "",
                    )}
                    title={titles[i]}
                  >
                    {labels[i]}
                    <ColumnResizeHandle
                      onMouseDown={(e) => startResize(e, key)}
                      onDoubleClick={() => resetColumnWidth(key)}
                    />
                  </TableHead>
                )
              })
            })}
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
            const mpThreshold = deficitThreshold(
              turnoverNormDays,
              p.aggregates.mpTotalOrdersPerDay,
            )
            const wbThreshold = deficitThreshold(
              turnoverNormDays,
              p.aggregates.wbTotalOrdersPerDay,
            )

            return (
              <React.Fragment key={p.id}>
                {/* ── Сводная строка Product ── */}
                <TableRow
                  className={cn(idx > 0 && "border-t-4 border-t-border")}
                >
                  {/* Фото: rowSpan = 1 + N_articles */}
                  <TableCell
                    rowSpan={rowSpan}
                    style={{
                      width: widths.photo,
                      minWidth: widths.photo,
                      left: stickyLefts.photo,
                    }}
                    className="sticky z-20 bg-background border-r align-top p-2"
                  >
                    <div className="sticky top-2 flex justify-center">
                      {p.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
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

                  {/* Сводка: rowSpan, имя/sku/бренд/категория.
                      quick 260513-phu: Tooltip на name + copy SKU. */}
                  <TableCell
                    rowSpan={rowSpan}
                    style={{
                      width: widths.svodka,
                      minWidth: widths.svodka,
                      left: stickyLefts.svodka,
                    }}
                    className="sticky z-20 bg-background border-r align-top p-3"
                  >
                    <div className="flex flex-col gap-1">
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
                      <div
                        className="text-xs text-muted-foreground cursor-pointer hover:text-primary transition-colors"
                        onClick={(e) => {
                          e.stopPropagation()
                          void copyToClipboard(p.sku, "Артикул")
                        }}
                        title="Нажмите чтобы скопировать"
                      >
                        {p.sku}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.brandName}
                      </div>
                      {p.categoryName && (
                        <div className="text-xs text-muted-foreground">
                          {p.categoryName}
                        </div>
                      )}
                    </div>
                  </TableCell>

                  {/* Ярлык (ABC) — только в Сводной строке */}
                  <TableCell
                    style={{
                      width: widths.yarlyk,
                      minWidth: widths.yarlyk,
                      left: stickyLefts.yarlyk,
                    }}
                    className="sticky z-20 bg-background border-r align-top text-center text-xs"
                  >
                    {p.abcStatus ?? "—"}
                  </TableCell>

                  {/* Артикул Сводной = «Все» */}
                  <TableCell
                    style={{
                      width: widths.artikul,
                      minWidth: widths.artikul,
                      left: stickyLefts.artikul,
                    }}
                    className="sticky z-20 bg-background border-r text-xs font-medium"
                  >
                    Сводная
                  </TableCell>

                  {/* Производство — inline input.
                      width контролируется hook'ом → колонка стабильна и в Сводной (input), и в per-article (StockCell). */}
                  <TableCell
                    style={{
                      width: widths.production,
                      minWidth: widths.production,
                    }}
                    className="px-2 py-1 h-8 text-xs tabular-nums text-right"
                  >
                    <input
                      type="number"
                      min={0}
                      max={99999}
                      className="h-7 w-full rounded border border-input bg-transparent px-1.5 text-xs tabular-nums text-right focus:ring-2 focus:ring-ring outline-none"
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

                  {/* РФ — О (агрегат Иваново + МП, БЕЗ Производства) */}
                  <StockCell
                    value={p.aggregates.rfTotalStock}
                    width={widths.rf}
                  />

                  {/* Иваново — О */}
                  <StockCell value={p.ivanovoStock} width={widths.ivanovo} />

                  {/* МП О/З/Об/Д */}
                  <StockCell
                    value={p.aggregates.mpTotalStock}
                    width={widths.mpO}
                  />
                  <StockCell
                    value={p.aggregates.mpTotalOrdersPerDay}
                    width={widths.mpZ}
                  />
                  <IntCell value={mpMetrics.turnoverDays} width={widths.mpOb} />
                  <DeficitCell
                    deficit={mpMetrics.deficit}
                    threshold={mpThreshold}
                    width={widths.mpD}
                  />

                  {/* WB О/З/Об/Д */}
                  <StockCell
                    value={p.aggregates.wbTotalStock}
                    width={widths.wbO}
                  />
                  <StockCell
                    value={p.aggregates.wbTotalOrdersPerDay}
                    width={widths.wbZ}
                  />
                  <IntCell value={wbMetrics.turnoverDays} width={widths.wbOb} />
                  <DeficitCell
                    deficit={wbMetrics.deficit}
                    threshold={wbThreshold}
                    width={widths.wbD}
                  />

                  {/* Ozon — placeholder «—» */}
                  <StockCell value={null} width={widths.ozonO} />
                  <StockCell value={null} width={widths.ozonZ} />
                  <StockCell value={null} width={widths.ozonOb} />
                  <StockCell value={null} width={widths.ozonD} />
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
                    ? deficitThreshold(
                        turnoverNormDays,
                        a.wbCard!.avgSalesSpeed7d,
                      )
                    : null

                  return (
                    <TableRow key={a.id} className="border-t border-t-border/60">
                      {/* Фото + Сводка — заняты rowSpan из Сводной строки */}

                      {/* Ярлык — «—» для per-article строк */}
                      <TableCell
                        style={{
                          width: widths.yarlyk,
                          minWidth: widths.yarlyk,
                          left: stickyLefts.yarlyk,
                        }}
                        className="sticky z-20 bg-background border-r text-center text-xs text-muted-foreground"
                      >
                        —
                      </TableCell>

                      {/* Артикул — copy on click (quick 260513-phu) */}
                      <TableCell
                        style={{
                          width: widths.artikul,
                          minWidth: widths.artikul,
                          left: stickyLefts.artikul,
                        }}
                        className="sticky z-20 bg-background border-r text-xs cursor-pointer hover:text-primary transition-colors"
                        onClick={(e) => {
                          e.stopPropagation()
                          void copyToClipboard(a.article, "Артикул")
                        }}
                        title="Нажмите чтобы скопировать"
                      >
                        {a.marketplaceName}: {a.article}
                      </TableCell>

                      {/* Производство/РФ/Иваново — только агрегат в Сводной строке. */}
                      <TableCell
                        style={{
                          width: widths.production,
                          minWidth: widths.production,
                        }}
                        className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right text-muted-foreground"
                      >
                        —
                      </TableCell>
                      <StockCell value={null} width={widths.rf} />
                      <StockCell value={null} width={widths.ivanovo} />

                      {/* МП per-article (только WB сейчас) */}
                      <StockCell
                        value={isWb ? a.wbCard!.stockQty : null}
                        width={widths.mpO}
                      />
                      <StockCell
                        value={isWb ? a.wbCard!.avgSalesSpeed7d : null}
                        width={widths.mpZ}
                      />
                      <IntCell
                        value={aMetrics.turnoverDays}
                        width={widths.mpOb}
                      />
                      <DeficitCell
                        deficit={aMetrics.deficit}
                        threshold={aThreshold}
                        width={widths.mpD}
                      />

                      {/* WB per-article */}
                      <StockCell
                        value={isWb ? a.wbCard!.stockQty : null}
                        width={widths.wbO}
                      />
                      <StockCell
                        value={isWb ? a.wbCard!.avgSalesSpeed7d : null}
                        width={widths.wbZ}
                      />
                      <IntCell
                        value={aMetrics.turnoverDays}
                        width={widths.wbOb}
                      />
                      <DeficitCell
                        deficit={aMetrics.deficit}
                        threshold={aThreshold}
                        width={widths.wbD}
                      />

                      {/* Ozon — placeholder */}
                      <StockCell value={null} width={widths.ozonO} />
                      <StockCell value={null} width={widths.ozonZ} />
                      <StockCell value={null} width={widths.ozonOb} />
                      <StockCell value={null} width={widths.ozonD} />
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
