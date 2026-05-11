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
  return (
    <div className="space-y-4">
      <ProductForm brands={brands} marketplaces={marketplaces} product={product} />
    </div>
  )
}
