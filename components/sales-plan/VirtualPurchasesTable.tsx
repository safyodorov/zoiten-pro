"use client"

// components/sales-plan/VirtualPurchasesTable.tsx
// Таблица виртуальных закупок — sticky raw-HTML, сплошной bg (CLAUDE.md).
// Phase 25-07 (Task 3)

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { VirtualPurchaseRow } from "@/app/(dashboard)/sales-plan/purchases/page"
import {
  acceptVirtualPurchase,
  dismissVirtualPurchase,
} from "@/app/actions/sales-plan"
import { VirtualPurchaseDialog } from "./VirtualPurchaseDialog"

interface Supplier {
  id: string
  nameForeign: string
  nameEnglish: string
}

interface VirtualPurchasesTableProps {
  rows: VirtualPurchaseRow[]
  canManage: boolean
  today: string
  statusFilter: string
  suppliers: Supplier[]
  defaultLeadTimeDays: number
}

// ── Форматирование ────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z")
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  })
}

function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function fmtMoney(val: string | null, currency: string): string {
  if (!val) return "—"
  const n = parseFloat(val)
  if (!Number.isFinite(n)) return "—"
  return `${fmtNum(n, 0)} ${currency}`
}

function calcTotal(unitPrice: string | null, qty: number, currency: string): string {
  if (!unitPrice) return "—"
  const n = parseFloat(unitPrice)
  if (!Number.isFinite(n)) return "—"
  return `${fmtNum(n * qty, 0)} ${currency}`
}

// ── Row actions ───────────────────────────────────────────────────────────────

function ActionCell({
  row,
  canManage,
  today,
  suppliers,
  defaultLeadTimeDays,
  onRefresh,
}: {
  row: VirtualPurchaseRow
  canManage: boolean
  today: string
  suppliers: Supplier[]
  defaultLeadTimeDays: number
  onRefresh: () => void
}) {
  const router = useRouter()
  const [showDialog, setShowDialog] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (!canManage) return null

  function handleAccept() {
    startTransition(async () => {
      await acceptVirtualPurchase(row.id)
      onRefresh()
    })
  }

  function handleDismiss() {
    startTransition(async () => {
      await dismissVirtualPurchase(row.id)
      onRefresh()
    })
  }

  function handleConvert() {
    router.push(`/procurement/purchases?create=1&from-virtual=${row.id}`)
  }

  if (row.status === "CONVERTED" || row.status === "DISMISSED") return null

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {row.status === "SUGGESTED" && (
        <button
          type="button"
          onClick={handleAccept}
          disabled={isPending}
          className="px-2 py-0.5 text-xs rounded border border-green-500 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          Подтвердить
        </button>
      )}

      <button
        type="button"
        onClick={() => setShowDialog(true)}
        disabled={isPending}
        className="px-2 py-0.5 text-xs rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50 whitespace-nowrap"
      >
        Изменить
      </button>

      {row.status === "SUGGESTED" && (
        <button
          type="button"
          onClick={handleDismiss}
          disabled={isPending}
          className="px-2 py-0.5 text-xs rounded border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          Убрать
        </button>
      )}

      {row.status === "ACCEPTED" && (
        <>
          <button
            type="button"
            onClick={handleDismiss}
            disabled={isPending}
            className="px-2 py-0.5 text-xs rounded border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            Убрать
          </button>
          <button
            type="button"
            onClick={handleConvert}
            disabled={isPending}
            className="px-2 py-0.5 text-xs rounded border border-primary text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            → Создать закупку
          </button>
        </>
      )}

      {showDialog && (
        <VirtualPurchaseDialog
          id={row.id}
          qty={row.qty}
          orderDate={row.orderDate}
          expectedArrivalDate={row.expectedArrivalDate}
          leadTimeDaysUsed={row.leadTimeDaysUsed}
          supplierId={row.supplierId}
          unitPrice={row.unitPrice}
          currency={row.currency}
          productName={row.name}
          suppliers={suppliers}
          defaultLeadTimeDays={defaultLeadTimeDays}
          today={today}
          onClose={() => setShowDialog(false)}
          onSuccess={() => {
            setShowDialog(false)
            onRefresh()
          }}
        />
      )}
    </div>
  )
}

// ── Main table ────────────────────────────────────────────────────────────────

export function VirtualPurchasesTable({
  rows,
  canManage,
  today,
  statusFilter,
  suppliers,
  defaultLeadTimeDays,
}: VirtualPurchasesTableProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPendingBulk, startBulkTransition] = useTransition()

  function handleRefresh() {
    router.refresh()
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll(ids: string[]) {
    if (ids.every((id) => selected.has(id))) {
      setSelected((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
    } else {
      setSelected((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.add(id))
        return next
      })
    }
  }

  // Bulk dismiss
  async function handleBulkDismiss() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    startBulkTransition(async () => {
      for (const id of ids) {
        await dismissVirtualPurchase(id)
      }
      setSelected(new Set())
      router.refresh()
    })
  }

  // Bulk accept
  async function handleBulkAccept() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    startBulkTransition(async () => {
      for (const id of ids) {
        await acceptVirtualPurchase(id)
      }
      setSelected(new Set())
      router.refresh()
    })
  }

  const suggested = rows.filter((r) => r.status === "SUGGESTED")
  const accepted = rows.filter((r) => r.status === "ACCEPTED")
  const dismissed = rows.filter((r) => r.status === "DISMISSED")

  const displaySuggested = statusFilter === "suggested" || statusFilter === "all"
  const displayAccepted = statusFilter === "accepted" || statusFilter === "all"
  const displayDismissed = statusFilter === "dismissed" || statusFilter === "all"

  const suggestedIds = suggested.map((r) => r.id)
  const acceptedIds = accepted.map((r) => r.id)

  if (rows.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Предложений нет
        </div>
        <HowItWorksDetails />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Bulk toolbar */}
      {canManage && selected.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-muted border-b text-sm shrink-0">
          <span className="text-muted-foreground">Выбрано: {selected.size}</span>
          <button
            type="button"
            onClick={handleBulkAccept}
            disabled={isPendingBulk}
            className="px-3 py-1 rounded border border-green-500 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors disabled:opacity-50"
          >
            Подтвердить все
          </button>
          <button
            type="button"
            onClick={handleBulkDismiss}
            disabled={isPendingBulk}
            className="px-3 py-1 rounded border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors disabled:opacity-50"
          >
            Убрать все
          </button>
        </div>
      )}

      {/* Таблица */}
      <div className="overflow-auto flex-1 min-h-0">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="bg-background">
            <tr>
              {canManage && (
                <th className="sticky top-0 z-20 bg-background border-b px-2 py-2 text-center w-8">
                  {/* all-select checkbox — covered per-section */}
                </th>
              )}
              <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left whitespace-nowrap font-medium text-xs text-muted-foreground">УКТ</th>
              <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left font-medium text-xs text-muted-foreground">Название</th>
              <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-right whitespace-nowrap font-medium text-xs text-muted-foreground">Сток</th>
              <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-right whitespace-nowrap font-medium text-xs text-muted-foreground">План шт/д</th>
              <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-center whitespace-nowrap font-medium text-xs text-muted-foreground">Сток до</th>
              <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-center whitespace-nowrap font-medium text-xs text-muted-foreground">Заказать до</th>
              <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-right whitespace-nowrap font-medium text-xs text-muted-foreground">Кол-во</th>
              <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left whitespace-nowrap font-medium text-xs text-muted-foreground">Поставщик</th>
              <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-right whitespace-nowrap font-medium text-xs text-muted-foreground">Срок</th>
              <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-right whitespace-nowrap font-medium text-xs text-muted-foreground">Сумма</th>
              {canManage && (
                <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left whitespace-nowrap font-medium text-xs text-muted-foreground">Действия</th>
              )}
            </tr>
          </thead>

          <tbody>
            {/* ── Секция: Предложения ──────────────────────────────────────── */}
            {displaySuggested && suggested.length > 0 && (
              <>
                <tr>
                  <td
                    colSpan={canManage ? 12 : 11}
                    className="bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground"
                  >
                    <div className="flex items-center gap-2">
                      {canManage && (
                        <input
                          type="checkbox"
                          checked={suggestedIds.every((id) => selected.has(id))}
                          onChange={() => toggleAll(suggestedIds)}
                          className="rounded"
                          title="Выбрать все предложения"
                        />
                      )}
                      Предложения ({suggested.length})
                    </div>
                  </td>
                </tr>
                {suggested.map((row) => (
                  <VirtualPurchaseTableRow
                    key={row.id}
                    row={row}
                    canManage={canManage}
                    today={today}
                    suppliers={suppliers}
                    defaultLeadTimeDays={defaultLeadTimeDays}
                    isSelected={selected.has(row.id)}
                    onToggleSelect={() => toggleSelect(row.id)}
                    onRefresh={handleRefresh}
                  />
                ))}
              </>
            )}

            {/* ── Секция: Подтверждённые ───────────────────────────────────── */}
            {displayAccepted && accepted.length > 0 && (
              <>
                <tr>
                  <td
                    colSpan={canManage ? 12 : 11}
                    className="bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground"
                  >
                    <div className="flex items-center gap-2">
                      {canManage && (
                        <input
                          type="checkbox"
                          checked={acceptedIds.every((id) => selected.has(id))}
                          onChange={() => toggleAll(acceptedIds)}
                          className="rounded"
                          title="Выбрать все подтверждённые"
                        />
                      )}
                      Подтверждённые ({accepted.length})
                    </div>
                  </td>
                </tr>
                {accepted.map((row) => (
                  <VirtualPurchaseTableRow
                    key={row.id}
                    row={row}
                    canManage={canManage}
                    today={today}
                    suppliers={suppliers}
                    defaultLeadTimeDays={defaultLeadTimeDays}
                    isSelected={selected.has(row.id)}
                    onToggleSelect={() => toggleSelect(row.id)}
                    onRefresh={handleRefresh}
                  />
                ))}
              </>
            )}

            {/* ── Секция: Отклонённые ─────────────────────────────────────── */}
            {displayDismissed && dismissed.length > 0 && (
              <>
                <tr>
                  <td
                    colSpan={canManage ? 12 : 11}
                    className="bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground"
                  >
                    Отклонённые ({dismissed.length})
                  </td>
                </tr>
                {dismissed.map((row) => (
                  <VirtualPurchaseTableRow
                    key={row.id}
                    row={row}
                    canManage={false}
                    today={today}
                    suppliers={suppliers}
                    defaultLeadTimeDays={defaultLeadTimeDays}
                    isSelected={false}
                    onToggleSelect={() => {}}
                    onRefresh={handleRefresh}
                  />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      <HowItWorksDetails />
    </div>
  )
}

// ── Single row ────────────────────────────────────────────────────────────────

function VirtualPurchaseTableRow({
  row,
  canManage,
  today,
  suppliers,
  defaultLeadTimeDays,
  isSelected,
  onToggleSelect,
  onRefresh,
}: {
  row: VirtualPurchaseRow
  canManage: boolean
  today: string
  suppliers: Supplier[]
  defaultLeadTimeDays: number
  isSelected: boolean
  onToggleSelect: () => void
  onRefresh: () => void
}) {
  const isDismissed = row.status === "DISMISSED"
  const isOverdue = row.isOverdue

  return (
    <tr className={[
      "border-b last:border-0",
      isDismissed ? "opacity-50" : "hover:bg-muted/30",
    ].join(" ")}>
      {canManage && (
        <td className="px-2 py-2 text-center">
          {!isDismissed && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              className="rounded"
            />
          )}
        </td>
      )}

      {/* УКТ */}
      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{row.sku}</td>

      {/* Название */}
      <td className="px-3 py-2 max-w-[220px] truncate text-xs" title={row.name}>
        {row.name}
      </td>

      {/* Сток */}
      <td className="px-3 py-2 tabular-nums text-right text-xs">
        {fmtNum(row.stockNow)}
      </td>

      {/* План шт/д */}
      <td className="px-3 py-2 tabular-nums text-right text-xs">
        {fmtNum(row.baselineOrdersPerDay, 1)}
      </td>

      {/* Сток до */}
      <td className="px-3 py-2 text-center text-xs">
        {row.stockoutDate ? (
          <span className={row.stockoutDate < today ? "text-destructive font-medium" : ""}>
            {formatDate(row.stockoutDate)}
            {row.stockoutDate < today && " ⚠"}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* Заказать до */}
      <td className="px-3 py-2 text-center text-xs whitespace-nowrap">
        <span className={isOverdue ? "text-destructive font-medium" : ""}>
          {formatDate(row.orderDate)}
          {isOverdue && " ⚠"}
          {row.leadTimeDaysUsed != null && (
            <span className="text-muted-foreground ml-1">({row.leadTimeDaysUsed} д)</span>
          )}
        </span>
      </td>

      {/* Кол-во */}
      <td className="px-3 py-2 tabular-nums text-right text-xs">
        {fmtNum(row.qty)}
      </td>

      {/* Поставщик */}
      <td className="px-3 py-2 text-xs max-w-[160px] truncate">
        {row.supplierNameForeign ? (
          <span title={`${row.supplierNameForeign} / ${row.supplierNameEnglish}`}>
            {row.supplierNameForeign}
          </span>
        ) : (
          <span className="text-amber-600 dark:text-amber-400">— ⚠</span>
        )}
      </td>

      {/* Срок */}
      <td className="px-3 py-2 tabular-nums text-right text-xs text-muted-foreground whitespace-nowrap">
        {row.leadTimeDaysUsed != null ? `${row.leadTimeDaysUsed} д` : `${defaultLeadTimeDays} д*`}
      </td>

      {/* Сумма */}
      <td className="px-3 py-2 tabular-nums text-right text-xs whitespace-nowrap">
        {calcTotal(row.unitPrice, row.qty, row.currency)}
      </td>

      {/* Действия */}
      {canManage && (
        <td className="px-3 py-2">
          <ActionCell
            row={row}
            canManage={canManage}
            today={today}
            suppliers={suppliers}
            defaultLeadTimeDays={defaultLeadTimeDays}
            onRefresh={onRefresh}
          />
        </td>
      )}
    </tr>
  )
}

// ── Details «Как формируются предложения» ─────────────────────────────────────

function HowItWorksDetails() {
  return (
    <details className="shrink-0 px-4 py-2 border-t text-xs text-muted-foreground">
      <summary className="cursor-pointer hover:text-foreground transition-colors py-1">
        Как формируются предложения
      </summary>
      <div className="mt-2 space-y-1.5 pb-2">
        <p>
          Предложения генерируются автоматически при изменении плана продаж (кнопка «Пересчитать план»
          или сохранение дневных правок).
        </p>
        <p>
          <strong>Триггер:</strong> прогнозный остаток товара опускается ниже страхового запаса
          ({"{"}safetyStockDays{"}"} дн × плановая скорость) — система предлагает заказ на покрытие
          следующих {"{"}vpCoverDays{"}"} дн + страховой запас.
        </p>
        <p>
          <strong>Дата заказа</strong> = максимум(сегодня, дата пробоя − lead time).
          <strong> Приход</strong> = дата заказа + lead time.
        </p>
        <p>
          <strong>Opt-out:</strong> предложения <em>сразу учтены в плане</em> (как будто заказываем вовремя).
          Отклонённые убираются из плана — колонка «Сток до» покажет реальный пробой.
        </p>
        <p>
          <strong>Подтвердить</strong> → предложение переживает следующую регенерацию.
          <strong> → Создать закупку</strong> → ACCEPTED превращается в реальную закупку (антидвойной счёт).
        </p>
        <p className="text-muted-foreground/70">
          * Срок указан по умолчанию — нет привязки поставщика к товару через SupplierProductLink.
        </p>
      </div>
    </details>
  )
}
