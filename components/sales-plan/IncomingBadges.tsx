"use client"

// components/sales-plan/IncomingBadges.tsx
// Бейджи приходов в колонке «Приходы» ProductPlanTable.
// Wave 4: реальные 📦 (purchase / incoming-legacy)
// Wave 6 (Phase 25-07): виртуальные ◇ ACCEPTED + ⚠ SUGGESTED
// Phase 25-07 (Task 3)

import { useState, useTransition } from "react"
import { Package } from "lucide-react"
import Link from "next/link"
import type { ArrivalBatch } from "@/lib/sales-plan/types"
import {
  acceptVirtualPurchase,
  dismissVirtualPurchase,
} from "@/app/actions/sales-plan"

interface IncomingBadgesProps {
  arrivals: ArrivalBatch[]
  canManage?: boolean
  // Map virtualPurchaseId → "SUGGESTED" | "ACCEPTED" (нужен для различения бейджей)
  virtualStatuses?: Record<string, "SUGGESTED" | "ACCEPTED">
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

// ── Реальный приход 📦 ────────────────────────────────────────────────────────

interface BadgePopoverProps {
  arrival: ArrivalBatch
}

function RealBadgePopover({ arrival }: BadgePopoverProps) {
  const [open, setOpen] = useState(false)

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

// ── Виртуальный приход ACCEPTED ◇ ─────────────────────────────────────────────

function AcceptedVirtualBadge({
  arrival,
  canManage,
}: {
  arrival: ArrivalBatch
  canManage: boolean
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleDismiss() {
    startTransition(async () => {
      await dismissVirtualPurchase(arrival.refId)
      setOpen(false)
    })
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border border-dashed border-violet-400 text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
      >
        <span aria-hidden="true">◇</span>
        <span className="tabular-nums whitespace-nowrap">
          {formatDateShort(arrival.date)} ×{arrival.qty}
        </span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-0 top-full mt-1 z-50 min-w-[200px] max-w-[280px] rounded-md border bg-popover p-3 shadow-md text-xs space-y-1.5">
            <div className="font-medium text-foreground">Виртуальная закупка (◇ подтверждена)</div>
            <div className="text-muted-foreground">
              <span className="font-medium">Приход:</span>{" "}
              <span className="tabular-nums">{formatDateShort(arrival.date)}</span>
            </div>
            <div className="text-muted-foreground">
              <span className="font-medium">Кол-во:</span>{" "}
              <span className="tabular-nums">{arrival.qty} шт</span>
            </div>
            <div className="text-muted-foreground text-muted-foreground/70">
              Учтена в плане. Конвертируйте в закупку в разделе «Пора заказывать».
            </div>
            {canManage && (
              <div className="flex gap-2 pt-1">
                <Link
                  href={`/sales-plan/purchases?status=accepted`}
                  prefetch={false}
                  className="text-primary underline-offset-2 hover:underline"
                  onClick={() => setOpen(false)}
                >
                  Открыть в «Пора заказывать»
                </Link>
                <button
                  type="button"
                  onClick={handleDismiss}
                  disabled={isPending}
                  className="text-destructive hover:underline underline-offset-2 disabled:opacity-50 ml-auto"
                >
                  Убрать
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Виртуальный приход SUGGESTED ⚠ ───────────────────────────────────────────

function SuggestedVirtualBadge({
  arrival,
  canManage,
}: {
  arrival: ArrivalBatch
  canManage: boolean
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleAccept() {
    startTransition(async () => {
      await acceptVirtualPurchase(arrival.refId)
      setOpen(false)
    })
  }

  function handleDismiss() {
    startTransition(async () => {
      await dismissVirtualPurchase(arrival.refId)
      setOpen(false)
    })
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border border-dashed border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
      >
        <span aria-hidden="true">⚠</span>
        <span className="tabular-nums whitespace-nowrap">
          {formatDateShort(arrival.date)} ×{arrival.qty}
        </span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-0 top-full mt-1 z-50 min-w-[200px] max-w-[280px] rounded-md border bg-popover p-3 shadow-md text-xs space-y-1.5">
            <div className="font-medium text-foreground">Авто-предложение (⚠ учтена в плане)</div>
            <div className="text-muted-foreground">
              <span className="font-medium">Приход:</span>{" "}
              <span className="tabular-nums">{formatDateShort(arrival.date)}</span>
            </div>
            <div className="text-muted-foreground">
              <span className="font-medium">Кол-во:</span>{" "}
              <span className="tabular-nums">{arrival.qty} шт</span>
            </div>
            <div className="text-amber-700 dark:text-amber-400">
              Учтена в плане — как если бы заказали вовремя. Отклоните, если не планируете заказывать.
            </div>
            {canManage && (
              <div className="flex gap-2 pt-1 flex-wrap">
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={isPending}
                  className="text-green-700 dark:text-green-400 hover:underline underline-offset-2 disabled:opacity-50"
                >
                  Подтвердить
                </button>
                <Link
                  href={`/sales-plan/purchases?status=suggested`}
                  prefetch={false}
                  className="text-primary underline-offset-2 hover:underline"
                  onClick={() => setOpen(false)}
                >
                  Открыть
                </Link>
                <button
                  type="button"
                  onClick={handleDismiss}
                  disabled={isPending}
                  className="text-destructive hover:underline underline-offset-2 disabled:opacity-50 ml-auto"
                >
                  Убрать
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function IncomingBadges({ arrivals, canManage = false, virtualStatuses }: IncomingBadgesProps) {
  const realArrivals = arrivals.filter(
    (a) => a.source === "purchase" || a.source === "incoming-legacy",
  )
  const virtualArrivals = arrivals.filter((a) => a.source === "virtual")

  if (realArrivals.length === 0 && virtualArrivals.length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>
  }

  return (
    <div className="flex flex-col gap-0.5">
      {/* Реальные приходы */}
      {realArrivals.map((a) => (
        <RealBadgePopover key={`real-${a.refId}-${a.date}`} arrival={a} />
      ))}

      {/* Виртуальные приходы — определяем статус через virtualStatuses map */}
      {virtualArrivals.map((a) => {
        const vpId = a.refId
        const vpStatus = virtualStatuses?.[vpId] ?? "SUGGESTED"
        if (vpStatus === "ACCEPTED") {
          return (
            <AcceptedVirtualBadge
              key={`vp-acc-${vpId}-${a.date}`}
              arrival={a}
              canManage={canManage}
            />
          )
        }
        return (
          <SuggestedVirtualBadge
            key={`vp-sug-${vpId}-${a.date}`}
            arrival={a}
            canManage={canManage}
          />
        )
      })}
    </div>
  )
}

export function IncomingBadgesLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
      <span className="flex items-center gap-1">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          <Package className="h-3 w-3" />
          DD.MM ×N
        </span>
        реальный приход
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-dashed border-violet-400 text-violet-700 dark:text-violet-400">
          ◇ DD.MM ×N
        </span>
        подтверждённая виртуальная
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-dashed border-amber-400 text-amber-700 dark:text-amber-400">
          ⚠ DD.MM ×N
        </span>
        авто-предложение (учтено в плане)
      </span>
    </div>
  )
}
