"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { updateProductCost } from "@/app/actions/cost"

// ── Types ──────────────────────────────────────────────────────────

interface CostProduct {
  id: string
  name: string
  photoUrl: string | null
  brand: { name: string }
  category: { name: string } | null
  subcategory: { name: string } | null
  cost: { costPrice: number; updatedAt: string | Date } | null
}

interface CostTableProps {
  products: CostProduct[]
  currentPage: number
  totalPages: number
}

// ── Moscow time formatter ─────────────────────────────────────────

const mskFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

function formatMsk(date: string | Date): string {
  return mskFormatter.format(new Date(date))
}

// ── Currency formatter (с разрядами) ──────────────────────────────

const currencyFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatCost(value: number): string {
  return currencyFormatter.format(value)
}

// ── Inline edit cell ──────────────────────────────────────────────

function CostCell({
  productId,
  currentValue,
}: {
  productId: string
  currentValue: number | null
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(currentValue?.toFixed(2) ?? "")
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  function handleSave() {
    const num = parseFloat(value)
    if (isNaN(num) || num < 0) {
      toast.error("Введите корректное число")
      return
    }
    // Round to 2 decimal places
    const rounded = Math.round(num * 100) / 100

    // Skip no-op
    if (currentValue !== null && Math.abs(rounded - currentValue) < 0.005) {
      setEditing(false)
      return
    }

    startTransition(async () => {
      const result = await updateProductCost(productId, rounded)
      if (result.ok) {
        toast("Себестоимость сохранена")
        setEditing(false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave()
    if (e.key === "Escape") {
      setValue(currentValue?.toFixed(2) ?? "")
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        disabled={isPending}
        className="w-28 h-8 text-sm"
      />
    )
  }

  return (
    <button
      onClick={() => {
        setValue(currentValue?.toFixed(2) ?? "")
        setEditing(true)
      }}
      className="text-sm hover:bg-muted px-2 py-1 rounded cursor-pointer min-w-[80px] text-left"
      title="Нажмите для редактирования"
    >
      {currentValue !== null ? (
        <span>{formatCost(currentValue)} ₽</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </button>
  )
}

// ── Main table ────────────────────────────────────────────────────

export function CostTable({ products, currentPage, totalPages }: CostTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function buildPageUrl(page: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("page", String(page))
    return `/batches?${params.toString()}`
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Фото</TableHead>
              <TableHead>Бренд</TableHead>
              <TableHead className="max-w-[200px]">Наименование</TableHead>
              <TableHead>Категория</TableHead>
              <TableHead>Подкатегория</TableHead>
              <TableHead className="w-32">Себестоимость</TableHead>
              <TableHead className="w-40">Дата изменения</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  Товары не найдены
                </TableCell>
              </TableRow>
            )}
            {products.map((product) => (
              <TableRow key={product.id}>
                <TableCell>
                  {product.photoUrl ? (
                    <img src={product.photoUrl} alt={product.name} className="w-12 h-16 object-cover rounded" />
                  ) : (
                    <div className="w-12 h-16 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">—</div>
                  )}
                </TableCell>
                <TableCell>{product.brand.name}</TableCell>
                <TableCell className="max-w-[200px]">
                  <span className="line-clamp-2">{product.name}</span>
                </TableCell>
                <TableCell>
                  {product.category?.name ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  {product.subcategory?.name ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  <CostCell
                    productId={product.id}
                    currentValue={product.cost?.costPrice ?? null}
                  />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {product.cost?.updatedAt ? formatMsk(product.cost.updatedAt) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Страница {currentPage} из {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => router.push(buildPageUrl(currentPage - 1))}>
              Назад
            </Button>
            <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => router.push(buildPageUrl(currentPage + 1))}>
              Вперёд
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
