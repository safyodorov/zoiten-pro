"use client"

// components/procurement/ProcurementPlanTable.tsx
// Phase 20 (D-10, D-11, D-12, D-18): таблица прогноза закупок (read-only MVP).
// CLAUDE.md sticky data-table pattern: единый scroll-контейнер, raw HTML table,
// СПЛОШНОЙ bg-background на sticky-ячейках (без alpha), ru-RU форматирование.

import Link from "next/link"

// ── Types ──────────────────────────────────────────────────────────

export interface ProcurementPlanTableRow {
  productId: string
  sku: string
  name: string
  /** Д дефицит, целое. */
  deficit: number
  supplierName: string | null
  leadTimeDays: number | null
  /** ETA доставки, ISO YYYY-MM-DD. null если leadTime неизвестен. */
  deliveryEta: string | null
}

interface ProcurementPlanTableProps {
  rows: ProcurementPlanTableRow[]
}

// ── Helpers ────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10))
  const date = new Date(Date.UTC(y, m - 1, d))
  if (isNaN(date.getTime())) return "—"
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  })
}

function formatInt(n: number): string {
  return n.toLocaleString("ru-RU")
}

// ── Main ───────────────────────────────────────────────────────────

export function ProcurementPlanTable({ rows }: ProcurementPlanTableProps) {
  if (rows.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="rounded-lg border bg-muted/20 py-12 px-8 text-center text-sm text-muted-foreground">
          <p className="font-medium mb-1">Нет товаров с дефицитом, привязанных к поставщикам</p>
          <p>
            Появятся товары с дефицитом (Д&nbsp;&gt;&nbsp;0), у которых задан
            поставщик со сроком готовности
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-auto h-full rounded-lg border">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead className="bg-background">
          <tr>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Товар
            </th>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-center text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Д дефицит
            </th>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Поставщик
            </th>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-center text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Срок готовности, дней
            </th>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-center text-xs font-semibold text-muted-foreground whitespace-nowrap">
              ETA доставки (МСК)
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.productId}
              className="hover:bg-muted/40 transition-colors [&>td]:border-b"
            >
              <td className="px-3 py-2 font-medium">
                <Link
                  href={`/products/${row.productId}/edit`}
                  prefetch={false}
                  className="hover:text-primary hover:underline"
                >
                  {row.name}
                </Link>
                <div className="text-xs text-muted-foreground tabular-nums">{row.sku}</div>
              </td>
              <td className="px-3 py-2 text-center tabular-nums font-medium">
                {formatInt(row.deficit)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                {row.supplierName ?? <span className="text-muted-foreground">—</span>}
              </td>
              <td className="px-3 py-2 text-center tabular-nums">
                {row.leadTimeDays !== null ? (
                  formatInt(row.leadTimeDays)
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-center whitespace-nowrap tabular-nums">
                {formatDate(row.deliveryEta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
