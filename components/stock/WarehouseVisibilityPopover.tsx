"use client"

// components/stock/WarehouseVisibilityPopover.tsx
// Quick 260422-oy5: попап с чекбоксами видимости WB-складов per-cluster.
// Optimistic update + save в БД через server action.

import { useEffect, useRef, useState, useTransition } from "react"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { CLUSTER_ORDER, type ClusterShortName } from "@/lib/wb-clusters"
import { saveStockWbHiddenWarehouses } from "@/app/actions/stock-wb"
import type { StockWbDataResult } from "@/lib/stock-wb-data"

interface Props {
  clusterWarehouses: StockWbDataResult["clusterWarehouses"]
  hiddenIds: number[]
  onChange: (next: number[]) => void // optimistic update наружу (StockWbTable)
}

export function WarehouseVisibilityPopover({
  clusterWarehouses,
  hiddenIds,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  // click-outside (паттерн MultiSelectDropdown)
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const hiddenSet = new Set(hiddenIds)

  const totalCount = CLUSTER_ORDER.reduce(
    (acc, c) => acc + (clusterWarehouses[c]?.length ?? 0),
    0,
  )
  const visibleCount = totalCount - hiddenSet.size

  function persist(nextIds: number[]) {
    // Уже отсортированный dedup сделает server; optimistic обновление мгновенно
    onChange(nextIds)
    startTransition(async () => {
      const res = await saveStockWbHiddenWarehouses(nextIds)
      if (!res.ok) {
        // Откат не делаем — page.tsx при следующем revalidate синхронизирует из БД
        console.error("Не удалось сохранить настройку складов:", res.error)
      }
    })
  }

  function toggle(warehouseId: number, visible: boolean) {
    // visible=true → показать (убрать из hidden); false → скрыть (добавить)
    const next = new Set(hiddenSet)
    if (visible) next.delete(warehouseId)
    else next.add(warehouseId)
    persist([...next])
  }

  function reset() {
    persist([])
  }

  function toggleCluster(cluster: ClusterShortName, showAll: boolean) {
    const ids = (clusterWarehouses[cluster] ?? []).map((w) => w.warehouseId)
    const next = new Set(hiddenSet)
    if (showAll) ids.forEach((id) => next.delete(id))
    else ids.forEach((id) => next.add(id))
    persist([...next])
  }

  const label =
    hiddenSet.size > 0
      ? `Склады (${visibleCount}/${totalCount})`
      : "Склады"

  return (
    <div ref={ref} className="relative">
      <Button
        variant={hiddenSet.size > 0 ? "default" : "outline"}
        size="sm"
        onClick={() => setOpen(!open)}
        className="gap-1.5"
        title="Выбрать какие склады отображать в expanded view (только визуально, на расчёты не влияет)"
      >
        {label}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </Button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[300px] max-w-[400px] max-h-[60vh] overflow-y-auto rounded-md border bg-popover p-2 shadow-md">
          <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b">
            <span className="text-xs text-muted-foreground">
              Фильтр только визуальный — все расчёты считаются по всем складам.
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              disabled={hiddenSet.size === 0 || isPending}
            >
              Сбросить
            </Button>
          </div>

          {CLUSTER_ORDER.map((cluster) => {
            const warehouses = clusterWarehouses[cluster] ?? []
            if (warehouses.length === 0) return null
            const clusterIds = warehouses.map((w) => w.warehouseId)
            const clusterHiddenCount = clusterIds.filter((id) =>
              hiddenSet.has(id),
            ).length
            const allClusterVisible = clusterHiddenCount === 0

            return (
              <div key={cluster} className="mb-2 last:mb-0">
                <div className="flex items-center justify-between gap-2 px-1 py-1 text-xs font-semibold">
                  <span>
                    {cluster}{" "}
                    <span className="text-muted-foreground font-normal">
                      ({warehouses.length - clusterHiddenCount}/
                      {warehouses.length})
                    </span>
                  </span>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                    onClick={() => toggleCluster(cluster, !allClusterVisible)}
                  >
                    {allClusterVisible ? "Скрыть все" : "Показать все"}
                  </button>
                </div>
                <div className="flex flex-col">
                  {warehouses.map((w) => {
                    const visible = !hiddenSet.has(w.warehouseId)
                    return (
                      <label
                        key={w.warehouseId}
                        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={visible}
                          onCheckedChange={(checked) =>
                            toggle(w.warehouseId, checked === true)
                          }
                        />
                        <span className="truncate">
                          {w.needsClusterReview && (
                            <span className="mr-1">⚠️</span>
                          )}
                          {w.warehouseName}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
