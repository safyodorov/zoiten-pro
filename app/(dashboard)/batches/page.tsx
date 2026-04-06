// app/(dashboard)/batches/page.tsx
// Себестоимость партий — таблица товаров с inline-редактированием себестоимости

import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { CostTable } from "@/components/cost/CostTable"
import { CostFilters } from "@/components/cost/CostFilters"
import { CostSearchInput } from "@/components/cost/CostSearchInput"

const PAGE_SIZE = 20

export default async function BatchesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    page?: string
    brands?: string
    categories?: string
    subcategories?: string
  }>
}) {
  await requireSection("COST")
  const { q, page: pageParam, brands: brandsParam, categories: categoriesParam, subcategories: subcategoriesParam } =
    await searchParams

  // Parse filters
  const selectedBrandIds = brandsParam ? brandsParam.split(",").filter(Boolean) : []
  const selectedCategoryIds = categoriesParam ? categoriesParam.split(",").filter(Boolean) : []
  const selectedSubcategoryIds = subcategoriesParam ? subcategoriesParam.split(",").filter(Boolean) : []

  // Build where — only active products
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { deletedAt: null }

  if (q?.trim()) {
    where.name = { contains: q.trim(), mode: "insensitive" }
  }
  if (selectedBrandIds.length > 0) {
    where.brandId = { in: selectedBrandIds }
  }
  if (selectedCategoryIds.length > 0) {
    where.categoryId = { in: selectedCategoryIds }
  }
  if (selectedSubcategoryIds.length > 0) {
    where.subcategoryId = { in: selectedSubcategoryIds }
  }

  const currentPage = Math.max(1, parseInt(pageParam ?? "1", 10))
  const skip = (currentPage - 1) * PAGE_SIZE

  const [products, total, allBrands, allCategories, allSubcategories] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { brand: true, category: true, subcategory: true, cost: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
    }),
    prisma.product.count({ where }),
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.subcategory.findMany({ orderBy: { name: "asc" } }),
  ])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Себестоимость партий</h1>
      <div className="flex items-center gap-4 flex-wrap">
        <CostSearchInput defaultValue={q ?? ""} />
        <CostFilters
          brands={allBrands.map((b) => ({ id: b.id, name: b.name }))}
          categories={allCategories.map((c) => ({ id: c.id, name: c.name }))}
          subcategories={allSubcategories.map((s) => ({ id: s.id, name: s.name }))}
          selectedBrandIds={selectedBrandIds}
          selectedCategoryIds={selectedCategoryIds}
          selectedSubcategoryIds={selectedSubcategoryIds}
        />
      </div>
      <CostTable
        products={products.map((p) => ({
          ...p,
          cost: p.cost ? { costPrice: p.cost.costPrice, updatedAt: p.cost.updatedAt.toISOString() } : null,
        }))}
        currentPage={currentPage}
        totalPages={totalPages}
      />
    </div>
  )
}
