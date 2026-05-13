"use client"

// components/stock/StockWbTable.tsx
// Phase 14 (STOCK-22, STOCK-25): Client sticky-таблица /stock/wb с 7 кластерными колонками + expand.
// URL state: ?expandedClusters=ЦФО,ПФО — shareable.
// Quick 260513-phu: resizable columns + persist + Tooltip + copy nmId.
//
// Resize: 12 ключей (3 sticky + Иваново + Всего на WB + 3 «Товар в пути» + 4 «Итого склады WB»).
// Кластерные колонки — БЕЗ resize (их структура зависит от expand state).

import React, { useCallback, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { calculateStockMetrics, deficitThreshold } from "@/lib/stock-math"
import { CLUSTER_ORDER, type ClusterShortName } from "@/lib/wb-clusters"
import { ClusterTooltip } from "./ClusterTooltip"
import { WarehouseVisibilityPopover } from "./WarehouseVisibilityPopover"
import type {
  ProductWbGroup,
  StockWbDataResult,
} from "@/lib/stock-wb-data"
import { saveStockWbShowSizes } from "@/app/actions/stock-wb"
import {
  useResizableColumns,
  ColumnResizeHandle,
} from "@/lib/use-resizable-columns"
import { copyToClipboard } from "@/lib/copy-to-clipboard"

function formatStockValue(n: number): string {
  if (n < 10) return n.toFixed(1)
  return Math.floor(n).toString()
}

/** Целое с отбрасыванием дробной части (для Об, Д). */
function formatInt(n: number): string {
  return Math.trunc(n).toString()
}

// ──────────────────────────────────────────────────────────────────
// Resizable columns: keys + defaults (quick 260513-phu)
// ──────────────────────────────────────────────────────────────────

type StockWbColumnKey =
  | "photo"
  | "svodka"
  | "artikulWb"
  | "ivanovo"
  | "totalOnWb"
  | "inWayTotal"
  | "inWayFrom"
  | "inWayTo"
  | "totalO"
  | "totalZ"
  | "totalOb"
  | "totalD"

const STOCK_WB_DEFAULT_WIDTHS: Record<StockWbColumnKey, number> = {
  photo: 80,
  svodka: 240,
  artikulWb: 96,
  ivanovo: 80,
  totalOnWb: 80,
  inWayTotal: 60,
  inWayFrom: 60,
  inWayTo: 60,
  totalO: 60,
  totalZ: 60,
  totalOb: 60,
  totalD: 60,
}

interface Props {
  groups: ProductWbGroup[]
  turnoverNormDays: number
  clusterWarehouses: StockWbDataResult["clusterWarehouses"]
  hiddenWarehouseIds: number[] // quick 260422-oy5 — per-user hidden warehouses
  initialShowSizes: boolean
  /** quick 260513-phu: persisted column widths from UserPreference. */
  initialColumnWidths?: Partial<Record<string, number>> | null
}

function StockCell({ value, width }: { value: number | null; width: number }) {
  return (
    <TableCell
      style={{ width, minWidth: width }}
      className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right"
    >
      {value !== null ? formatStockValue(value) : <span className="text-muted-foreground">—</span>}
    </TableCell>
  )
}

/** Ячейка Об — целое с отбрасыванием дробной части. */
function IntCell({ value, width }: { value: number | null; width: number }) {
  return (
    <TableCell
      style={{ width, minWidth: width }}
      className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right"
    >
      {value !== null ? formatInt(value) : <span className="text-muted-foreground">—</span>}
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
        deficit !== null && threshold !== null && deficit > 0 && deficit < threshold && "text-yellow-600 dark:text-yellow-400",
        deficit !== null && threshold !== null && deficit >= threshold && "text-red-600 dark:text-red-500 font-medium",
      )}
    >
      {deficit !== null ? formatInt(deficit) : "—"}
    </TableCell>
  )
}

// Префикс имени склада, обозначающий сортировочный центр.
function isSortingCenter(name: string): boolean {
  return /^СЦ\s/i.test(name.trim())
}

export function StockWbTable({
  groups,
  turnoverNormDays,
  clusterWarehouses,
  hiddenWarehouseIds,
  initialShowSizes,
  initialColumnWidths,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // quick 260513-phu: resizable widths
  const { widths, startResize, resetColumnWidth } =
    useResizableColumns<StockWbColumnKey>(
      "stock.wb.columnWidths",
      STOCK_WB_DEFAULT_WIDTHS,
      initialColumnWidths as Partial<Record<StockWbColumnKey, number>> | null,
    )

  const stickyLefts = {
    photo: 0,
    svodka: widths.photo,
    artikulWb: widths.photo + widths.svodka,
  }

  const expandedSet = new Set<string>(
    (searchParams.get("expandedClusters") ?? "").split(",").filter(Boolean)
  )

  // По умолчанию СЦ скрыты. Явно "?hideSc=0" → показывать все склады.
  const hideSc = searchParams.get("hideSc") !== "0"

  // Quick 260422-oy5: optimistic локальный state для per-user hidden warehouses.
  const [hiddenIds, setHiddenIds] = useState<number[]>(hiddenWarehouseIds)
  const hiddenSet = new Set(hiddenIds)

  // Phase 16 (STOCK-36): toggle «По размерам» — optimistic + persist в БД
  const [showSizes, setShowSizes] = useState<boolean>(initialShowSizes)
  const [isShowSizesPending, startShowSizesTransition] = useTransition()

  const toggleShowSizes = useCallback(() => {
    const next = !showSizes
    setShowSizes(next) // optimistic
    startShowSizesTransition(async () => {
      const res = await saveStockWbShowSizes(next)
      if (!res.ok) {
        console.error("Не удалось сохранить «По размерам»:", res.error)
      }
    })
  }, [showSizes])

  // Отфильтрованные карты складов per-cluster для отображения при expand.
  const visibleClusterWarehouses: typeof clusterWarehouses = Object.fromEntries(
    CLUSTER_ORDER.map((c) => [
      c,
      (clusterWarehouses[c] ?? []).filter((w) => {
        if (hideSc && isSortingCenter(w.warehouseName)) return false
        if (hiddenSet.has(w.warehouseId)) return false
        return true
      }),
    ])
  ) as typeof clusterWarehouses

  const toggleHideSc = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (hideSc) params.set("hideSc", "0")
    else params.delete("hideSc")
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [hideSc, searchParams, router])

  const toggleCluster = useCallback((cluster: string) => {
    const next = new Set(expandedSet)
    if (next.has(cluster)) next.delete(cluster)
    else next.add(cluster)

    const params = new URLSearchParams(searchParams.toString())
    if (next.size > 0) params.set("expandedClusters", [...next].join(","))
    else params.delete("expandedClusters")
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [expandedSet, searchParams, router])

  const expandAll = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("expandedClusters", CLUSTER_ORDER.join(","))
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [searchParams, router])

  const collapseAll = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("expandedClusters")
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [searchParams, router])

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex gap-2 items-center shrink-0">
        <Button variant="ghost" size="sm" onClick={expandAll}>Развернуть все</Button>
        <Button variant="ghost" size="sm" onClick={collapseAll}>Свернуть все</Button>
        <span className="text-muted-foreground mx-2">·</span>
        <Button
          variant={hideSc ? "default" : "outline"}
          size="sm"
          onClick={toggleHideSc}
          title={hideSc ? "Сейчас: только основные склады. Нажать — показать все (включая СЦ)" : "Сейчас: все склады. Нажать — скрыть СЦ (их остатки учитываются в кластере)"}
        >
          {hideSc ? "Без СЦ" : "Все склады"}
        </Button>
        <WarehouseVisibilityPopover
          clusterWarehouses={clusterWarehouses}
          hiddenIds={hiddenIds}
          onChange={setHiddenIds}
        />
        <Button
          variant={showSizes ? "default" : "outline"}
          size="sm"
          onClick={toggleShowSizes}
          disabled={isShowSizesPending}
          title={
            showSizes
              ? "Сейчас: размерные строки видны под каждым артикулом. Нажать — скрыть."
              : "Сейчас: размерные строки скрыты. Нажать — показать per-size разбивку."
          }
        >
          По размерам
        </Button>
      </div>

      <div className="overflow-auto border rounded flex-1 min-h-0">
        {/* quick 260513-phu hotfix: убрали table-fixed — с multi-row headers (rowSpan=3 +
            colSpan для кластеров) + динамическими cluster columns table-fixed требует
            <colgroup> рассчитываемый runtime'ом, что хрупко. Без table-fixed browser
            использует widths из cells (style={{ width }} на <th>/<td>). Resize всё равно
            работает — handle обновляет state, widths применяются. */}
        <table className="w-full caption-bottom text-sm border-separate border-spacing-0">
          <thead className="bg-background">
            {/* Уровень 1 — группы (sticky 3 cols rowSpan=3, Иваново/Всего на WB rowSpan=3, остальные rowSpan=2) */}
            <tr>
              <TableHead
                style={{
                  width: widths.photo,
                  minWidth: widths.photo,
                  left: stickyLefts.photo,
                }}
                className="sticky top-0 z-30 bg-background text-xs font-medium text-center border-b border-r relative"
                rowSpan={3}
              >
                Фото
                <ColumnResizeHandle
                  onMouseDown={(e) => startResize(e, "photo")}
                  onDoubleClick={() => resetColumnWidth("photo")}
                />
              </TableHead>
              <TableHead
                style={{
                  width: widths.svodka,
                  minWidth: widths.svodka,
                  left: stickyLefts.svodka,
                }}
                className="sticky top-0 z-30 bg-background text-xs font-medium text-center border-b border-r relative"
                rowSpan={3}
              >
                Сводка
                <ColumnResizeHandle
                  onMouseDown={(e) => startResize(e, "svodka")}
                  onDoubleClick={() => resetColumnWidth("svodka")}
                />
              </TableHead>
              <TableHead
                style={{
                  width: widths.artikulWb,
                  minWidth: widths.artikulWb,
                  left: stickyLefts.artikulWb,
                }}
                className="sticky top-0 z-30 bg-background text-xs font-medium text-center border-b border-r relative"
                rowSpan={3}
              >
                Артикул WB
                <ColumnResizeHandle
                  onMouseDown={(e) => startResize(e, "artikulWb")}
                  onDoubleClick={() => resetColumnWidth("artikulWb")}
                />
              </TableHead>
              {/* Иваново — Product-level, rowSpan=3 */}
              <TableHead
                style={{ width: widths.ivanovo, minWidth: widths.ivanovo }}
                className="sticky top-0 z-20 bg-background text-xs font-medium text-center border-b border-r px-2 py-1 h-[92px] relative"
                rowSpan={3}
                title="Остаток на складе Иваново (из Excel)"
              >
                Иваново
                <ColumnResizeHandle
                  onMouseDown={(e) => startResize(e, "ivanovo")}
                  onDoubleClick={() => resetColumnWidth("ivanovo")}
                />
              </TableHead>
              {/* Всего на WB — 1 колонка, rowSpan=3 */}
              <TableHead
                style={{ width: widths.totalOnWb, minWidth: widths.totalOnWb }}
                className="sticky top-0 z-20 bg-background text-xs font-medium text-center border-b border-r px-2 py-1 h-[92px] relative"
                colSpan={1}
                rowSpan={3}
                title="Физический остаток по всем складам + Товар в пути (всего)"
              >
                Всего на WB
                <ColumnResizeHandle
                  onMouseDown={(e) => startResize(e, "totalOnWb")}
                  onDoubleClick={() => resetColumnWidth("totalOnWb")}
                />
              </TableHead>
              {/* Товар в пути — 3 cols (rowSpan=2) */}
              <TableHead
                className="sticky top-0 z-20 bg-background text-xs font-medium text-center border-b border-r px-2 py-1 h-[68px]"
                colSpan={3}
                rowSpan={2}
                title="Товар в пути (агрегат по nmId)"
              >
                Товар в пути
              </TableHead>
              {/* Итого склады WB — 4 cols (rowSpan=2) */}
              <TableHead
                className="sticky top-0 z-20 bg-background text-xs font-medium text-center border-b border-r px-2 py-1 h-[68px]"
                colSpan={4}
                rowSpan={2}
                title="Итого по всем складам WB (физ. остаток, без товара в пути)"
              >
                Итого склады WB
              </TableHead>
              {/* 7 кластерных колонок — БЕЗ resize (структура зависит от expand) */}
              {CLUSTER_ORDER.map((cluster) => {
                const isExpanded = expandedSet.has(cluster)
                const allWarehouses = clusterWarehouses[cluster] ?? []
                const visibleWarehouses = visibleClusterWarehouses[cluster] ?? []
                const colSpan = isExpanded
                  ? (visibleWarehouses.length > 0 ? visibleWarehouses.length * 4 : 4)
                  : 4
                const rowSpan = isExpanded ? 1 : 2
                return (
                  <TableHead
                    key={cluster}
                    colSpan={colSpan}
                    rowSpan={rowSpan}
                    className={cn(
                      "sticky top-0 z-20 bg-background text-xs font-medium text-center border-b border-r px-2 py-1",
                      isExpanded ? "h-10" : "h-[68px]"
                    )}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <ClusterTooltip shortName={cluster} warehouseCount={allWarehouses.length}>
                        <span>{cluster}</span>
                      </ClusterTooltip>
                      <button
                        type="button"
                        onClick={() => toggleCluster(cluster)}
                        className="inline-flex items-center justify-center h-7 px-2.5 ml-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent hover:border-primary transition-colors cursor-pointer"
                        aria-label={isExpanded ? `Свернуть кластер ${cluster}` : `Развернуть кластер ${cluster}`}
                        title={isExpanded ? `Свернуть ${cluster}` : `Развернуть ${cluster}`}
                      >
                        {isExpanded ? <ChevronLeft size={16} strokeWidth={2.5} /> : <ChevronRight size={16} strokeWidth={2.5} />}
                      </button>
                    </div>
                  </TableHead>
                )
              })}
            </tr>
            {/* Уровень 2 — имя склада (только для expanded). Collapsed кластер уже занимает row 1+2 через rowSpan=2. */}
            <tr>
              {CLUSTER_ORDER.flatMap((cluster) => {
                const isExpanded = expandedSet.has(cluster)
                const warehouses = visibleClusterWarehouses[cluster] ?? []

                if (!isExpanded) return []

                if (warehouses.length > 0) {
                  return warehouses.map((w, idx) => (
                    <TableHead
                      key={`${cluster}-wh-${w.warehouseId}`}
                      colSpan={4}
                      className={cn(
                        "sticky top-[40px] z-20 bg-background text-xs text-center border-b h-7 px-2 py-1",
                        idx === warehouses.length - 1
                          ? "border-r"
                          : "border-r border-r-border/40",
                        w.needsClusterReview && "text-yellow-600"
                      )}
                      title={w.warehouseName}
                    >
                      <span className="line-clamp-1">
                        {w.needsClusterReview && <span className="mr-1">⚠️</span>}
                        {w.warehouseName}
                      </span>
                    </TableHead>
                  ))
                }

                return [
                  <TableHead
                    key={`${cluster}-placeholder-lvl2`}
                    colSpan={4}
                    className="sticky top-[40px] z-20 bg-background text-[10px] text-muted-foreground text-center border-b border-r h-7 px-2"
                  >
                    нет складов
                  </TableHead>
                ]
              })}
            </tr>
            {/* Уровень 3 — О/З/Об/Д */}
            <tr>
              {/* Товар в пути — 3 cells Всего / от / к (с resize) */}
              <TableHead
                style={{ width: widths.inWayTotal, minWidth: widths.inWayTotal, top: 68 }}
                className="sticky z-20 bg-background text-xs text-muted-foreground text-center border-b h-6 px-2 py-0 relative"
                title="Всего в пути (к + от клиента)"
              >
                Всего
                <ColumnResizeHandle
                  onMouseDown={(e) => startResize(e, "inWayTotal")}
                  onDoubleClick={() => resetColumnWidth("inWayTotal")}
                />
              </TableHead>
              <TableHead
                style={{ width: widths.inWayFrom, minWidth: widths.inWayFrom, top: 68 }}
                className="sticky z-20 bg-background text-xs text-muted-foreground text-center border-b h-6 px-2 py-0 relative"
                title="В пути ОТ клиента (возвраты)"
              >
                от
                <ColumnResizeHandle
                  onMouseDown={(e) => startResize(e, "inWayFrom")}
                  onDoubleClick={() => resetColumnWidth("inWayFrom")}
                />
              </TableHead>
              <TableHead
                style={{ width: widths.inWayTo, minWidth: widths.inWayTo, top: 68 }}
                className="sticky z-20 bg-background text-xs text-muted-foreground text-center border-b border-r h-6 px-2 py-0 relative"
                title="В пути К клиенту"
              >
                к
                <ColumnResizeHandle
                  onMouseDown={(e) => startResize(e, "inWayTo")}
                  onDoubleClick={() => resetColumnWidth("inWayTo")}
                />
              </TableHead>
              {/* Итого склады WB — 4 cells O/З/Об/Д (с resize) */}
              <TableHead
                style={{ width: widths.totalO, minWidth: widths.totalO, top: 68 }}
                className="sticky z-20 bg-background text-xs text-muted-foreground text-center border-b h-6 px-2 py-0 relative"
                title="Остаток (физ., без in-way)"
              >
                О
                <ColumnResizeHandle
                  onMouseDown={(e) => startResize(e, "totalO")}
                  onDoubleClick={() => resetColumnWidth("totalO")}
                />
              </TableHead>
              <TableHead
                style={{ width: widths.totalZ, minWidth: widths.totalZ, top: 68 }}
                className="sticky z-20 bg-background text-xs text-muted-foreground text-center border-b h-6 px-2 py-0 relative"
                title="Заказы/день"
              >
                З
                <ColumnResizeHandle
                  onMouseDown={(e) => startResize(e, "totalZ")}
                  onDoubleClick={() => resetColumnWidth("totalZ")}
                />
              </TableHead>
              <TableHead
                style={{ width: widths.totalOb, minWidth: widths.totalOb, top: 68 }}
                className="sticky z-20 bg-background text-xs text-muted-foreground text-center border-b h-6 px-2 py-0 relative"
                title="Оборачиваемость"
              >
                Об
                <ColumnResizeHandle
                  onMouseDown={(e) => startResize(e, "totalOb")}
                  onDoubleClick={() => resetColumnWidth("totalOb")}
                />
              </TableHead>
              <TableHead
                style={{ width: widths.totalD, minWidth: widths.totalD, top: 68 }}
                className="sticky z-20 bg-background text-xs text-muted-foreground text-center border-b border-r h-6 px-2 py-0 relative"
                title="Дефицит"
              >
                Д
                <ColumnResizeHandle
                  onMouseDown={(e) => startResize(e, "totalD")}
                  onDoubleClick={() => resetColumnWidth("totalD")}
                />
              </TableHead>
              {CLUSTER_ORDER.flatMap((cluster) => {
                const isExpanded = expandedSet.has(cluster)
                const warehouses = visibleClusterWarehouses[cluster] ?? []

                if (isExpanded && warehouses.length > 0) {
                  return warehouses.flatMap((w, idx) => {
                    const lastWarehouse = idx === warehouses.length - 1
                    return [
                      <TableHead key={`${cluster}-${w.warehouseId}-o`} className="sticky top-[68px] z-20 bg-background text-[10px] text-muted-foreground text-center border-b h-6 px-1 py-0" title="Остаток">О</TableHead>,
                      <TableHead key={`${cluster}-${w.warehouseId}-z`} className="sticky top-[68px] z-20 bg-background text-[10px] text-muted-foreground text-center border-b h-6 px-1 py-0" title="Заказы/день">З</TableHead>,
                      <TableHead key={`${cluster}-${w.warehouseId}-ob`} className="sticky top-[68px] z-20 bg-background text-[10px] text-muted-foreground text-center border-b h-6 px-1 py-0" title="Оборачиваемость">Об</TableHead>,
                      <TableHead key={`${cluster}-${w.warehouseId}-d`} className={cn("sticky top-[68px] z-20 bg-background text-[10px] text-muted-foreground text-center border-b h-6 px-1 py-0", lastWarehouse ? "border-r" : "border-r border-r-border/40")} title="Дефицит">Д</TableHead>,
                    ]
                  })
                }

                return [
                  <TableHead key={`${cluster}-o`} className="sticky top-[68px] z-20 bg-background text-xs text-muted-foreground text-center border-b h-6 px-2 py-0" title="Остаток">О</TableHead>,
                  <TableHead key={`${cluster}-z`} className="sticky top-[68px] z-20 bg-background text-xs text-muted-foreground text-center border-b h-6 px-2 py-0" title="Заказы/день">З</TableHead>,
                  <TableHead key={`${cluster}-ob`} className="sticky top-[68px] z-20 bg-background text-xs text-muted-foreground text-center border-b h-6 px-2 py-0" title="Оборачиваемость">Об</TableHead>,
                  <TableHead key={`${cluster}-d`} className="sticky top-[68px] z-20 bg-background text-xs text-muted-foreground text-center border-b border-r h-6 px-2 py-0" title="Дефицит">Д</TableHead>,
                ]
              })}
            </tr>
          </thead>
          <TableBody>
            {groups.map((g, idx) => {
              const totalSizeRows = showSizes
                ? g.wbCards.reduce(
                    (acc, c) => acc + (c.hasMultipleSizes ? c.sizeBreakdown.length : 0),
                    0,
                  )
                : 0
              const rowSpan = 1 + g.wbCards.length + totalSizeRows

              const rowTotalStock = g.wbCards.reduce<number | null>(
                (acc, c) => (c.totalStock === null ? acc : (acc ?? 0) + c.totalStock),
                null,
              )
              const rowOrdersPerDay = g.wbCards.reduce<number | null>(
                (acc, c) => (c.avgSalesSpeed7d === null ? acc : (acc ?? 0) + c.avgSalesSpeed7d),
                null,
              )
              const rowInWayTo = g.wbCards.reduce<number | null>(
                (acc, c) => (c.inWayToClient === null ? acc : (acc ?? 0) + c.inWayToClient),
                null,
              )
              const rowInWayFrom = g.wbCards.reduce<number | null>(
                (acc, c) => (c.inWayFromClient === null ? acc : (acc ?? 0) + c.inWayFromClient),
                null,
              )
              const rowInWayTotal =
                rowInWayTo === null && rowInWayFrom === null
                  ? null
                  : (rowInWayTo ?? 0) + (rowInWayFrom ?? 0)
              const rowTotalOnWb =
                rowTotalStock === null && rowInWayTotal === null
                  ? null
                  : (rowTotalStock ?? 0) + (rowInWayTotal ?? 0)
              const rowMetrics = calculateStockMetrics({
                stock: rowTotalStock,
                ordersPerDay: rowOrdersPerDay,
                turnoverNormDays,
              })
              const rowThreshold = deficitThreshold(turnoverNormDays, rowOrdersPerDay)

              const rowClusterAgg = Object.fromEntries(
                CLUSTER_ORDER.map((cluster) => {
                  const stockSum = g.wbCards.reduce<number | null>((acc, c) => {
                    const t = c.clusters[cluster as ClusterShortName]?.totalStock
                    return t == null ? acc : (acc ?? 0) + t
                  }, null)
                  const ordSum = g.wbCards.reduce<number | null>((acc, c) => {
                    const t = c.clusters[cluster as ClusterShortName]?.ordersPerDay
                    return t == null ? acc : (acc ?? 0) + t
                  }, null)
                  return [cluster, { stock: stockSum, orders: ordSum }]
                })
              ) as Record<ClusterShortName, { stock: number | null; orders: number | null }>

              return (
                <React.Fragment key={g.productId}>
                  {/* Product Сводная строка */}
                  <TableRow className={cn(idx > 0 && "border-t-4 border-t-border")}>
                    <TableCell
                      rowSpan={rowSpan}
                      style={{
                        width: widths.photo,
                        minWidth: widths.photo,
                        left: stickyLefts.photo,
                      }}
                      className="sticky z-20 bg-background border-r align-top p-2"
                    >
                      <div className="flex justify-center">
                        {g.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={g.photoUrl}
                            alt={g.productName}
                            width={72}
                            height={96}
                            className="rounded border object-cover aspect-[3/4]"
                          />
                        ) : (
                          <div className="w-[72px] h-[96px] rounded border bg-muted/30 flex items-center justify-center text-xs text-muted-foreground">—</div>
                        )}
                      </div>
                    </TableCell>
                    {/* Сводка — Tooltip на name + copy SKU (quick 260513-phu) */}
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
                            {g.productName}
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="max-w-sm text-sm">{g.productName}</div>
                          </TooltipContent>
                        </Tooltip>
                        <div
                          className="text-xs text-muted-foreground cursor-pointer hover:text-primary transition-colors"
                          onClick={(e) => {
                            e.stopPropagation()
                            void copyToClipboard(g.productSku, "Артикул")
                          }}
                          title="Нажмите чтобы скопировать"
                        >
                          {g.productSku}
                        </div>
                        <div className="text-xs text-muted-foreground">{g.brandName}</div>
                      </div>
                    </TableCell>
                    {/* Артикул WB — Сводная */}
                    <TableCell
                      style={{
                        width: widths.artikulWb,
                        minWidth: widths.artikulWb,
                        left: stickyLefts.artikulWb,
                      }}
                      className="sticky z-20 bg-background border-r align-top text-xs font-medium text-center"
                    >
                      Сводная
                    </TableCell>
                    {/* Иваново — Product-level */}
                    <TableCell
                      style={{ width: widths.ivanovo, minWidth: widths.ivanovo }}
                      className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right border-r"
                    >
                      {g.ivanovoStock !== null ? formatInt(g.ivanovoStock) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    {/* Всего на WB */}
                    <TableCell
                      style={{ width: widths.totalOnWb, minWidth: widths.totalOnWb }}
                      className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right border-r"
                    >
                      {rowTotalOnWb !== null ? formatInt(rowTotalOnWb) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    {/* Товар в пути — Всего/от/к */}
                    <IntCell value={rowInWayTotal} width={widths.inWayTotal} />
                    <IntCell value={rowInWayFrom} width={widths.inWayFrom} />
                    <TableCell
                      style={{ width: widths.inWayTo, minWidth: widths.inWayTo }}
                      className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right border-r"
                    >
                      {rowInWayTo !== null ? formatInt(rowInWayTo) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    {/* Итого склады WB — О/З/Об/Д */}
                    <StockCell value={rowTotalStock} width={widths.totalO} />
                    <StockCell value={rowOrdersPerDay} width={widths.totalZ} />
                    <IntCell value={rowMetrics.turnoverDays} width={widths.totalOb} />
                    <DeficitCell deficit={rowMetrics.deficit} threshold={rowThreshold} width={widths.totalD} />
                    {/* Кластеры — row-level агрегат */}
                    {CLUSTER_ORDER.flatMap((cluster) => {
                      const isExpanded = expandedSet.has(cluster)
                      const warehouses = visibleClusterWarehouses[cluster as ClusterShortName] ?? []
                      const agg = rowClusterAgg[cluster as ClusterShortName]

                      if (isExpanded) {
                        const groupCount = warehouses.length > 0 ? warehouses.length : 1
                        return Array.from({ length: groupCount }, (_, i) => (
                          <TableCell
                            key={`${cluster}-sum-wh-${i}`}
                            colSpan={4}
                            className={cn(
                              "px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right text-muted-foreground",
                              i === groupCount - 1
                                ? "border-r"
                                : "border-r border-r-border/40"
                            )}
                          >—</TableCell>
                        ))
                      }

                      const aggMetrics = calculateStockMetrics({
                        stock: agg?.stock ?? null,
                        ordersPerDay: agg?.orders ?? null,
                        turnoverNormDays,
                      })
                      const aggThreshold = deficitThreshold(turnoverNormDays, agg?.orders ?? null)
                      // Кластерные ячейки — без resize, использую дефолтную ширину 60px
                      const clusterW = 60
                      return [
                        <StockCell key={`${cluster}-sum-o`} value={agg?.stock ?? null} width={clusterW} />,
                        <StockCell key={`${cluster}-sum-z`} value={agg?.orders ?? null} width={clusterW} />,
                        <IntCell key={`${cluster}-sum-ob`} value={aggMetrics.turnoverDays} width={clusterW} />,
                        <DeficitCell key={`${cluster}-sum-d`} deficit={aggMetrics.deficit} threshold={aggThreshold} width={clusterW} />,
                      ]
                    })}
                  </TableRow>

                  {/* Per-nmId rows */}
                  {g.wbCards.map((card) => {
                    const cardMetrics = calculateStockMetrics({
                      stock: card.totalStock,
                      ordersPerDay: card.avgSalesSpeed7d,
                      turnoverNormDays,
                    })
                    const cardThreshold = deficitThreshold(turnoverNormDays, card.avgSalesSpeed7d)

                    return (
                      <React.Fragment key={card.wbCardId}>
                        <TableRow className="border-t border-t-border/60">
                          {/* Артикул WB — copy on click (quick 260513-phu) */}
                          <TableCell
                            style={{
                              width: widths.artikulWb,
                              minWidth: widths.artikulWb,
                              left: stickyLefts.artikulWb,
                            }}
                            className="sticky z-20 bg-background border-r text-xs tabular-nums cursor-pointer hover:text-primary transition-colors"
                            onClick={(e) => {
                              e.stopPropagation()
                              void copyToClipboard(String(card.nmId), "Артикул")
                            }}
                            title="Нажмите чтобы скопировать"
                          >
                            {card.nmId}
                          </TableCell>
                          {/* Иваново — placeholder в per-nmId */}
                          <TableCell
                            style={{ width: widths.ivanovo, minWidth: widths.ivanovo }}
                            className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right border-r text-muted-foreground"
                          >
                            —
                          </TableCell>
                          {/* Card-level Всего на WB + in-way */}
                          {(() => {
                            const cardInWayTotal =
                              card.inWayToClient === null && card.inWayFromClient === null
                                ? null
                                : (card.inWayToClient ?? 0) + (card.inWayFromClient ?? 0)
                            const cardTotalOnWb =
                              card.totalStock === null && cardInWayTotal === null
                                ? null
                                : (card.totalStock ?? 0) + (cardInWayTotal ?? 0)
                            return (
                              <>
                                <TableCell
                                  style={{ width: widths.totalOnWb, minWidth: widths.totalOnWb }}
                                  className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right border-r"
                                >
                                  {cardTotalOnWb !== null ? formatInt(cardTotalOnWb) : <span className="text-muted-foreground">—</span>}
                                </TableCell>
                                <IntCell value={cardInWayTotal} width={widths.inWayTotal} />
                                <IntCell value={card.inWayFromClient} width={widths.inWayFrom} />
                                <TableCell
                                  style={{ width: widths.inWayTo, minWidth: widths.inWayTo }}
                                  className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right border-r"
                                >
                                  {card.inWayToClient !== null ? formatInt(card.inWayToClient) : <span className="text-muted-foreground">—</span>}
                                </TableCell>
                              </>
                            )
                          })()}
                          {/* Итого склады WB О/З/Об/Д */}
                          <StockCell value={card.totalStock} width={widths.totalO} />
                          <StockCell value={card.avgSalesSpeed7d} width={widths.totalZ} />
                          <IntCell value={cardMetrics.turnoverDays} width={widths.totalOb} />
                          <DeficitCell deficit={cardMetrics.deficit} threshold={cardThreshold} width={widths.totalD} />
                          {/* Кластеры */}
                          {CLUSTER_ORDER.flatMap((cluster) => {
                            const isExpanded = expandedSet.has(cluster)
                            const clusterData = card.clusters[cluster as ClusterShortName]
                            const warehouses = visibleClusterWarehouses[cluster as ClusterShortName] ?? []
                            const clusterW = 60

                            if (isExpanded) {
                              if (warehouses.length === 0) {
                                return [
                                  <TableCell key={`${card.wbCardId}-${cluster}-empty`} colSpan={4} className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right text-muted-foreground border-r">—</TableCell>
                                ]
                              }
                              return warehouses.flatMap((w, wIdx) => {
                                const slot = clusterData?.warehouses.find((s) => s.warehouseId === w.warehouseId)
                                const whStock = slot?.quantity ?? null
                                const whOrdersPerDay = slot?.ordersPerDay ?? null
                                const whMetrics = calculateStockMetrics({
                                  stock: whStock,
                                  ordersPerDay: whOrdersPerDay,
                                  turnoverNormDays,
                                })
                                const whThreshold = deficitThreshold(turnoverNormDays, whOrdersPerDay)
                                const lastWarehouse = wIdx === warehouses.length - 1
                                return [
                                  <StockCell key={`${card.wbCardId}-${cluster}-${w.warehouseId}-o`} value={whStock} width={clusterW} />,
                                  <StockCell key={`${card.wbCardId}-${cluster}-${w.warehouseId}-z`} value={whOrdersPerDay} width={clusterW} />,
                                  <IntCell key={`${card.wbCardId}-${cluster}-${w.warehouseId}-ob`} value={whMetrics.turnoverDays} width={clusterW} />,
                                  <TableCell
                                    key={`${card.wbCardId}-${cluster}-${w.warehouseId}-d`}
                                    style={{ width: clusterW, minWidth: clusterW }}
                                    className={cn(
                                      "px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right",
                                      lastWarehouse ? "border-r" : "border-r border-r-border/40",
                                      whMetrics.deficit === null && "text-muted-foreground",
                                      whMetrics.deficit !== null && whMetrics.deficit <= 0 && "text-green-600 dark:text-green-500",
                                      whMetrics.deficit !== null && whThreshold !== null && whMetrics.deficit > 0 && whMetrics.deficit < whThreshold && "text-yellow-600 dark:text-yellow-400",
                                      whMetrics.deficit !== null && whThreshold !== null && whMetrics.deficit >= whThreshold && "text-red-600 dark:text-red-500 font-medium",
                                    )}
                                  >
                                    {whMetrics.deficit !== null ? formatInt(whMetrics.deficit) : "—"}
                                  </TableCell>,
                                ]
                              })
                            }

                            const clusterOrdersPerDay = clusterData?.ordersPerDay ?? null
                            const clusterMetrics = calculateStockMetrics({
                              stock: clusterData?.totalStock ?? null,
                              ordersPerDay: clusterOrdersPerDay,
                              turnoverNormDays,
                            })
                            const clusterThreshold = deficitThreshold(turnoverNormDays, clusterOrdersPerDay)
                            return [
                              <StockCell key={`${card.wbCardId}-${cluster}-o`} value={clusterData?.totalStock ?? null} width={clusterW} />,
                              <StockCell key={`${card.wbCardId}-${cluster}-z`} value={clusterOrdersPerDay} width={clusterW} />,
                              <IntCell key={`${card.wbCardId}-${cluster}-ob`} value={clusterMetrics.turnoverDays} width={clusterW} />,
                              <DeficitCell key={`${card.wbCardId}-${cluster}-d`} deficit={clusterMetrics.deficit} threshold={clusterThreshold} width={clusterW} />,
                            ]
                          })}
                        </TableRow>
                        {/* Phase 16 (STOCK-36): размерные строки под per-nmId */}
                        {showSizes && card.hasMultipleSizes && card.sizeBreakdown.map((sizeRow) => (
                          <TableRow
                            key={`${card.wbCardId}-size-${sizeRow.techSize}`}
                            className="border-t border-t-border/40 bg-muted"
                          >
                            <TableCell
                              style={{
                                width: widths.artikulWb,
                                minWidth: widths.artikulWb,
                                left: stickyLefts.artikulWb,
                              }}
                              className="sticky z-20 bg-muted border-r text-xs tabular-nums"
                            >
                              <span className="text-muted-foreground pl-3">↳ {sizeRow.techSize || "—"}</span>
                            </TableCell>
                            <TableCell
                              style={{ width: widths.ivanovo, minWidth: widths.ivanovo }}
                              className="px-2 py-1 h-8 text-xs text-right border-r text-muted-foreground"
                            >—</TableCell>
                            <TableCell
                              style={{ width: widths.totalOnWb, minWidth: widths.totalOnWb }}
                              className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right border-r"
                            >
                              {sizeRow.totalStock !== null ? formatInt(sizeRow.totalStock) : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell style={{ width: widths.inWayTotal, minWidth: widths.inWayTotal }} className="px-2 py-1 h-8 text-xs text-right text-muted-foreground">—</TableCell>
                            <TableCell style={{ width: widths.inWayFrom, minWidth: widths.inWayFrom }} className="px-2 py-1 h-8 text-xs text-right text-muted-foreground">—</TableCell>
                            <TableCell style={{ width: widths.inWayTo, minWidth: widths.inWayTo }} className="px-2 py-1 h-8 text-xs text-right text-muted-foreground border-r">—</TableCell>
                            <StockCell value={sizeRow.totalStock} width={widths.totalO} />
                            <StockCell value={null} width={widths.totalZ} />
                            <IntCell value={null} width={widths.totalOb} />
                            <DeficitCell deficit={null} threshold={null} width={widths.totalD} />
                            {CLUSTER_ORDER.flatMap((cluster) => {
                              const isExpanded = expandedSet.has(cluster)
                              const visibleWarehouses = visibleClusterWarehouses[cluster as ClusterShortName] ?? []
                              const sizeClusterAgg = sizeRow.clusters[cluster as ClusterShortName]
                              const clusterW = 60
                              if (isExpanded) {
                                if (visibleWarehouses.length === 0) {
                                  return [
                                    <TableCell key={`${cluster}-size-empty`} colSpan={4} className="px-2 py-1 h-8 text-xs text-right text-muted-foreground border-r">—</TableCell>,
                                  ]
                                }
                                return visibleWarehouses.flatMap((w, idx) => {
                                  const isLast = idx === visibleWarehouses.length - 1
                                  const borderClass = isLast ? "border-r" : "border-r border-r-border/40"
                                  const slot = sizeClusterAgg.warehouses.find((slotW) => slotW.warehouseId === w.warehouseId)
                                  const slotQty = slot?.quantity ?? 0
                                  return [
                                    <StockCell key={`${cluster}-size-${w.warehouseId}-o`} value={slotQty} width={clusterW} />,
                                    <StockCell key={`${cluster}-size-${w.warehouseId}-z`} value={null} width={clusterW} />,
                                    <IntCell key={`${cluster}-size-${w.warehouseId}-ob`} value={null} width={clusterW} />,
                                    <TableCell
                                      key={`${cluster}-size-${w.warehouseId}-d`}
                                      style={{ width: clusterW, minWidth: clusterW }}
                                      className={cn(
                                        "px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right text-muted-foreground",
                                        borderClass,
                                      )}
                                    >—</TableCell>,
                                  ]
                                })
                              }
                              return [
                                <StockCell key={`${cluster}-size-o`} value={sizeClusterAgg.totalStock ?? null} width={clusterW} />,
                                <StockCell key={`${cluster}-size-z`} value={null} width={clusterW} />,
                                <IntCell key={`${cluster}-size-ob`} value={null} width={clusterW} />,
                                <DeficitCell key={`${cluster}-size-d`} deficit={null} threshold={null} width={clusterW} />,
                              ]
                            })}
                          </TableRow>
                        ))}
                      </React.Fragment>
                    )
                  })}
                </React.Fragment>
              )
            })}
          </TableBody>
        </table>
      </div>
    </div>
  )
}
