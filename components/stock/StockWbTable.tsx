"use client"

// components/stock/StockWbTable.tsx
// Phase 14 (STOCK-22, STOCK-25): Client sticky-таблица /stock/wb с 7 кластерными колонками + expand.
// URL state: ?expandedClusters=ЦФО,ПФО — shareable.

import React, { useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { calculateStockMetrics, deficitThreshold } from "@/lib/stock-math"
import { CLUSTER_ORDER, type ClusterShortName } from "@/lib/wb-clusters"
import { ClusterTooltip } from "./ClusterTooltip"
import type { ProductWbGroup, StockWbDataResult } from "@/lib/stock-wb-data"

function formatStockValue(n: number): string {
  if (n < 10) return n.toFixed(1)
  return Math.floor(n).toString()
}

interface Props {
  groups: ProductWbGroup[]
  turnoverNormDays: number
  clusterWarehouses: StockWbDataResult["clusterWarehouses"]
}

function StockCell({ value }: { value: number | null }) {
  return (
    <TableCell className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right">
      {value !== null ? formatStockValue(value) : <span className="text-muted-foreground">—</span>}
    </TableCell>
  )
}

function DeficitCell({ deficit, threshold }: { deficit: number | null; threshold: number | null }) {
  return (
    <TableCell
      className={cn(
        "px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right border-r",
        deficit === null && "text-muted-foreground",
        deficit !== null && deficit <= 0 && "text-green-600 dark:text-green-500",
        deficit !== null && threshold !== null && deficit > 0 && deficit < threshold && "text-yellow-600 dark:text-yellow-400",
        deficit !== null && threshold !== null && deficit >= threshold && "text-red-600 dark:text-red-500 font-medium",
      )}
    >
      {deficit !== null ? formatStockValue(deficit) : "—"}
    </TableCell>
  )
}

// Префикс имени склада, обозначающий сортировочный центр.
// При hideSc=true эти склады не отображаются при expand, но их остатки и заказы
// продолжают учитываться в кластерном агрегате (collapsed view).
function isSortingCenter(name: string): boolean {
  return /^СЦ\s/i.test(name.trim())
}

export function StockWbTable({ groups, turnoverNormDays, clusterWarehouses }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const expandedSet = new Set<string>(
    (searchParams.get("expandedClusters") ?? "").split(",").filter(Boolean)
  )

  // По умолчанию СЦ скрыты. Явно "?hideSc=0" → показывать все склады.
  const hideSc = searchParams.get("hideSc") !== "0"

  // Отфильтрованные карты складов per-cluster для отображения при expand.
  // Агрегация на уровне кластера (collapsed view) всё равно использует все склады.
  const visibleClusterWarehouses: typeof clusterWarehouses = Object.fromEntries(
    CLUSTER_ORDER.map((c) => [
      c,
      hideSc
        ? (clusterWarehouses[c] ?? []).filter((w) => !isSortingCenter(w.warehouseName))
        : (clusterWarehouses[c] ?? []),
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
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
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
      </div>

      <div className="overflow-auto border rounded h-[calc(100vh-260px)]">
        <Table>
          <TableHeader>
            {/* Уровень 1 — группы (sticky и МП rowSpan=3, cluster rowSpan=1/colSpan зависит от expand) */}
            <TableRow>
              <TableHead
                className="sticky left-0 top-0 z-30 bg-background w-20 min-w-20 max-w-20 text-xs font-medium text-center border-b border-r"
                rowSpan={3}
              >
                Фото
              </TableHead>
              <TableHead
                className="sticky left-[80px] top-0 z-30 bg-background w-60 min-w-60 max-w-60 text-xs font-medium text-center border-b border-r"
                rowSpan={3}
              >
                Сводка
              </TableHead>
              <TableHead
                className="sticky left-[320px] top-0 z-30 bg-background w-24 min-w-24 max-w-24 text-xs font-medium text-center border-b border-r"
                rowSpan={3}
              >
                Артикул WB
              </TableHead>
              {/* МП О/З/Об/Д — плоские, rowSpan=3 (нет expand) */}
              <TableHead className="sticky top-0 z-20 bg-background text-xs font-medium text-center border-b" rowSpan={3} title="Остаток (шт) МП = WB">МП</TableHead>
              <TableHead className="sticky top-0 z-20 bg-background text-xs font-medium text-center border-b" rowSpan={3} title="WB Заказы/день">З</TableHead>
              <TableHead className="sticky top-0 z-20 bg-background text-xs font-medium text-center border-b" rowSpan={3} title="Оборачиваемость">Об</TableHead>
              <TableHead className="sticky top-0 z-20 bg-background text-xs font-medium text-center border-b border-r" rowSpan={3} title="Дефицит">Д</TableHead>
              {/* 7 кластерных колонок */}
              {CLUSTER_ORDER.map((cluster) => {
                const isExpanded = expandedSet.has(cluster)
                const allWarehouses = clusterWarehouses[cluster] ?? []
                const visibleWarehouses = visibleClusterWarehouses[cluster] ?? []
                // collapsed: colSpan=4 (O/З/Об/Д) | expanded: visible × 4 (каждый склад имеет О/З/Об/Д) | empty expanded: colSpan=4 placeholder
                const colSpan = isExpanded
                  ? (visibleWarehouses.length > 0 ? visibleWarehouses.length * 4 : 4)
                  : 4
                // Collapsed: rowSpan=2 (cluster cell покрывает level 1 + level 2 = 68px, выглядит цельно)
                // Expanded: rowSpan=1 (level 2 рендерит имена складов отдельно)
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
            </TableRow>
            {/* Уровень 2 — имя склада (только для expanded). Collapsed кластер уже занимает row 1+2 через rowSpan=2. */}
            <TableRow>
              {CLUSTER_ORDER.flatMap((cluster) => {
                const isExpanded = expandedSet.has(cluster)
                const warehouses = visibleClusterWarehouses[cluster] ?? []

                // Collapsed: cells покрыты rowSpan=2 из level 1 cluster cell — ничего не рендерим
                if (!isExpanded) return []

                // Expanded с складами: имя склада colSpan=4 per склад
                if (warehouses.length > 0) {
                  return warehouses.map((w, idx) => (
                    <TableHead
                      key={`${cluster}-wh-${w.warehouseId}`}
                      colSpan={4}
                      className={cn(
                        "sticky top-[40px] z-20 bg-background text-xs text-center border-b h-7 px-2 py-1",
                        idx === warehouses.length - 1 && "border-r",
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

                // Expanded пустой (нет складов) — placeholder colSpan=4 с подписью «нет складов»
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
            </TableRow>
            {/* Уровень 3 — О/З/Об/Д всегда (collapsed: 4 per cluster, expanded: 4 × warehouses.length) */}
            <TableRow>
              {CLUSTER_ORDER.flatMap((cluster) => {
                const isExpanded = expandedSet.has(cluster)
                const warehouses = visibleClusterWarehouses[cluster] ?? []

                // Expanded с складами: 4 cells O/З/Об/Д per склад
                if (isExpanded && warehouses.length > 0) {
                  return warehouses.flatMap((w, idx) => {
                    const lastWarehouse = idx === warehouses.length - 1
                    return [
                      <TableHead key={`${cluster}-${w.warehouseId}-o`} className="sticky top-[68px] z-20 bg-background text-[10px] text-muted-foreground text-center border-b h-6 px-1 py-0" title="Остаток">О</TableHead>,
                      <TableHead key={`${cluster}-${w.warehouseId}-z`} className="sticky top-[68px] z-20 bg-background text-[10px] text-muted-foreground text-center border-b h-6 px-1 py-0" title="Заказы/день">З</TableHead>,
                      <TableHead key={`${cluster}-${w.warehouseId}-ob`} className="sticky top-[68px] z-20 bg-background text-[10px] text-muted-foreground text-center border-b h-6 px-1 py-0" title="Оборачиваемость">Об</TableHead>,
                      <TableHead key={`${cluster}-${w.warehouseId}-d`} className={cn("sticky top-[68px] z-20 bg-background text-[10px] text-muted-foreground text-center border-b h-6 px-1 py-0", lastWarehouse && "border-r")} title="Дефицит">Д</TableHead>,
                    ]
                  })
                }

                // Collapsed или Expanded пустой: 4 cells O/З/Об/Д для кластера
                return [
                  <TableHead key={`${cluster}-o`} className="sticky top-[68px] z-20 bg-background text-xs text-muted-foreground text-center border-b h-6 px-2 py-0" title="Остаток">О</TableHead>,
                  <TableHead key={`${cluster}-z`} className="sticky top-[68px] z-20 bg-background text-xs text-muted-foreground text-center border-b h-6 px-2 py-0" title="Заказы/день">З</TableHead>,
                  <TableHead key={`${cluster}-ob`} className="sticky top-[68px] z-20 bg-background text-xs text-muted-foreground text-center border-b h-6 px-2 py-0" title="Оборачиваемость">Об</TableHead>,
                  <TableHead key={`${cluster}-d`} className="sticky top-[68px] z-20 bg-background text-xs text-muted-foreground text-center border-b border-r h-6 px-2 py-0" title="Дефицит">Д</TableHead>,
                ]
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g, idx) => {
              const rowSpan = 1 + g.wbCards.length

              // Row-level агрегаты по всем wbCards продукта (Сводная)
              const rowTotalStock = g.wbCards.reduce<number | null>(
                (acc, c) => (c.totalStock === null ? acc : (acc ?? 0) + c.totalStock),
                null,
              )
              const rowOrdersPerDay = g.wbCards.reduce<number | null>(
                (acc, c) => (c.avgSalesSpeed7d === null ? acc : (acc ?? 0) + c.avgSalesSpeed7d),
                null,
              )
              const rowMetrics = calculateStockMetrics({
                stock: rowTotalStock,
                ordersPerDay: rowOrdersPerDay,
                turnoverNormDays,
              })
              const rowThreshold = deficitThreshold(turnoverNormDays, rowOrdersPerDay)

              // Row-level per-cluster агрегаты (sum по всем wbCards)
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
                      className="sticky left-0 z-20 bg-background border-r w-20 min-w-20 max-w-20 align-top p-2"
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
                    <TableCell
                      rowSpan={rowSpan}
                      className="sticky left-[80px] z-20 bg-background border-r w-60 min-w-60 max-w-60 align-top p-3"
                    >
                      <div className="flex flex-col gap-1">
                        <div className="text-sm font-medium leading-snug line-clamp-2">{g.productName}</div>
                        <div className="text-xs text-muted-foreground">{g.productSku}</div>
                        <div className="text-xs text-muted-foreground">{g.brandName}</div>
                      </div>
                    </TableCell>
                    {/* ОДНА sticky колонка "Артикул WB" = 'Сводная' (совпадает с header rowSpan=3) */}
                    <TableCell className="sticky left-[320px] z-20 bg-background border-r w-24 min-w-24 max-w-24 align-top text-xs font-medium text-center">
                      Сводная
                    </TableCell>
                    {/* МП О/З/Об/Д — row-level агрегат по всем wbCards */}
                    <StockCell value={rowTotalStock} />
                    <StockCell value={rowOrdersPerDay} />
                    <StockCell value={rowMetrics.turnoverDays} />
                    <DeficitCell deficit={rowMetrics.deficit} threshold={rowThreshold} />
                    {/* Кластеры — row-level агрегат (сумма по wbCards). При expand — plotholder colSpan под 4-cell заголовок склада */}
                    {CLUSTER_ORDER.flatMap((cluster) => {
                      const isExpanded = expandedSet.has(cluster)
                      const warehouses = visibleClusterWarehouses[cluster as ClusterShortName] ?? []
                      const agg = rowClusterAgg[cluster as ClusterShortName]

                      if (isExpanded) {
                        // Сводная на уровне Product при expanded кластере остаётся пустой для per-warehouse колонок
                        // (за ordersCount в строке Сводной не виден individual warehouse split).
                        // Placeholder colSpan=4 на каждый склад (или 4 если нет складов).
                        const groupCount = warehouses.length > 0 ? warehouses.length : 1
                        return Array.from({ length: groupCount }, (_, i) => (
                          <TableCell
                            key={`${cluster}-sum-wh-${i}`}
                            colSpan={4}
                            className={cn(
                              "px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right text-muted-foreground",
                              i === groupCount - 1 && "border-r"
                            )}
                          >—</TableCell>
                        ))
                      }

                      // Collapsed: О/З/Об/Д — сумма по кластеру
                      const aggMetrics = calculateStockMetrics({
                        stock: agg?.stock ?? null,
                        ordersPerDay: agg?.orders ?? null,
                        turnoverNormDays,
                      })
                      const aggThreshold = deficitThreshold(turnoverNormDays, agg?.orders ?? null)
                      return [
                        <StockCell key={`${cluster}-sum-o`} value={agg?.stock ?? null} />,
                        <StockCell key={`${cluster}-sum-z`} value={agg?.orders ?? null} />,
                        <StockCell key={`${cluster}-sum-ob`} value={aggMetrics.turnoverDays} />,
                        <DeficitCell key={`${cluster}-sum-d`} deficit={aggMetrics.deficit} threshold={aggThreshold} />,
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
                      <TableRow key={card.wbCardId} className="border-t border-t-border/60">
                        <TableCell className="sticky left-[320px] z-20 bg-background border-r w-24 min-w-24 max-w-24 text-xs tabular-nums">
                          {card.nmId}
                        </TableCell>
                        {/* МП О/З/Об/Д */}
                        <StockCell value={card.totalStock} />
                        <StockCell value={card.avgSalesSpeed7d} />
                        <StockCell value={cardMetrics.turnoverDays} />
                        <DeficitCell deficit={cardMetrics.deficit} threshold={cardThreshold} />
                        {/* Кластеры */}
                        {CLUSTER_ORDER.flatMap((cluster) => {
                          const isExpanded = expandedSet.has(cluster)
                          const clusterData = card.clusters[cluster as ClusterShortName]
                          const warehouses = visibleClusterWarehouses[cluster as ClusterShortName] ?? []

                          if (isExpanded) {
                            if (warehouses.length === 0) {
                              // placeholder colSpan=4 под single level-2 TableHead
                              return [
                                <TableCell key={`${card.wbCardId}-${cluster}-empty`} colSpan={4} className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right text-muted-foreground border-r">—</TableCell>
                              ]
                            }
                            // Per-warehouse 4 cells (О/З/Об/Д) — такая же структура как в collapsed кластере
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
                                <StockCell key={`${card.wbCardId}-${cluster}-${w.warehouseId}-o`} value={whStock} />,
                                <StockCell key={`${card.wbCardId}-${cluster}-${w.warehouseId}-z`} value={whOrdersPerDay} />,
                                <StockCell key={`${card.wbCardId}-${cluster}-${w.warehouseId}-ob`} value={whMetrics.turnoverDays} />,
                                <TableCell
                                  key={`${card.wbCardId}-${cluster}-${w.warehouseId}-d`}
                                  className={cn(
                                    "px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right",
                                    lastWarehouse && "border-r",
                                    whMetrics.deficit === null && "text-muted-foreground",
                                    whMetrics.deficit !== null && whMetrics.deficit <= 0 && "text-green-600 dark:text-green-500",
                                    whMetrics.deficit !== null && whThreshold !== null && whMetrics.deficit > 0 && whMetrics.deficit < whThreshold && "text-yellow-600 dark:text-yellow-400",
                                    whMetrics.deficit !== null && whThreshold !== null && whMetrics.deficit >= whThreshold && "text-red-600 dark:text-red-500 font-medium",
                                  )}
                                >
                                  {whMetrics.deficit !== null ? formatStockValue(whMetrics.deficit) : "—"}
                                </TableCell>,
                              ]
                            })
                          }

                          // Collapsed: 4 sub-columns О/З/Об/Д (Phase 15: З = per-cluster ordersPerDay, учитывает ВСЕ склады включая СЦ)
                          const clusterOrdersPerDay = clusterData?.ordersPerDay ?? null
                          const clusterMetrics = calculateStockMetrics({
                            stock: clusterData?.totalStock ?? null,
                            ordersPerDay: clusterOrdersPerDay,
                            turnoverNormDays,
                          })
                          const clusterThreshold = deficitThreshold(turnoverNormDays, clusterOrdersPerDay)
                          return [
                            <StockCell key={`${card.wbCardId}-${cluster}-o`} value={clusterData?.totalStock ?? null} />,
                            <StockCell key={`${card.wbCardId}-${cluster}-z`} value={clusterOrdersPerDay} />,
                            <StockCell key={`${card.wbCardId}-${cluster}-ob`} value={clusterMetrics.turnoverDays} />,
                            <DeficitCell key={`${card.wbCardId}-${cluster}-d`} deficit={clusterMetrics.deficit} threshold={clusterThreshold} />,
                          ]
                        })}
                      </TableRow>
                    )
                  })}
                </React.Fragment>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
