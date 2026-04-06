// app/(dashboard)/products/page.tsx
// Product list — RSC page with server-side pagination, filter, and search

import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { ProductsTable } from "@/components/products/ProductsTable"
import { ProductStatusTabs } from "@/components/products/ProductStatusTabs"
import { ProductSearchInput } from "@/components/products/ProductSearchInput"
import { Availability } from "@prisma/client"

const PAGE_SIZE = 20

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string }>
}) {
  await requireSection("PRODUCTS")
  const { q, page: pageParam, status } = await searchParams

  // Build availability filter where clause
  type WhereClause = {
    deletedAt?: null | { not: null }
    availability?: Availability
    name?: { contains: string; mode: "insensitive" }
  }

  const where: WhereClause = {}

  if (status === "DELETED") {
    where.deletedAt = { not: null }
  } else if (status === "ALL") {
    where.deletedAt = null
  } else if (status === "OUT_OF_STOCK") {
    where.deletedAt = null
    where.availability = "OUT_OF_STOCK"
  } else if (status === "DISCONTINUED") {
    where.deletedAt = null
    where.availability = "DISCONTINUED"
  } else {
    // Default: IN_STOCK
    where.deletedAt = null
    where.availability = "IN_STOCK"
  }

  if (q && q.trim()) {
    where.name = { contains: q.trim(), mode: "insensitive" }
  }

  const currentPage = Math.max(1, parseInt(pageParam ?? "1", 10))
  const skip = (currentPage - 1) * PAGE_SIZE

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { brand: true, category: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
    }),
    prisma.product.count({ where }),
  ])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentStatus = status ?? "IN_STOCK"

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Товары</h1>
        <Link
          href="/products/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
        >
          + Добавить товар
        </Link>
      </div>
      <ProductStatusTabs currentStatus={currentStatus} />
      <ProductSearchInput defaultValue={q ?? ""} />
      <ProductsTable
        products={products}
        currentPage={currentPage}
        totalPages={totalPages}
        currentStatus={currentStatus}
        searchQuery={q ?? ""}
      />
    </div>
  )
}
