// app/(dashboard)/procurement/suppliers/page.tsx
// RSC список поставщиков (D-01, D-12, D-13, D-18).
// Sticky raw-HTML таблица + каскадные фильтры Закупщик/Бренд/Категория/Подкатегория.
import { requireSection, getSectionRole } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { SupplierFilters } from "@/components/procurement/SupplierFilters"
import { SuppliersTable, type SupplierRow } from "@/components/procurement/SuppliersTable"
import type { Prisma } from "@prisma/client"

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{
    buyers?: string
    brands?: string
    categories?: string
    subcategories?: string
  }>
}) {
  await requireSection("PROCUREMENT")
  const role = await getSectionRole("PROCUREMENT")
  const canManage = role === "MANAGE"

  const sp = await searchParams
  const selectedBuyerIds = sp.buyers ? sp.buyers.split(",").filter(Boolean) : []
  const selectedBrandIds = sp.brands ? sp.brands.split(",").filter(Boolean) : []
  const selectedCategoryIds = sp.categories ? sp.categories.split(",").filter(Boolean) : []
  const selectedSubcategoryIds = sp.subcategories
    ? sp.subcategories.split(",").filter(Boolean)
    : []

  // ── where (D-13) ──
  const where: Prisma.SupplierWhereInput = { deletedAt: null }

  if (selectedBuyerIds.length > 0) {
    where.buyerEmployeeId = { in: selectedBuyerIds }
  }

  // Бренд/Категория/Подкатегория — через связку SupplierProductLink → Product.
  const productFilter: Prisma.ProductWhereInput = {}
  if (selectedBrandIds.length > 0) productFilter.brandId = { in: selectedBrandIds }
  if (selectedCategoryIds.length > 0) productFilter.categoryId = { in: selectedCategoryIds }
  if (selectedSubcategoryIds.length > 0)
    productFilter.subcategoryId = { in: selectedSubcategoryIds }
  if (Object.keys(productFilter).length > 0) {
    where.productLinks = { some: { product: productFilter } }
  }

  const [suppliers, frequentBuyers, employees, brands, categories, subcategories] =
    await Promise.all([
      prisma.supplier.findMany({
        where,
        include: {
          buyer: { select: { id: true, lastName: true, firstName: true } },
          contacts: {
            where: { isPrimary: true },
            select: { name: true, type: true },
            orderBy: { type: "asc" },
          },
          _count: { select: { productLinks: true } },
        },
      }),
      // D-01: distinct закупщики, уже выбиравшиеся хотя бы у одного поставщика.
      prisma.supplier.findMany({
        where: { deletedAt: null, buyerEmployeeId: { not: null } },
        select: { buyerEmployeeId: true },
        distinct: ["buyerEmployeeId"],
      }),
      prisma.employee.findMany({
        where: { fireDate: null },
        select: { id: true, lastName: true, firstName: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      }),
      prisma.brand.findMany({ select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
      prisma.category.findMany({
        select: { id: true, name: true, brandId: true },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.subcategory.findMany({
        select: { id: true, name: true, categoryId: true },
        orderBy: { sortOrder: "asc" },
      }),
    ])

  const frequentBuyerIds = frequentBuyers
    .map((s) => s.buyerEmployeeId)
    .filter((id): id is string => Boolean(id))

  const buyers = employees.map((e) => ({
    id: e.id,
    name: `${e.lastName} ${e.firstName}`.trim(),
  }))

  // Сортировка: Закупщик ASC (Discretion). Поставщики без закупщика — в конец.
  const rows: SupplierRow[] = suppliers
    .map((s) => {
      const buyerName = s.buyer
        ? `${s.buyer.lastName} ${s.buyer.firstName}`.trim()
        : null
      return {
        id: s.id,
        nameForeign: s.nameForeign,
        nameEnglish: s.nameEnglish,
        buyerName,
        productCount: s._count.productLinks,
        primaryContact: s.contacts[0]?.name ?? null,
        createdAt: s.createdAt.toISOString(),
      }
    })
    .sort((a, b) => {
      const an = a.buyerName ?? "￿"
      const bn = b.buyerName ?? "￿"
      const cmp = an.localeCompare(bn, "ru")
      if (cmp !== 0) return cmp
      return a.nameEnglish.localeCompare(b.nameEnglish, "ru")
    })

  return (
    <div className="h-full flex flex-col gap-3 p-4">
      <SupplierFilters
        buyers={buyers}
        brands={brands}
        categories={categories}
        subcategories={subcategories}
        selectedBuyerIds={selectedBuyerIds}
        selectedBrandIds={selectedBrandIds}
        selectedCategoryIds={selectedCategoryIds}
        selectedSubcategoryIds={selectedSubcategoryIds}
      />
      <div className="flex-1 min-h-0">
        <SuppliersTable
          rows={rows}
          buyers={buyers}
          frequentBuyerIds={frequentBuyerIds}
          canManage={canManage}
        />
      </div>
    </div>
  )
}
