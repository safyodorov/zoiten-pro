import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { ProductForm } from "@/components/products/ProductForm"

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireSection("PRODUCTS")
  const { id } = await params
  const [product, brands, marketplaces] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        // 260421-iq7: articles упорядочены по sortOrder, barcodes nested внутри
        // каждого article (больше нет Product.barcodes back-relation).
        articles: {
          orderBy: { sortOrder: "asc" },
          include: {
            marketplace: true,
            barcodes: {
              orderBy: { createdAt: "asc" },
              // Phase 17 ext: productSize нужен для UI select «Размер»
              include: { productSize: { select: { id: true, value: true } } },
            },
          },
        },
        // Phase 17: values свойств + размерная сетка
        propertyValues: true,
        sizes: { orderBy: { sortOrder: "asc" } },
      },
    }),
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
  if (!product) notFound()
  // React key завязан на updatedAt — после router.refresh() (например, после
  // WB-импорта) форма пересоздаётся с новыми defaultValues. Без этого
  // useForm не переинициализирует значения при изменении props.
  const formKey = `${product.id}-${product.updatedAt.getTime()}`

  // 2026-05-11: suggestions для STRING-свойств — distinct значения из всех
  // ProductPropertyValue, чтобы в форме был combobox с выбором из ранее
  // введённых вариантов (например «слим», «классика» для свойства «Покрой»).
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
        key={formKey}
        brands={brands}
        marketplaces={marketplaces}
        product={product}
        propertyValueSuggestions={propertyValueSuggestions}
      />
    </div>
  )
}
