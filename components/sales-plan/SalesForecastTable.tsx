"use client"

import { useMemo, useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ProductForecastDialog } from "./ProductForecastDialog"
import type { ProductForecast } from "@/lib/sales-forecast"
import { ArrowUpDown } from "lucide-react"

type SortKey =
  | "salesRub"
  | "salesUnits"
  | "ordersUnits"
  | "stockNow"
  | "baseline"
  | "buyoutPct"
  | "name"
  | "sku"

interface Props {
  products: ProductForecast[]
}

function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function fmtRub(n: number): string {
  if (Math.abs(n) >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} М`
  }
  if (Math.abs(n) >= 10_000) {
    return `${(n / 1_000).toLocaleString("ru-RU", { maximumFractionDigits: 0 })} К`
  }
  return fmtNum(Math.round(n))
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + "%"
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso + "T00:00:00Z")
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  })
}

export function SalesForecastTable({ products }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("salesRub")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [activeProduct, setActiveProduct] = useState<ProductForecast | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const sorted = useMemo(() => {
    const accessor: Record<SortKey, (p: ProductForecast) => number | string> = {
      salesRub: (p) => p.salesRub,
      salesUnits: (p) => p.salesUnits,
      ordersUnits: (p) => p.ordersUnits,
      stockNow: (p) => p.stockNow,
      baseline: (p) => p.baselineOrdersPerDay,
      buyoutPct: (p) => p.buyoutPct,
      name: (p) => p.name.toLocaleLowerCase("ru"),
      sku: (p) => p.sku,
    }
    const arr = [...products]
    arr.sort((a, b) => {
      const av = accessor[sortKey](a)
      const bv = accessor[sortKey](b)
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv), "ru")
        : String(bv).localeCompare(String(av), "ru")
    })
    return arr
  }, [products, sortKey, sortDir])

  function toggleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc")
    } else {
      setSortKey(k)
      setSortDir(k === "name" || k === "sku" ? "asc" : "desc")
    }
  }

  function open(p: ProductForecast) {
    setActiveProduct(p)
    setDialogOpen(true)
  }

  const totalRub = products.reduce((s, p) => s + p.salesRub, 0)
  const totalUnits = products.reduce((s, p) => s + p.salesUnits, 0)
  const totalOrders = products.reduce((s, p) => s + p.ordersUnits, 0)

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Фото</TableHead>
              <SortableHead
                label="SKU"
                k="sku"
                cur={sortKey}
                dir={sortDir}
                onClick={toggleSort}
                className="w-28"
              />
              <SortableHead
                label="Наименование"
                k="name"
                cur={sortKey}
                dir={sortDir}
                onClick={toggleSort}
                className="max-w-[280px]"
              />
              <TableHead>Бренд</TableHead>
              <TableHead>Категория</TableHead>
              <SortableHead
                label="Сток"
                k="stockNow"
                cur={sortKey}
                dir={sortDir}
                onClick={toggleSort}
                className="text-right w-20"
              />
              <SortableHead
                label="База/д"
                k="baseline"
                cur={sortKey}
                dir={sortDir}
                onClick={toggleSort}
                className="text-right w-20"
              />
              <SortableHead
                label="Выкуп%"
                k="buyoutPct"
                cur={sortKey}
                dir={sortDir}
                onClick={toggleSort}
                className="text-right w-20"
              />
              <TableHead className="text-right w-24">Приход</TableHead>
              <SortableHead
                label="Заказы"
                k="ordersUnits"
                cur={sortKey}
                dir={sortDir}
                onClick={toggleSort}
                className="text-right w-24"
              />
              <SortableHead
                label="Выкупы"
                k="salesUnits"
                cur={sortKey}
                dir={sortDir}
                onClick={toggleSort}
                className="text-right w-24"
              />
              <SortableHead
                label="Выручка"
                k="salesRub"
                cur={sortKey}
                dir={sortDir}
                onClick={toggleSort}
                className="text-right w-28"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={12}
                  className="text-center py-12 text-muted-foreground"
                >
                  Товары не найдены
                </TableCell>
              </TableRow>
            )}
            {sorted.map((p) => (
              <TableRow
                key={p.productId}
                onClick={() => open(p)}
                className="cursor-pointer hover:bg-muted/50"
              >
                <TableCell>
                  {p.photoUrl ? (
                    <img
                      src={p.photoUrl}
                      alt={p.name}
                      className="w-10 h-12 object-cover rounded"
                    />
                  ) : (
                    <div className="w-10 h-12 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                      —
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                <TableCell className="font-medium max-w-[280px]">
                  <span className="line-clamp-2">{p.name}</span>
                </TableCell>
                <TableCell className="text-sm">{p.brandName}</TableCell>
                <TableCell className="text-sm">
                  {p.categoryName ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtNum(p.stockNow)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtNum(p.baselineOrdersPerDay, 2)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtPct(p.buyoutPct)}
                  {p.buyoutFallback && (
                    <span className="text-amber-500 ml-0.5" title="глобальный fallback">
                      *
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right text-sm whitespace-nowrap">
                  {p.arrivalQty > 0 ? (
                    <>
                      {fmtNum(p.arrivalQty)}
                      <div className="text-[11px] text-muted-foreground">
                        {formatDateShort(p.arrivalDate)}
                      </div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtNum(p.ordersUnits, 1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtNum(p.salesUnits, 1)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {fmtRub(p.salesRub)}
                </TableCell>
              </TableRow>
            ))}
            {sorted.length > 0 && (
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell colSpan={9} className="text-right">
                  Итого по {sorted.length} товарам:
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtNum(totalOrders, 0)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtNum(totalUnits, 0)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-500">
                  {fmtRub(totalRub)}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <ProductForecastDialog
        product={activeProduct}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  )
}

function SortableHead({
  label,
  k,
  cur,
  dir,
  onClick,
  className,
}: {
  label: string
  k: SortKey
  cur: SortKey
  dir: "asc" | "desc"
  onClick: (k: SortKey) => void
  className?: string
}) {
  const active = cur === k
  return (
    <TableHead className={className}>
      <button
        onClick={() => onClick(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${active ? "text-foreground" : "text-muted-foreground"}`}
      >
        {label}
        <ArrowUpDown
          className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40"}`}
        />
        {active && (
          <span className="text-[10px] ml-0.5">
            {dir === "asc" ? "↑" : "↓"}
          </span>
        )}
      </button>
    </TableHead>
  )
}
