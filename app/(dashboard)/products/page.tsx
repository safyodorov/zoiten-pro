// app/(dashboard)/products/page.tsx
// Product list — RSC page with server-side pagination, filter, search, brand/category/direction filters

import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { ProductsTable } from "@/components/products/ProductsTable"
import { ProductStatusTabs } from "@/components/products/ProductStatusTabs"
import { ProductSearchInput } from "@/components/products/ProductSearchInput"
import { ProductFilters } from "@/components/products/ProductFilters"
import { PRODUCT_HIERARCHY_ORDER_BY } from "@/lib/product-order"
import { getPageSizePref } from "@/app/actions/user-preferences"

const PAGE_SIZES = [20, 50, 100] as const
const DEFAULT_PAGE_SIZE = 20

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    page?: string
    size?: string
    status?: string
    brands?: string
    categories?: string
    subcategories?: string
    directions?: string
  }>
}) {
  await requireSection("PRODUCTS")
  const {
    q,
    page: pageParam,
    size: sizeParam,
    status,
    brands: brandsParam,
    categories: categoriesParam,
    subcategories: subcategoriesParam,
    directions: directionsParam,
  } = await searchParams

  // Parse filter arrays from comma-separated URL params
  const selectedBrandIds = brandsParam ? brandsParam.split(",").filter(Boolean) : []
  const selectedCategoryIds = categoriesParam
    ? categoriesParam.split(",").filter(Boolean)
    : []
  const selectedSubcategoryIds = subcategoriesParam
    ? subcategoriesParam.split(",").filter(Boolean)
    : []
  const selectedDirectionIds = directionsParam
    ? directionsParam.split(",").filter(Boolean)
    : []

  // Build where clause
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}

  if (status === "DELETED") {
    where.deletedAt = { not: null }
  } else if (status === "ALL") {
    // show all non-deleted
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

  // Text search — Phase 18: ищем по name (составное) + article (бывший name) + sku
  if (q && q.trim()) {
    const term = q.trim()
    where.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { article: { contains: term, mode: "insensitive" } },
      { sku: { contains: term, mode: "insensitive" } },
    ]
  }

  // Brand filter
  if (selectedBrandIds.length > 0) {
    where.brandId = { in: selectedBrandIds }
  }

  // Direction filter — через brand.directionId (Product.direction нет, направление живёт на бренде)
  if (selectedDirectionIds.length > 0) {
    where.brand = { directionId: { in: selectedDirectionIds } }
  }

  // Category filter
  if (selectedCategoryIds.length > 0) {
    where.categoryId = { in: selectedCategoryIds }
  }

  // Subcategory filter
  if (selectedSubcategoryIds.length > 0) {
    where.subcategoryId = { in: selectedSubcategoryIds }
  }

  // pageSize: URL ?size приоритетнее, иначе берём persisted user pref, иначе default
  const urlSize = sizeParam ? Number(sizeParam) : null
  const pageSize = urlSize && (PAGE_SIZES as readonly number[]).includes(urlSize)
    ? urlSize
    : (await getPageSizePref("products")) ?? DEFAULT_PAGE_SIZE
  const currentPage = Math.max(1, parseInt(pageParam ?? "1", 10))
  const skip = (currentPage - 1) * pageSize

  // Fetch products + all brands/categories/subcategories/directions for filter dropdowns
  const [products, total, allBrands, allCategories, allSubcategories, allDirections] =
    await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          brand: { include: { direction: true } },
          category: true,
          subcategory: true,
        },
        // Иерархическая сортировка: Направление → Бренд → Категория → Подкатегория → name
        // (sortOrder задаётся drag-and-drop в /admin/settings)
        orderBy: PRODUCT_HIERARCHY_ORDER_BY,
        skip,
        take: pageSize,
      }),
      prisma.product.count({ where }),
      // Cascade-фильтрация: каждая dependent сущность включает FK на родителя
      prisma.brand.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, directionId: true },
      }),
      prisma.category.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, brandId: true },
      }),
      prisma.subcategory.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, categoryId: true },
      }),
      prisma.productDirection.findMany({
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      }),
    ])

  const totalPages = Math.ceil(total / pageSize)
  const currentStatus = status ?? "IN_STOCK"

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Link
          href="/products/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
        >
          + Добавить товар
        </Link>
      </div>
      <ProductStatusTabs currentStatus={currentStatus} />
      <div className="flex items-center gap-4 flex-wrap">
        <ProductSearchInput defaultValue={q ?? ""} />
        <ProductFilters
          directions={allDirections}
          brands={allBrands}
          categories={allCategories}
          subcategories={allSubcategories}
          selectedDirectionIds={selectedDirectionIds}
          selectedBrandIds={selectedBrandIds}
          selectedCategoryIds={selectedCategoryIds}
          selectedSubcategoryIds={selectedSubcategoryIds}
        />
      </div>
      <ProductsTable
        products={products}
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={total}
        pageSize={pageSize}
        currentStatus={currentStatus}
        searchQuery={q ?? ""}
      />
    </div>
  )
}
