import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { ProductForm } from "@/components/products/ProductForm"

export default async function NewProductPage() {
  await requireSection("PRODUCTS")
  const [brands, marketplaces] = await Promise.all([
    prisma.brand.findMany({
      include: {
        direction: { select: { id: true, name: true, hasSizes: true } },
        categories: {
          orderBy: { sortOrder: "asc" },
          include: {
            subcategories: { orderBy: { sortOrder: "asc" } },
            properties: { orderBy: { sortOrder: "asc" } }, // Phase 17
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.marketplace.findMany({ orderBy: { sortOrder: "asc" } }),
  ])

  const stringPropIds = brands.flatMap((b) =>
    b.categories.flatMap((c) =>
      c.properties.filter((p) => p.kind === "STRING").map((p) => p.id)
    )
  )
  const propertyValueRows =
    stringPropIds.length > 0
      ? await prisma.productPropertyValue.findMany({
          where: { propertyId: { in: stringPropIds }, value: { not: "" } },
          select: { propertyId: true, value: true },
          distinct: ["propertyId", "value"],
          orderBy: { value: "asc" },
        })
      : []
  const propertyValueSuggestions: Record<string, string[]> = {}
  for (const { propertyId, value } of propertyValueRows) {
    if (!propertyValueSuggestions[propertyId]) {
      propertyValueSuggestions[propertyId] = []
    }
    propertyValueSuggestions[propertyId].push(value)
  }

  return (
    <div className="space-y-4">
      <ProductForm
        brands={brands}
        marketplaces={marketplaces}
        propertyValueSuggestions={propertyValueSuggestions}
      />
    </div>
  )
}
