// app/(dashboard)/purchase-plan/page.tsx
// План закупок — MVP. Per-product inline-редактирование «Заказано в Китае»
// и плановой даты прихода на склад.

import { prisma } from "@/lib/prisma"
import { getSectionRole, requireSection } from "@/lib/rbac"
import { PRODUCT_HIERARCHY_ORDER_BY } from "@/lib/product-order"
import { ProcurementFilters } from "@/components/procurement/ProcurementFilters"
import { ProcurementSearchInput } from "@/components/procurement/ProcurementSearchInput"
import { ProcurementTable } from "@/components/procurement/ProcurementTable"

export default async function PurchasePlanPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    brands?: string
    categories?: string
    subcategories?: string
    directions?: string
  }>
}) {
  await requireSection("PROCUREMENT")
  const role = await getSectionRole("PROCUREMENT")
  const canManage = role === "MANAGE"

  const {
    q,
    brands: brandsParam,
    categories: categoriesParam,
    subcategories: subcategoriesParam,
    directions: directionsParam,
  } = await searchParams

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { deletedAt: null }

  if (q && q.trim()) {
    const term = q.trim()
    where.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { article: { contains: term, mode: "insensitive" } },
      { sku: { contains: term, mode: "insensitive" } },
    ]
  }
  if (selectedBrandIds.length > 0) where.brandId = { in: selectedBrandIds }
  if (selectedDirectionIds.length > 0) {
    where.brand = { directionId: { in: selectedDirectionIds } }
  }
  if (selectedCategoryIds.length > 0) where.categoryId = { in: selectedCategoryIds }
  if (selectedSubcategoryIds.length > 0) {
    where.subcategoryId = { in: selectedSubcategoryIds }
  }

  const [products, allBrands, allCategories, allSubcategories, allDirections] =
    await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          brand: { include: { direction: true } },
          category: true,
          subcategory: true,
          incoming: true,
        },
        orderBy: PRODUCT_HIERARCHY_ORDER_BY,
      }),
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

  const rows = products.map((p) => ({
    id: p.id,
    name: p.name,
    photoUrl: p.photoUrl,
    brandName: p.brand.name,
    categoryName: p.category?.name ?? null,
    subcategoryName: p.subcategory?.name ?? null,
    orderedQty: p.incoming?.orderedQty ?? 0,
    expectedDate: p.incoming?.expectedDate
      ? p.incoming.expectedDate.toISOString().slice(0, 10)
      : null,
    plannedSalesPerDay: p.incoming?.plannedSalesPerDay ?? null,
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <ProcurementSearchInput defaultValue={q ?? ""} />
        <ProcurementFilters
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
      <ProcurementTable rows={rows} canManage={canManage} />
    </div>
  )
}
