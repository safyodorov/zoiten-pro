"use client"

// components/stock/StockWbTable.tsx
// Phase 14 (STOCK-22, STOCK-25): Client sticky-таблица /stock/wb с 7 кластерными колонками + expand.
// URL state: ?expandedClusters=ЦФО,ПФО — shareable.

import React, { useCallback, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import {
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
import { WarehouseVisibilityPopover } from "./WarehouseVisibilityPopover"
import type { ProductWbGroup, StockWbDataResult, WbStockSizeRow } from "@/lib/stock-wb-data"
import { saveStockWbShowSizes } from "@/app/actions/stock-wb"

function formatStockValue(n: number): string {
  if (n < 10) return n.toFixed(1)
  return Math.floor(n).toString()
}

/** Целое с отбрасыванием дробной части (для Об, Д). */
function formatInt(n: number): string {
  return Math.trunc(n).toString()
}

interface Props {
  groups: ProductWbGroup[]
  turnoverNormDays: number
  clusterWarehouses: StockWbDataResult["clusterWarehouses"]
  hiddenWarehouseIds: number[] // quick 260422-oy5 — per-user hidden warehouses
  // Phase 16 (STOCK-36): per-user toggle кнопки «По размерам»
  initialShowSizes: boolean
}

function StockCell({ value }: { value: number | null }) {
  return (
    <TableCell className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right">
      {value !== null ? formatStockValue(value) : <span className="text-muted-foreground">—</span>}
    </TableCell>
  )
}

/** Ячейка Об — целое с отбрасыванием дробной части. */
function IntCell({ value }: { value: number | null }) {
  return (
    <TableCell className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right">
      {value !== null ? formatInt(value) : <span className="text-muted-foreground">—</span>}
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
      {deficit !== null ? formatInt(deficit) : "—"}
    </TableCell>
  )
}

// Префикс имени склада, обозначающий сортировочный центр.
// При hideSc=true эти склады не отображаются при expand, но их остатки и заказы
// продолжают учитываться в кластерном агрегате (collapsed view).
function isSortingCenter(name: string): boolean {
  return /^СЦ\s/i.test(name.trim())
}

export function StockWbTable({ groups, turnoverNormDays, clusterWarehouses, hiddenWarehouseIds, initialShowSizes }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const expandedSet = new Set<string>(
    (searchParams.get("expandedClusters") ?? "").split(",").filter(Boolean)
  )

  // По умолчанию СЦ скрыты. Явно "?hideSc=0" → показывать все склады.
  const hideSc = searchParams.get("hideSc") !== "0"

  // Quick 260422-oy5: optimistic локальный state для per-user hidden warehouses.
  // RSC revalidatePath синхронизирует с БД при следующем render — для optimistic
  // совпадает с тем что persist отправляет, спец. useEffect-синхронизация не нужна.
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
        // Не откатываем — следующий revalidate синхронизирует из БД
        console.error("Не удалось сохранить «По размерам»:", res.error)
      }
    })
  }, [showSizes])

  // Отфильтрованные карты складов per-cluster для отображения при expand.
  // Агрегация на уровне кластера (collapsed view) всё равно использует все склады.
  const visibleClusterWarehouses: typeof clusterWarehouses = Object.fromEntries(
    CLUSTER_ORDER.map((c) => [
      c,
      (clusterWarehouses[c] ?? []).filter((w) => {
        // Фильтр 1: СЦ по кнопке hideSc
        if (hideSc && isSortingCenter(w.warehouseName)) return false
        // Фильтр 2: per-user hidden (quick 260422-oy5)
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
        <table className="w-full caption-bottom text-sm border-separate border-spacing-0">
          <thead className="bg-background">
            {/* Уровень 1 — группы (sticky и МП rowSpan=3, cluster rowSpan=1/colSpan зависит от expand) */}
            <tr>
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
              {/* Иваново — Product-level остаток (из Excel), rowSpan=3 = одна ячейка на Product group */}
              <TableHead
                className="sticky top-0 z-20 bg-background text-xs font-medium text-center border-b border-r px-2 py-1 h-[92px] w-20 min-w-20 max-w-20"
                rowSpan={3}
                title="Остаток на складе Иваново (из Excel)"
              >
                Иваново
              </TableHead>
              {/* Всего на WB — 1 колонка, rowSpan=3 (как sticky cols), 92px высота.
                  Нет sub-cell в row 3 — просто одно число на всю группу. */}
              <TableHead
                className="sticky top-0 z-20 bg-background text-xs font-medium text-center border-b border-r px-2 py-1 h-[92px]"
                colSpan={1}
                rowSpan={3}
                title="Физический остаток по всем складам + Товар в пути (всего)"
              >
                Всего на WB
              </TableHead>
              {/* Товар в пути — 3 колонки: Всего/от/к (агрегат per nmId).
                  rowSpan=2 — покрывает row 2 (placeholder) чтобы визуально была
                  единая ячейка как у 'Всего на WB' и collapsed кластеров. */}
              <TableHead
                className="sticky top-0 z-20 bg-background text-xs font-medium text-center border-b border-r px-2 py-1 h-[68px]"
                colSpan={3}
                rowSpan={2}
                title="Товар в пути (агрегат по nmId)"
              >
                Товар в пути
              </TableHead>
              {/* Итого склады WB — 4 колонок О/З/Об/Д по физ. остаткам (без in-way).
                  rowSpan=2 — покрывает row 2 placeholder. */}
              <TableHead
                className="sticky top-0 z-20 bg-background text-xs font-medium text-center border-b border-r px-2 py-1 h-[68px]"
                colSpan={4}
                rowSpan={2}
                title="Итого по всем складам WB (физ. остаток, без товара в пути)"
              >
                Итого склады WB
              </TableHead>
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
            </tr>
            {/* Уровень 2 — имя склада (только для expanded). Collapsed кластер уже занимает row 1+2 через rowSpan=2. */}
            <tr>
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
            </tr>
            {/* Уровень 3 — О/З/Об/Д всегда (collapsed: 4 per cluster, expanded: 4 × warehouses.length) */}
            <tr>
              {/* Товар в пути — 3 cells Всего / от / к под группой */}
              <TableHead className="sticky top-[68px] z-20 bg-background text-xs text-muted-foreground text-center border-b h-6 px-2 py-0" title="Всего в пути (к + от клиента)">Всего</TableHead>
              <TableHead className="sticky top-[68px] z-20 bg-background text-xs text-muted-foreground text-center border-b h-6 px-2 py-0" title="В пути ОТ клиента (возвраты)">от</TableHead>
              <TableHead className="sticky top-[68px] z-20 bg-background text-xs text-muted-foreground text-center border-b border-r h-6 px-2 py-0" title="В пути К клиенту">к</TableHead>
              {/* Итого склады WB — 4 cells O/З/Об/Д под группой */}
              <TableHead className="sticky top-[68px] z-20 bg-background text-xs text-muted-foreground text-center border-b h-6 px-2 py-0" title="Остаток (физ., без in-way)">О</TableHead>
              <TableHead className="sticky top-[68px] z-20 bg-background text-xs text-muted-foreground text-center border-b h-6 px-2 py-0" title="Заказы/день">З</TableHead>
              <TableHead className="sticky top-[68px] z-20 bg-background text-xs text-muted-foreground text-center border-b h-6 px-2 py-0" title="Оборачиваемость">Об</TableHead>
              <TableHead className="sticky top-[68px] z-20 bg-background text-xs text-muted-foreground text-center border-b border-r h-6 px-2 py-0" title="Дефицит">Д</TableHead>
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
                      <TableHead key={`${cluster}-${w.warehouseId}-d`} className={cn("sticky top-[68px] z-20 bg-background text-[10px] text-muted-foreground text-center border-b h-6 px-1 py-0", lastWarehouse ? "border-r" : "border-r border-r-border/40")} title="Дефицит">Д</TableHead>,
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
            </tr>
          </thead>
          <TableBody>
            {groups.map((g, idx) => {
              // Phase 16 (STOCK-36): rowSpan учитывает размерные строки если showSizes ON
              const totalSizeRows = showSizes
                ? g.wbCards.reduce(
                    (acc, c) => acc + (c.hasMultipleSizes ? c.sizeBreakdown.length : 0),
                    0,
                  )
                : 0
              const rowSpan = 1 + g.wbCards.length + totalSizeRows

              // Row-level агрегаты по всем wbCards продукта (Сводная)
              const rowTotalStock = g.wbCards.reduce<number | null>(
                (acc, c) => (c.totalStock === null ? acc : (acc ?? 0) + c.totalStock),
                null,
              )
              const rowOrdersPerDay = g.wbCards.reduce<number | null>(
                (acc, c) => (c.avgSalesSpeed7d === null ? acc : (acc ?? 0) + c.avgSalesSpeed7d),
                null,
              )
              // Phase 15.1: агрегат in-way по всем wbCards (для Сводной строки)
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
                    {/* Иваново — Product-level остаток (в Сводной строке; в per-nmId строках пусто) */}
                    <TableCell className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right border-r w-20 min-w-20 max-w-20">
                      {g.ivanovoStock !== null ? formatInt(g.ivanovoStock) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    {/* Всего на WB — физ. остаток + товар в пути (с border-r для разделения) */}
                    <TableCell className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right border-r">
                      {rowTotalOnWb !== null ? formatInt(rowTotalOnWb) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    {/* Товар в пути — 3 cells Всего/от/к */}
                    <IntCell value={rowInWayTotal} />
                    <IntCell value={rowInWayFrom} />
                    <TableCell className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right border-r">
                      {rowInWayTo !== null ? formatInt(rowInWayTo) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    {/* Итого склады WB — О/З/Об/Д (physical stock only) */}
                    <StockCell value={rowTotalStock} />
                    <StockCell value={rowOrdersPerDay} />
                    <IntCell value={rowMetrics.turnoverDays} />
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
                              i === groupCount - 1
                                ? "border-r"
                                : "border-r border-r-border/40"
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
                        <IntCell key={`${cluster}-sum-ob`} value={aggMetrics.turnoverDays} />,
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
                      <React.Fragment key={card.wbCardId}>
                        <TableRow className="border-t border-t-border/60">
                        <TableCell className="sticky left-[320px] z-20 bg-background border-r w-24 min-w-24 max-w-24 text-xs tabular-nums">
                          {card.nmId}
                        </TableCell>
                        {/* Иваново — пустая ячейка в per-nmId строках (значение только в Сводной) */}
                        <TableCell className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right border-r text-muted-foreground w-20 min-w-20 max-w-20">
                          —
                        </TableCell>
                        {/* Phase 15.1: card-level in-way агрегат */}
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
                              {/* Всего на WB (border-r для разделения от Товар в пути) */}
                              <TableCell className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right border-r">
                                {cardTotalOnWb !== null ? formatInt(cardTotalOnWb) : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                              {/* Товар в пути — Всего/от/к */}
                              <IntCell value={cardInWayTotal} />
                              <IntCell value={card.inWayFromClient} />
                              <TableCell className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right border-r">
                                {card.inWayToClient !== null ? formatInt(card.inWayToClient) : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                            </>
                          )
                        })()}
                        {/* Итого склады WB О/З/Об/Д (physical stock only) */}
                        <StockCell value={card.totalStock} />
                        <StockCell value={card.avgSalesSpeed7d} />
                        <IntCell value={cardMetrics.turnoverDays} />
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
                                <IntCell key={`${card.wbCardId}-${cluster}-${w.warehouseId}-ob`} value={whMetrics.turnoverDays} />,
                                <TableCell
                                  key={`${card.wbCardId}-${cluster}-${w.warehouseId}-d`}
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
                            <IntCell key={`${card.wbCardId}-${cluster}-ob`} value={clusterMetrics.turnoverDays} />,
                            <DeficitCell key={`${card.wbCardId}-${cluster}-d`} deficit={clusterMetrics.deficit} threshold={clusterThreshold} />,
                          ]
                        })}
                      </TableRow>
                      {/* Phase 16 (STOCK-36): размерные строки под per-nmId */}
                      {showSizes && card.hasMultipleSizes && card.sizeBreakdown.map((sizeRow) => (
                        <TableRow
                          key={`${card.wbCardId}-size-${sizeRow.techSize}`}
                          className="border-t border-t-border/40 bg-muted/30"
                        >
                          {/* Артикул-колонка: ↳ {techSize} */}
                          <TableCell className="sticky left-[320px] z-20 bg-muted/30 border-r w-24 min-w-24 max-w-24 text-xs tabular-nums">
                            <span className="text-muted-foreground pl-3">↳ {sizeRow.techSize || "—"}</span>
                          </TableCell>
                          {/* Иваново — placeholder */}
                          <TableCell className="px-2 py-1 h-8 text-xs text-right border-r text-muted-foreground w-20 min-w-20 max-w-20">—</TableCell>
                          {/* Всего на WB — sizeRow.totalStock (без in-way) */}
                          <TableCell className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right border-r">
                            {sizeRow.totalStock !== null ? formatInt(sizeRow.totalStock) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          {/* Товар в пути — placeholder × 3 (per-size in-way не хранится) */}
                          <TableCell className="px-2 py-1 h-8 text-xs text-right text-muted-foreground">—</TableCell>
                          <TableCell className="px-2 py-1 h-8 text-xs text-right text-muted-foreground">—</TableCell>
                          <TableCell className="px-2 py-1 h-8 text-xs text-right text-muted-foreground border-r">—</TableCell>
                          {/* Итого склады WB О/З/Об/Д — З=null → metrics все null */}
                          <StockCell value={sizeRow.totalStock} />
                          <StockCell value={null} />
                          <IntCell value={null} />
                          <DeficitCell deficit={null} threshold={null} />
                          {/* Кластеры — то же flatMap по CLUSTER_ORDER, но через sizeRow.clusters */}
                          {CLUSTER_ORDER.flatMap((cluster) => {
                            const isExpanded = expandedSet.has(cluster)
                            const visibleWarehouses = visibleClusterWarehouses[cluster as ClusterShortName] ?? []
                            const sizeClusterAgg = sizeRow.clusters[cluster as ClusterShortName]
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
                                  <StockCell key={`${cluster}-size-${w.warehouseId}-o`} value={slotQty} />,
                                  <StockCell key={`${cluster}-size-${w.warehouseId}-z`} value={null} />,
                                  <IntCell key={`${cluster}-size-${w.warehouseId}-ob`} value={null} />,
                                  <TableCell
                                    key={`${cluster}-size-${w.warehouseId}-d`}
                                    className={cn(
                                      "px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right text-muted-foreground",
                                      borderClass,
                                    )}
                                  >—</TableCell>,
                                ]
                              })
                            }
                            return [
                              <StockCell key={`${cluster}-size-o`} value={sizeClusterAgg.totalStock ?? null} />,
                              <StockCell key={`${cluster}-size-z`} value={null} />,
                              <IntCell key={`${cluster}-size-ob`} value={null} />,
                              <DeficitCell key={`${cluster}-size-d`} deficit={null} threshold={null} />,
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
