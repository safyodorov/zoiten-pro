"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { SupplierModal } from "@/components/procurement/SupplierModal"

// ── Types ──────────────────────────────────────────────────────────

export interface SupplierRow {
  id: string
  nameForeign: string
  nameEnglish: string
  buyerName: string | null
  productCount: number
  primaryContact: string | null
  createdAt: string // ISO
}

export interface BuyerOption {
  id: string
  name: string
}

interface SuppliersTableProps {
  rows: SupplierRow[]
  buyers: BuyerOption[]
  frequentBuyerIds: string[]
  canManage: boolean
}

// ── Helpers ────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

// ── Main ───────────────────────────────────────────────────────────

export function SuppliersTable({
  rows,
  buyers,
  frequentBuyerIds,
  canManage,
}: SuppliersTableProps) {
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="h-full flex flex-col gap-3">
      {canManage && (
        <div className="flex items-center">
          <Button size="sm" className="ml-auto gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Новый поставщик
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="rounded-lg border bg-muted/20 py-12 px-8 text-center text-sm text-muted-foreground">
            <p className="font-medium mb-1">Поставщиков пока нет</p>
            <p>Добавьте первого через кнопку «Новый поставщик»</p>
          </div>
        </div>
      ) : (
        // CLAUDE.md sticky data-table pattern: single scroll container,
        // raw HTML table, opaque bg-background на sticky-ячейках.
        <div className="overflow-auto flex-1 min-h-0 rounded-lg border">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead className="bg-background">
              <tr>
                <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Название (англ.)
                </th>
                <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Название (исходное)
                </th>
                <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Закупщик
                </th>
                <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-center text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Товаров
                </th>
                <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Основной контакт
                </th>
                <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-center text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Создан
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-muted/40 transition-colors [&>td]:border-b"
                >
                  <td className="px-3 py-2 whitespace-nowrap font-medium">
                    <Link
                      href={`/procurement/suppliers/${row.id}`}
                      prefetch={false}
                      className="hover:text-primary hover:underline"
                    >
                      {row.nameEnglish}
                    </Link>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {row.nameForeign}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {row.buyerName ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {row.productCount}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {row.primaryContact ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-center whitespace-nowrap text-muted-foreground">
                    {formatDate(row.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <SupplierModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          supplier={null}
          buyers={buyers}
          frequentBuyerIds={frequentBuyerIds}
        />
      )}
    </div>
  )
}
