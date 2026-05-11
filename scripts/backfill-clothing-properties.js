// scripts/backfill-clothing-properties.js (one-shot)
// Phase 17: проходит по всем товарам и для каждого CategoryProperty с wbAttrName
// достаёт значение из WbCard.characteristics (основной MA сортОрдер=0) и
// upsert'ит ProductPropertyValue. Идемпотентно — повторный запуск не дублирует.
//
// Запуск на VPS:
//   set -a; source /etc/zoiten.pro.env; set +a; node scripts/backfill-clothing-properties.js

const { PrismaClient } = require("@prisma/client")

function normalizeWbValue(raw) {
  if (raw == null) return ""
  if (Array.isArray(raw)) return raw.map((v) => String(v)).filter(Boolean).join(", ")
  return String(raw)
}

async function main() {
  const prisma = new PrismaClient()
  try {
    const wbMp = await prisma.marketplace.findUnique({ where: { slug: "wb" }, select: { id: true } })
    if (!wbMp) {
      console.error("Marketplace 'wb' not found")
      process.exit(1)
    }

    // Все товары с категорией, у которой есть свойства с wbAttrName
    const products = await prisma.product.findMany({
      where: {
        category: {
          properties: { some: { wbAttrName: { not: null } } },
        },
      },
      select: {
        id: true,
        sku: true,
        category: {
          select: {
            properties: {
              where: { wbAttrName: { not: null } },
              select: { id: true, name: true, wbAttrName: true },
            },
          },
        },
      },
    })

    console.log(`[1/3] Products with categories having wbAttr-properties: ${products.length}`)

    let setCount = 0
    let skippedNoWbCard = 0
    let skippedNoMatch = 0
    let skippedAlreadyHas = 0

    for (const p of products) {
      const props = p.category?.properties ?? []
      if (props.length === 0) continue

      // Основной WB-артикул
      const article = await prisma.marketplaceArticle.findFirst({
        where: { productId: p.id, marketplaceId: wbMp.id },
        orderBy: { sortOrder: "asc" },
      })
      if (!article) {
        skippedNoWbCard++
        continue
      }
      const nmId = parseInt(article.article, 10)
      if (Number.isNaN(nmId)) {
        skippedNoWbCard++
        continue
      }

      const wbCard = await prisma.wbCard.findUnique({
        where: { nmId },
        select: { characteristics: true },
      })
      if (!wbCard || !wbCard.characteristics) {
        skippedNoWbCard++
        continue
      }

      const chars = wbCard.characteristics
      const charByName = new Map()
      if (Array.isArray(chars)) {
        for (const c of chars) {
          if (c && typeof c === "object" && "name" in c) {
            charByName.set(c.name, c.value)
          }
        }
      }

      for (const prop of props) {
        if (!prop.wbAttrName) continue
        const rawVal = charByName.get(prop.wbAttrName)
        if (rawVal == null) {
          skippedNoMatch++
          continue
        }
        const value = normalizeWbValue(rawVal)
        if (!value) {
          skippedNoMatch++
          continue
        }

        // Если значение уже есть — не трогаем (только заполняем пустые)
        const existing = await prisma.productPropertyValue.findUnique({
          where: { productId_propertyId: { productId: p.id, propertyId: prop.id } },
          select: { id: true },
        })
        if (existing) {
          skippedAlreadyHas++
          continue
        }

        await prisma.productPropertyValue.create({
          data: { productId: p.id, propertyId: prop.id, value },
        })
        setCount++
        console.log(`     ${p.sku}: ${prop.name} = "${value}"`)
      }
    }

    console.log(`[2/3] Set: ${setCount}, skipped (no WbCard): ${skippedNoWbCard}, skipped (no WB match): ${skippedNoMatch}, skipped (already has): ${skippedAlreadyHas}`)
    console.log(`[3/3] Done`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
