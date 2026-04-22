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

export function StockWbTable({ groups, turnoverNormDays, clusterWarehouses }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const expandedSet = new Set<string>(
    (searchParams.get("expandedClusters") ?? "").split(",").filter(Boolean)
  )

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
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={expandAll}>Развернуть все</Button>
        <Button variant="ghost" size="sm" onClick={collapseAll}>Свернуть все</Button>
      </div>

      <div className="overflow-x-auto border rounded">
        <Table>
          <TableHeader>
            {/* Уровень 1 — группы */}
            <TableRow>
              <TableHead
                className="sticky left-0 top-0 z-30 bg-background w-20 text-xs font-medium text-center border-b border-r"
                rowSpan={2}
              >
                Фото
              </TableHead>
              <TableHead
                className="sticky left-[80px] top-0 z-30 bg-background w-60 text-xs font-medium text-center border-b border-r"
                rowSpan={2}
              >
                Сводка
              </TableHead>
              <TableHead
                className="sticky left-[320px] top-0 z-30 bg-background w-24 text-xs font-medium text-center border-b border-r"
                rowSpan={2}
              >
                Артикул WB
              </TableHead>
              {/* 4 сводных — МП О/З/Об/Д */}
              <TableHead
                className="top-0 z-20 bg-background text-xs font-medium text-center border-b"
                rowSpan={2}
                title="Остаток (шт) МП = WB"
              >
                МП О
              </TableHead>
              <TableHead
                className="top-0 z-20 bg-background text-xs font-medium text-center border-b"
                rowSpan={2}
                title="WB Заказы/день"
              >
                З
              </TableHead>
              <TableHead
                className="top-0 z-20 bg-background text-xs font-medium text-center border-b"
                rowSpan={2}
                title="Оборачиваемость"
              >
                Об
              </TableHead>
              <TableHead
                className="top-0 z-20 bg-background text-xs font-medium text-center border-b border-r"
                rowSpan={2}
                title="Дефицит"
              >
                Д
              </TableHead>
              {/* 7 кластерных колонок */}
              {CLUSTER_ORDER.map((cluster) => {
                const isExpanded = expandedSet.has(cluster)
                const warehouses = clusterWarehouses[cluster] ?? []
                const colSpan = isExpanded ? Math.max(warehouses.length, 1) : 4
                return (
                  <TableHead
                    key={cluster}
                    colSpan={colSpan}
                    className="top-0 z-20 bg-background text-xs font-medium text-center border-b border-r px-2 py-1"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <ClusterTooltip shortName={cluster} warehouseCount={warehouses.length}>
                        <span>{cluster}</span>
                      </ClusterTooltip>
                      <button
                        type="button"
                        onClick={() => toggleCluster(cluster)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={isExpanded ? `Свернуть кластер ${cluster}` : `Развернуть кластер ${cluster}`}
                      >
                        {isExpanded ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
                      </button>
                    </div>
                  </TableHead>
                )
              })}
            </TableRow>
            {/* Уровень 2 — sub-columns */}
            <TableRow>
              {CLUSTER_ORDER.flatMap((cluster) => {
                const isExpanded = expandedSet.has(cluster)
                const warehouses = clusterWarehouses[cluster] ?? []

                if (isExpanded && warehouses.length > 0) {
                  return warehouses.map((w, idx) => (
                    <TableHead
                      key={`${cluster}-wh-${w.warehouseId}`}
                      className={cn(
                        "top-[40px] z-20 bg-background text-xs text-center border-b px-2 py-1",
                        idx === warehouses.length - 1 && "border-r",
                        w.needsClusterReview && "text-yellow-600"
                      )}
                    >
                      {w.needsClusterReview && <span className="mr-1">⚠️</span>}
                      {w.warehouseName}
                    </TableHead>
                  ))
                }

                if (isExpanded && warehouses.length === 0) {
                  return [
                    <TableHead key={`${cluster}-empty`} className="top-[40px] z-20 bg-background text-xs text-muted-foreground text-center border-b border-r px-2 py-1">—</TableHead>
                  ]
                }

                return [
                  <TableHead key={`${cluster}-o`} className="top-[40px] z-20 bg-background text-xs text-muted-foreground text-center border-b px-2 py-1" title="Остаток">О</TableHead>,
                  <TableHead key={`${cluster}-z`} className="top-[40px] z-20 bg-background text-xs text-muted-foreground text-center border-b px-2 py-1" title="Заказы/день">З</TableHead>,
                  <TableHead key={`${cluster}-ob`} className="top-[40px] z-20 bg-background text-xs text-muted-foreground text-center border-b px-2 py-1" title="Оборачиваемость">Об</TableHead>,
                  <TableHead key={`${cluster}-d`} className="top-[40px] z-20 bg-background text-xs text-muted-foreground text-center border-b border-r px-2 py-1" title="Дефицит">Д</TableHead>,
                ]
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g, idx) => {
              const rowSpan = 1 + g.wbCards.length
              return (
                <React.Fragment key={g.productId}>
                  {/* Product Сводная строка */}
                  <TableRow className={cn(idx > 0 && "border-t-4 border-t-border")}>
                    <TableCell
                      rowSpan={rowSpan}
                      className="sticky left-0 z-20 bg-background border-r w-20 align-top p-2"
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
                      className="sticky left-[80px] z-20 bg-background border-r w-60 align-top p-3"
                    >
                      <div className="flex flex-col gap-1">
                        <div className="text-sm font-medium leading-snug line-clamp-2">{g.productName}</div>
                        <div className="text-xs text-muted-foreground">{g.productSku}</div>
                        <div className="text-xs text-muted-foreground">{g.brandName}</div>
                      </div>
                    </TableCell>
                    <TableCell className="sticky left-[320px] z-20 bg-background border-r w-20 align-top text-xs font-medium text-center">
                      Сводная
                    </TableCell>
                    <TableCell className="sticky left-[400px] z-20 bg-background border-r w-[120px] text-xs text-muted-foreground">
                      —
                    </TableCell>
                    {/* 4 сводных placeholder */}
                    <StockCell value={null} />
                    <StockCell value={null} />
                    <StockCell value={null} />
                    <DeficitCell deficit={null} threshold={null} />
                    {/* Кластеры — пусто на Сводной строке */}
                    {CLUSTER_ORDER.flatMap((cluster) => {
                      const isExpanded = expandedSet.has(cluster)
                      const warehouses = clusterWarehouses[cluster] ?? []
                      const cellCount = isExpanded ? Math.max(warehouses.length, 1) : 4
                      return Array.from({ length: cellCount }, (_, i) => (
                        <StockCell key={`${cluster}-sum-${i}`} value={null} />
                      ))
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
                        <TableCell className="sticky left-[320px] z-20 bg-background border-r w-24 text-xs tabular-nums">
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
                          const warehouses = clusterWarehouses[cluster as ClusterShortName] ?? []

                          if (isExpanded) {
                            if (warehouses.length === 0) {
                              return [<StockCell key={`${card.wbCardId}-${cluster}-empty`} value={null} />]
                            }
                            return warehouses.map((w, wIdx) => {
                              const slot = clusterData?.warehouses.find((s) => s.warehouseId === w.warehouseId)
                              return (
                                <TableCell
                                  key={`${card.wbCardId}-${cluster}-${w.warehouseId}`}
                                  className={cn(
                                    "px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right",
                                    wIdx === warehouses.length - 1 && "border-r"
                                  )}
                                >
                                  {slot ? formatStockValue(slot.quantity) : <span className="text-muted-foreground">—</span>}
                                </TableCell>
                              )
                            })
                          }

                          // Collapsed: 4 sub-columns О/З/Об/Д
                          const clusterMetrics = calculateStockMetrics({
                            stock: clusterData?.totalStock ?? null,
                            ordersPerDay: card.avgSalesSpeed7d,
                            turnoverNormDays,
                          })
                          const clusterThreshold = deficitThreshold(turnoverNormDays, card.avgSalesSpeed7d)
                          return [
                            <StockCell key={`${card.wbCardId}-${cluster}-o`} value={clusterData?.totalStock ?? null} />,
                            <StockCell key={`${card.wbCardId}-${cluster}-z`} value={card.avgSalesSpeed7d} />,
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
