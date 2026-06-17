"use client"

import { useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { TableBody, TableRow, TableCell } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Plus, Link2, Link2Off, Pencil, X, ChevronRight, ChevronDown, Package } from "lucide-react"
import { toast } from "sonner"
import { currentStageLabel, currentStageBadgeClass } from "@/lib/purchase-stages"
import {
  createPurchaseGroup,
  renamePurchaseGroup,
  ungroupPurchaseGroup,
  removePurchaseFromGroup,
} from "@/app/actions/purchases"
import {
  PurchaseModal,
  type SupplierOption,
  type ProductOption,
  type ProductLinkMap,
} from "@/components/procurement/PurchaseModal"

// ── Types ──────────────────────────────────────────────────────────

export interface PurchaseItemMini {
  id?: string
  name: string
  sku: string
  photoUrl: string | null
  quantity: number              // заказано
  currentStage?: string | null  // StageKey | null (null = Заказано)
  currentStageQty?: number      // кол-во на текущем этапе
  currentStageDate?: string | null // ISO даты достижения текущего этапа
  sum?: number                  // сумма в валюте закупки (заказанное кол-во)
  sumRub?: number | null        // сумма в рублях (null если курса нет)
  currency?: string             // валюта закупки
  weightKg?: number | null      // вес позиции (кг), null если нет данных по товару
  volumeM3?: number | null      // объём позиции (м³), null если нет данных по товару
}

export interface PurchaseRow {
  id: string
  createdAt: string // ISO
  supplierId: string
  supplierName: string
  buyerName: string | null
  currency: string
  total: number
  totalRub: number | null // ≈ в рублях по курсу ЦБ (null если курса нет)
  status: "PLANNED" | "ACTIVE" | "COMPLETED"
  nearestDueDate: string | null // ISO ближайшего неоплаченного платежа
  hasOverdue: boolean
  groupId: string | null
  weightKg: number | null
  volumeM3: number | null
  items: PurchaseItemMini[]
}

export interface GroupAgg {
  name: string
  totalRub: number | null
  byCurrency: { currency: string; total: number }[]
}

export interface GrandTotals {
  totalRub: number | null
  byCurrency: { currency: string; total: number }[]
  weightKg: number
  volumeM3: number
}

interface PurchasesTableProps {
  rows: PurchaseRow[]
  groups: Record<string, GroupAgg>
  grandTotals: GrandTotals
  canManage: boolean
  suppliers: SupplierOption[]
  products: ProductOption[]
  productLinkMap: ProductLinkMap
}

// ── Helpers ────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function formatMoney(n: number, currency: string): string {
  // В таблице закупок суммы в валюте контракта показываем целыми (без копеек/фыней).
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 }) + " " + currency
}

function formatRub(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 }) + " ₽"
}

function formatWeight(n: number | null): string {
  if (n == null) return "—"
  // Целое, округление вверх (по требованию — без дробной части)
  return Math.ceil(n).toLocaleString("ru-RU") + " кг"
}

function formatVolume(n: number | null): string {
  if (n == null) return "—"
  // Целое, округление вверх
  return Math.ceil(n).toLocaleString("ru-RU") + " м³"
}

// Компактная лента миниатюр товаров закупки (до 4 + счётчик остатка).
function ItemsThumbs({ items }: { items: PurchaseItemMini[] }) {
  if (items.length === 0) return <span className="text-muted-foreground text-xs">—</span>
  const shown = items.slice(0, 6)
  const rest = items.length - shown.length
  return (
    <div className="flex items-center gap-1.5">
      {shown.map((it, idx) =>
        it.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={idx}
            src={it.photoUrl}
            alt={it.name}
            title={`${it.name} — ${it.quantity} шт`}
            className="h-[72px] w-[54px] shrink-0 rounded-md border object-cover bg-muted"
          />
        ) : (
          <div
            key={idx}
            title={`${it.name} — ${it.quantity} шт`}
            className="h-[72px] w-[54px] shrink-0 rounded-md border bg-muted"
          />
        )
      )}
      {rest > 0 && (
        <span className="text-xs text-muted-foreground" title={items.slice(6).map((i) => i.name).join(", ")}>
          +{rest}
        </span>
      )}
    </div>
  )
}

// ── Status badge ────────────────────────────────────────────────────

const STATUS_LABELS: Record<PurchaseRow["status"], string> = {
  PLANNED: "Планируемая",
  ACTIVE: "Текущая",
  COMPLETED: "Завершённая",
}

function StatusBadge({ status }: { status: PurchaseRow["status"] }) {
  // Discretion: PLANNED grey, ACTIVE blue, COMPLETED emerald
  const cls: Record<PurchaseRow["status"], string> = {
    PLANNED:
      "bg-muted text-muted-foreground",
    ACTIVE:
      "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
    COMPLETED:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

// ── Main ───────────────────────────────────────────────────────────

function groupSubtotalText(g: GroupAgg): string {
  return g.byCurrency
    .map((c) => formatMoney(c.total, c.currency))
    .join(" + ")
}

export function PurchasesTable({
  rows,
  groups,
  grandTotals,
  canManage,
  suppliers,
  products,
  productLinkMap,
}: PurchasesTableProps) {
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // колонки: [чекбокс] Товары·Сумма·Вес·Объём·Закупщик·Статус·Платёж·Дата·Поставщик
  const colCount = canManage ? 10 : 9

  // Выбранные строки (только не сгруппированные участвуют в объединении).
  const selectedRows = rows.filter((r) => selected.has(r.id))
  const sameSupplier =
    selectedRows.length > 0 && new Set(selectedRows.map((r) => r.supplierId)).size === 1
  const canMerge = selectedRows.length >= 2 && sameSupplier

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function run(action: Promise<{ ok: boolean; error?: string }>, okMsg?: string) {
    setBusy(true)
    try {
      const res = await action
      if (res.ok) {
        if (okMsg) toast.success(okMsg)
        setSelected(new Set())
        router.refresh()
      } else {
        toast.error(res.error ?? "Ошибка")
      }
    } catch {
      toast.error("Ошибка сервера")
    } finally {
      setBusy(false)
    }
  }

  async function submitRename(groupId: string) {
    const name = editName.trim()
    setEditingGroup(null)
    if (!name || name === groups[groupId]?.name) return
    await run(renamePurchaseGroup(groupId, name))
  }

  function renderDataRow(row: PurchaseRow, isMember: boolean) {
    const isOpen = expanded.has(row.id)
    return (
      <TableRow
        key={row.id}
        className={`cursor-pointer hover:bg-muted/40 ${isMember ? "bg-muted/20" : ""}`}
        onClick={() => router.push(`/procurement/purchases/${row.id}`)}
      >
        {canManage && (
          <TableCell
            className={`px-2 py-2 text-center ${isMember ? "border-l-2 border-l-primary/50" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            {isMember ? (
              <button
                type="button"
                title="Убрать из группы"
                disabled={busy}
                onClick={() => run(removePurchaseFromGroup(row.id))}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <input
                type="checkbox"
                checked={selected.has(row.id)}
                onChange={() => toggle(row.id)}
                className="h-3.5 w-3.5 accent-primary"
              />
            )}
          </TableCell>
        )}
        <TableCell className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            {row.items.length > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleExpand(row.id) }}
                className="text-muted-foreground hover:text-foreground shrink-0"
                title={isOpen ? "Свернуть" : "Развернуть позиции"}
              >
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            )}
            <ItemsThumbs items={row.items} />
          </div>
        </TableCell>
        <TableCell className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
          {row.totalRub != null && row.currency !== "RUB" ? (
            <>
              <div>{formatRub(row.totalRub)}</div>
              <div className="text-xs text-muted-foreground">
                {formatMoney(row.total, row.currency)}
              </div>
            </>
          ) : (
            <div>{formatMoney(row.total, row.currency)}</div>
          )}
        </TableCell>
        <TableCell className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
          {formatWeight(row.weightKg)}
        </TableCell>
        <TableCell className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
          {formatVolume(row.volumeM3)}
        </TableCell>
        <TableCell className="px-3 py-2 whitespace-nowrap">{row.buyerName ?? "—"}</TableCell>
        <TableCell className="px-3 py-2 text-center">
          <StatusBadge status={row.status} />
        </TableCell>
        <TableCell className="px-3 py-2 text-center whitespace-nowrap">
          {formatDate(row.nearestDueDate)}
        </TableCell>
        <TableCell className="px-3 py-2 whitespace-nowrap">{formatDate(row.createdAt)}</TableCell>
        <TableCell className="px-3 py-2 whitespace-nowrap">{row.supplierName}</TableCell>
      </TableRow>
    )
  }

  // Тело: вставляем строку-заголовок перед первым участником каждой группы.
  const bodyRows: ReactNode[] = []
  let prevGroup: string | null = null
  for (const row of rows) {
    if (row.groupId && row.groupId !== prevGroup) {
      const g = groups[row.groupId]
      if (g) {
        bodyRows.push(
          <TableRow key={`g-${row.groupId}`} className="bg-muted hover:bg-muted">
            {canManage && <TableCell className="px-2 py-2" />}
            {/* Товары: иконка + название (редактируемое) + разгруппировать */}
            <TableCell className="px-3 py-2">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary shrink-0" />
                {editingGroup === row.groupId ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => submitRename(row.groupId!)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitRename(row.groupId!)
                      if (e.key === "Escape") setEditingGroup(null)
                    }}
                    className="h-7 rounded border border-input bg-background px-2 text-sm font-medium"
                  />
                ) : (
                  <button
                    type="button"
                    className="group/name inline-flex items-center gap-1 font-semibold"
                    onClick={() => {
                      setEditName(g.name)
                      setEditingGroup(row.groupId)
                    }}
                  >
                    {g.name}
                    <Pencil className="h-3 w-3 opacity-0 group-hover/name:opacity-60" />
                  </button>
                )}
                {canManage && (
                  <button
                    type="button"
                    title="Разгруппировать"
                    disabled={busy}
                    onClick={() => run(ungroupPurchaseGroup(row.groupId!))}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                  >
                    <Link2Off className="h-3.5 w-3.5" />
                    Разгруппировать
                  </button>
                )}
              </div>
            </TableCell>
            {/* Сумма группы — выровнена с колонкой Сумма */}
            <TableCell className="px-3 py-2 text-right whitespace-nowrap tabular-nums font-medium">
              <div>{g.totalRub != null ? formatRub(g.totalRub) : "— ₽"}</div>
              {g.byCurrency.length > 0 && (
                <div className="text-xs font-normal text-muted-foreground">
                  {groupSubtotalText(g)}
                </div>
              )}
            </TableCell>
            <TableCell className="px-3 py-2" colSpan={colCount - (canManage ? 3 : 2)} />
          </TableRow>
        )
      }
    }
    bodyRows.push(renderDataRow(row, !!row.groupId))

    // Раскрытые под-строки позиций
    if (expanded.has(row.id) && row.items.length > 0) {
      for (let idx = 0; idx < row.items.length; idx++) {
        const it = row.items[idx]
        const stageArr = it.currentStage ? [it.currentStage] : []
        const badgeClass = currentStageBadgeClass(stageArr)
        const stageText = currentStageLabel(stageArr)
        const qty = it.currentStageQty ?? it.quantity
        bodyRows.push(
          <TableRow key={`${row.id}-item-${idx}`} className="bg-muted/20 hover:bg-muted/30">
            {/* Колонки выровнены с основной строкой: [чекбокс] Товары·Сумма·Вес·Объём + хвост */}
            {canManage && (
              <TableCell className="px-2 py-1.5 border-l-2 border-l-primary/40" />
            )}
            <TableCell
              className={`px-3 py-1.5 ${canManage ? "" : "border-l-2 border-l-primary/40"}`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {it.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.photoUrl}
                    alt={it.name}
                    className="h-[60px] w-[44px] shrink-0 rounded border object-cover bg-muted"
                  />
                ) : (
                  <div className="h-[60px] w-[44px] shrink-0 rounded border bg-muted flex items-center justify-center text-muted-foreground">
                    <Package className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium" title={it.name}>
                    {it.name}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">{it.sku}</span>
                </div>
                {/* Статус (+ дата этапа) + кол-во — справа в ячейке Товары, слева от столбца Сумма */}
                <div className="flex items-center gap-2 shrink-0 pl-2">
                  <span className="inline-flex flex-col items-center gap-0.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}
                    >
                      {stageText}
                    </span>
                    {it.currentStageDate && (
                      <span className="text-[10px] tabular-nums text-muted-foreground whitespace-nowrap">
                        {formatDate(it.currentStageDate)}
                      </span>
                    )}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                    {qty} шт
                  </span>
                </div>
              </div>
            </TableCell>
            <TableCell className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums text-xs">
              {it.sum != null ? (
                it.sumRub != null && it.currency !== "RUB" ? (
                  <>
                    <div>{formatRub(it.sumRub)}</div>
                    <div className="text-muted-foreground">{formatMoney(it.sum, it.currency ?? "")}</div>
                  </>
                ) : (
                  <div>{formatMoney(it.sum, it.currency ?? "")}</div>
                )
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums text-xs text-muted-foreground">
              {formatWeight(it.weightKg ?? null)}
            </TableCell>
            <TableCell className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums text-xs text-muted-foreground">
              {formatVolume(it.volumeM3 ?? null)}
            </TableCell>
            <TableCell colSpan={5} className="px-3 py-1.5" />
          </TableRow>
        )
      }
    }

    prevGroup = row.groupId
  }

  return (
    <div className="h-full flex flex-col gap-3">
      {canManage && (
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={!canMerge || busy}
                onClick={() => run(createPurchaseGroup([...selected]), "Закупки объединены в группу")}
                title={
                  !sameSupplier
                    ? "Можно объединять только закупки одного поставщика"
                    : "Объединить выбранные в группу"
                }
              >
                <Link2 className="h-4 w-4" />
                Объединить в группу ({selected.size})
              </Button>
              {!sameSupplier && selectedRows.length >= 2 && (
                <span className="text-xs text-destructive">разные поставщики</span>
              )}
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setSelected(new Set())}
              >
                Сбросить
              </button>
            </div>
          )}
          <Button size="sm" className="ml-auto gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Новая закупка
          </Button>
          <PurchaseModal
            open={createOpen}
            onOpenChange={setCreateOpen}
            mode="create"
            purchase={null}
            suppliers={suppliers}
            products={products}
            productLinkMap={productLinkMap}
          />
        </div>
      )}

      {rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="rounded-lg border bg-muted/20 py-12 px-8 text-center text-sm text-muted-foreground">
            <p className="font-medium mb-1">Закупок пока нет</p>
            <p>Создайте первую закупку через кнопку «Новая закупка»</p>
          </div>
        </div>
      ) : (
        // CLAUDE.md sticky data-table pattern: single scroll container, raw HTML thead,
        // solid bg on sticky cells (no /NN alpha).
        <div className="overflow-auto h-full rounded-lg border">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead className="bg-background">
              <tr>
                {canManage && (
                  <th className="sticky top-0 z-20 bg-background border-b px-2 py-2 w-8" />
                )}
                <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Товары
                </th>
                <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Сумма
                </th>
                <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Вес
                </th>
                <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Объём
                </th>
                <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Закупщик
                </th>
                <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-center text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Статус
                </th>
                <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-center text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Ближайший платёж
                </th>
                <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Дата создания
                </th>
                <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Поставщик
                </th>
              </tr>
            </thead>
            <TableBody>{bodyRows}</TableBody>
            <tfoot>
              <tr className="font-semibold">
                {canManage && (
                  <td className="sticky bottom-0 bg-muted border-t px-2 py-2" />
                )}
                <td className="sticky bottom-0 bg-muted border-t px-3 py-2 whitespace-nowrap">
                  Итого
                </td>
                <td className="sticky bottom-0 bg-muted border-t px-3 py-2 text-right whitespace-nowrap tabular-nums">
                  <div>
                    {grandTotals.totalRub != null ? formatRub(grandTotals.totalRub) : "— ₽"}
                  </div>
                  {grandTotals.byCurrency.length > 0 && (
                    <div className="text-xs font-normal text-muted-foreground">
                      {grandTotals.byCurrency
                        .map((c) => formatMoney(c.total, c.currency))
                        .join(" + ")}
                    </div>
                  )}
                </td>
                <td className="sticky bottom-0 bg-muted border-t px-3 py-2 text-right whitespace-nowrap tabular-nums">
                  {formatWeight(grandTotals.weightKg)}
                </td>
                <td className="sticky bottom-0 bg-muted border-t px-3 py-2 text-right whitespace-nowrap tabular-nums">
                  {formatVolume(grandTotals.volumeM3)}
                </td>
                <td className="sticky bottom-0 bg-muted border-t px-3 py-2" colSpan={5} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
