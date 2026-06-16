"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { TableBody, TableRow, TableCell } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import {
  PurchaseModal,
  type SupplierOption,
  type ProductOption,
  type ProductLinkMap,
} from "@/components/procurement/PurchaseModal"

// ── Types ──────────────────────────────────────────────────────────

export interface PurchaseItemMini {
  name: string
  sku: string
  photoUrl: string | null
  quantity: number
}

export interface PurchaseRow {
  id: string
  createdAt: string // ISO
  supplierName: string
  buyerName: string | null
  currency: string
  total: number
  totalRub: number | null // ≈ в рублях по курсу ЦБ (null если курса нет)
  status: "PLANNED" | "ACTIVE" | "COMPLETED"
  nearestDueDate: string | null // ISO ближайшего неоплаченного платежа
  hasOverdue: boolean
  items: PurchaseItemMini[]
}

interface PurchasesTableProps {
  rows: PurchaseRow[]
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
  return (
    n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    " " +
    currency
  )
}

function formatRub(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 }) + " ₽"
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

export function PurchasesTable({
  rows,
  canManage,
  suppliers,
  products,
  productLinkMap,
}: PurchasesTableProps) {
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="h-full flex flex-col gap-3">
      {canManage && (
        <div className="flex items-center">
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
                <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Товары
                </th>
                <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Сумма
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
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => router.push(`/procurement/purchases/${row.id}`)}
                >
                  <TableCell className="px-3 py-2">
                    <ItemsThumbs items={row.items} />
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
                  <TableCell className="px-3 py-2 whitespace-nowrap">
                    {row.buyerName ?? "—"}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-center">
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="px-3 py-2 text-center whitespace-nowrap">
                    {formatDate(row.nearestDueDate)}
                  </TableCell>
                  <TableCell className="px-3 py-2 whitespace-nowrap">
                    {formatDate(row.createdAt)}
                  </TableCell>
                  <TableCell className="px-3 py-2 whitespace-nowrap">
                    {row.supplierName}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </table>
        </div>
      )}
    </div>
  )
}
