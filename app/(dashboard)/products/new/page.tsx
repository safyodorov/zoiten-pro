import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { ProductForm } from "@/components/products/ProductForm"

export default async function NewProductPage() {
  await requireSection("PRODUCTS")
  const [brands, marketplaces] = await Promise.all([
    prisma.brand.findMany({
      include: {
        categories: {
          orderBy: { sortOrder: "asc" },
          include: { subcategories: { orderBy: { sortOrder: "asc" } } },
        },
      },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.marketplace.findMany({ orderBy: { sortOrder: "asc" } }),
  ])
  return (
    <div className="space-y-4">
      <ProductForm brands={brands} marketplaces={marketplaces} />
    </div>
  )
}
