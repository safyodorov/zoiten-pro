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
        barcodes: true,
        articles: { include: { marketplace: true } },
      },
    }),
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
  if (!product) notFound()
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Редактировать товар</h1>
      <ProductForm brands={brands} marketplaces={marketplaces} product={product} />
    </div>
  )
}
