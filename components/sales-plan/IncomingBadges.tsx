"use client"

import { useState } from "react"
import { Package } from "lucide-react"
import Link from "next/link"
import type { ArrivalBatch } from "@/lib/sales-plan/types"
import { STAGE_LABELS } from "@/lib/purchase-stages"

interface IncomingBadgesProps {
  arrivals: ArrivalBatch[]
}

function formatDateShort(iso: string): string {
  const d = new Date(iso + "T00:00:00Z")
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  })
}

function dateSourceLabel(source: ArrivalBatch["dateSource"]): string {
  switch (source) {
    case "manual": return "плановая дата"
    case "transit-eta": return "транзит + лаг"
    case "leadtime-eta": return "lead time est."
    case "legacy-expected": return "ожидаемая (старая)"
    default: return source
  }
}

interface BadgePopoverProps {
  arrival: ArrivalBatch
}

function BadgePopover({ arrival }: BadgePopoverProps) {
  const [open, setOpen] = useState(false)

  // Только реальные приходы: purchase или incoming-legacy
  if (arrival.source !== "purchase" && arrival.source !== "incoming-legacy") return null

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
      >
        <Package className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="tabular-nums whitespace-nowrap">
          {formatDateShort(arrival.date)} ×{arrival.qty}
        </span>
      </button>

      {open && (
        <>
          {/* overlay для закрытия по клику вне */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-0 top-full mt-1 z-50 min-w-[200px] max-w-[260px] rounded-md border bg-popover p-3 shadow-md text-xs space-y-1.5">
            <div className="font-medium text-foreground">Реальный приход</div>
            <div className="text-muted-foreground">
              <span className="font-medium">Дата:</span>{" "}
              {formatDateShort(arrival.date)}{" "}
              <span className="text-muted-foreground/60">({dateSourceLabel(arrival.dateSource)})</span>
            </div>
            <div className="text-muted-foreground">
              <span className="font-medium">Кол-во:</span>{" "}
              <span className="tabular-nums">{arrival.qty} шт</span>
            </div>
            {arrival.source === "purchase" && arrival.refId && (
              <div className="pt-1">
                <Link
                  href={`/procurement/purchases/${arrival.refId}`}
                  prefetch={false}
                  className="text-primary underline-offset-2 hover:underline"
                  onClick={() => setOpen(false)}
                >
                  Открыть закупку
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export function IncomingBadges({ arrivals }: IncomingBadgesProps) {
  // В этом этапе рендерим ТОЛЬКО реальные приходы (source=purchase|incoming-legacy)
  // Виртуальные ◇/⚠ (virtual/SUGGESTED/ACCEPTED) включит Wave 6
  const realArrivals = arrivals.filter(
    (a) => a.source === "purchase" || a.source === "incoming-legacy",
  )

  if (realArrivals.length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>
  }

  return (
    <div className="flex flex-col gap-0.5">
      {realArrivals.map((a) => (
        <BadgePopover key={`${a.refId}-${a.date}`} arrival={a} />
      ))}
    </div>
  )
}

export function IncomingBadgesLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          <Package className="h-3 w-3" />
          DD.MM ×N
        </span>
        реальный приход
      </span>
      {/* ◇/⚠ виртуальные — Wave 6 */}
    </div>
  )
}
