// components/products/ProductsTable.tsx
// Product list table with per-row duplicate + soft-delete actions
"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { duplicateProduct, softDeleteProduct } from "@/app/actions/products"

// ── Types ──────────────────────────────────────────────────────────

interface Product {
  id: string
  name: string
  photoUrl: string | null
  brand: { id: string; name: string }
  category: { id: string; name: string } | null
  abcStatus: string | null
  availability: string
  deletedAt: Date | null
  createdAt: Date
}

interface ProductsTableProps {
  products: Product[]
  currentPage: number
  totalPages: number
  currentStatus: string
  searchQuery: string
}

// ── Badge helpers ──────────────────────────────────────────────────

const AVAILABILITY_LABELS: Record<string, string> = {
  IN_STOCK: "Есть",
  OUT_OF_STOCK: "Нет в наличии",
  DISCONTINUED: "Выведен",
  DELETED: "Удалён",
}

const AVAILABILITY_CLASSES: Record<string, string> = {
  IN_STOCK: "bg-green-100 text-green-800",
  OUT_OF_STOCK: "bg-yellow-100 text-yellow-800",
  DISCONTINUED: "bg-gray-100 text-gray-700",
  DELETED: "bg-red-100 text-red-700",
}

const ABC_CLASSES: Record<string, string> = {
  A: "bg-green-100 text-green-800",
  B: "bg-blue-100 text-blue-800",
  C: "bg-orange-100 text-orange-800",
}

// ── Component ──────────────────────────────────────────────────────

export function ProductsTable({
  products,
  currentPage,
  totalPages,
  currentStatus,
  searchQuery,
}: ProductsTableProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function buildPageUrl(page: number) {
    const params = new URLSearchParams()
    params.set("status", currentStatus)
    params.set("page", String(page))
    if (searchQuery) params.set("q", searchQuery)
    return `/products?${params.toString()}`
  }

  function handleDuplicate(id: string) {
    startTransition(async () => {
      const result = await duplicateProduct(id)
      if (result.ok) {
        toast("Товар скопирован")
        router.push(`/products/${result.id}/edit`)
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await softDeleteProduct(id)
      if (result.ok) {
        toast("Товар удалён")
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Фото</TableHead>
              <TableHead>Наименование</TableHead>
              <TableHead>Бренд</TableHead>
              <TableHead>Категория</TableHead>
              <TableHead className="w-16">ABC</TableHead>
              <TableHead>Наличие</TableHead>
              <TableHead className="text-right">Действия</TableHead>
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
                {/* Photo */}
                <TableCell>
                  {product.photoUrl ? (
                    <img
                      src={product.photoUrl}
                      alt={product.name}
                      className="w-12 h-16 object-cover rounded"
                    />
                  ) : (
                    <div className="w-12 h-16 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                      —
                    </div>
                  )}
                </TableCell>

                {/* Name — clickable → edit page */}
                <TableCell className="font-medium">
                  <Link
                    href={`/products/${product.id}/edit`}
                    className="hover:underline"
                  >
                    {product.name}
                  </Link>
                </TableCell>

                {/* Brand */}
                <TableCell>{product.brand.name}</TableCell>

                {/* Category */}
                <TableCell>
                  {product.category?.name ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>

                {/* ABC badge */}
                <TableCell>
                  {product.abcStatus ? (
                    <span
                      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${ABC_CLASSES[product.abcStatus] ?? ""}`}
                    >
                      {product.abcStatus}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>

                {/* Availability badge */}
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${AVAILABILITY_CLASSES[product.availability] ?? "bg-gray-100 text-gray-700"}`}
                  >
                    {AVAILABILITY_LABELS[product.availability] ?? product.availability}
                  </span>
                </TableCell>

                {/* Actions */}
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleDuplicate(product.id)}
                    >
                      Копировать
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => {
                        if (confirm(`Удалить товар «${product.name}»?`)) {
                          handleDelete(product.id)
                        }
                      }}
                      className="text-destructive hover:text-destructive"
                    >
                      Удалить
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Страница {currentPage} из {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => router.push(buildPageUrl(currentPage - 1))}
            >
              Назад
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => router.push(buildPageUrl(currentPage + 1))}
            >
              Вперёд
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
