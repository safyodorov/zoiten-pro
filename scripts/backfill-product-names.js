// scripts/backfill-product-names.js (one-shot)
// Phase 18: пересчёт Product.name по новой формуле generateProductName
// для всех существующих товаров (которые после migration имеют name = article).
//
// Идемпотентен — пропускает товары с nameOverridden=true (юзер уже подкорректировал).
//
// Запуск на VPS:
//   set -a; source /etc/zoiten.pro.env; set +a; node scripts/backfill-product-names.js

const { PrismaClient } = require("@prisma/client")

// Локальная копия generateProductName (lib/product-name.ts использует TS module,
// этот скрипт — plain Node без TS-loader). Логика идентична.
function generateProductName(input) {
  const hasSizes = input.brand && input.brand.direction && input.brand.direction.hasSizes === true
  const parts = hasSizes
    ? [
        input.category && input.category.name,
        input.subcategory && input.subcategory.name,
        ...(input.properties || [])
          .filter((p) => p.includeInName)
          .map((p) => p.value),
        input.article,
      ]
    : [
        (input.subcategory && input.subcategory.name) ||
          (input.category && input.category.name),
        input.article,
      ]
  return parts
    .map((p) => (p == null ? "" : String(p)).trim())
    .filter((s) => s.length > 0)
    .join(" ")
}

async function main() {
  const prisma = new PrismaClient()
  try {
    const products = await prisma.product.findMany({
      where: { nameOverridden: false },
      include: {
        brand: { include: { direction: { select: { hasSizes: true } } } },
        category: { select: { name: true } },
        subcategory: { select: { name: true } },
        propertyValues: {
          include: { property: { select: { includeInName: true, sortOrder: true } } },
        },
      },
    })

    console.log(`[1/2] Products to consider: ${products.length}`)

    let updated = 0
    let unchanged = 0
    for (const p of products) {
      const props = [...p.propertyValues].sort(
        (a, b) => a.property.sortOrder - b.property.sortOrder
      )
      const newName = generateProductName({
        article: p.article,
        category: p.category,
        subcategory: p.subcategory,
        brand: p.brand,
        properties: props.map((pv) => ({
          value: pv.value,
          includeInName: pv.property.includeInName,
        })),
      })
      // Fallback: если всё пусто (нет category/subcategory) — оставляем article
      const finalName = newName || p.article
      if (finalName === p.name) {
        unchanged++
        continue
      }
      await prisma.product.update({
        where: { id: p.id },
        data: { name: finalName },
      })
      console.log(`     ${p.sku}: "${p.name}" → "${finalName}"`)
      updated++
    }

    console.log(`[2/2] Updated: ${updated}, unchanged: ${unchanged}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
