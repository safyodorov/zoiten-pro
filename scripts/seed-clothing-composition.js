// scripts/seed-clothing-composition.js (one-shot)
// 2026-05-11: добавляет CategoryProperty "Состав" (STRING, wbAttrName="Состав")
// во все категории Direction "Одежда". Идемпотентно — повторный запуск
// пропускает категории где свойство уже есть.
//
// После запуска нужно прогнать backfill-clothing-properties.js — он подхватит
// "Состав" вместе с Пол/Цвет и заполнит ProductPropertyValue из WbCard.characteristics.
//
// Запуск на VPS:
//   set -a; source /etc/zoiten.pro.env; set +a; node scripts/seed-clothing-composition.js

const { PrismaClient } = require("@prisma/client")

async function main() {
  const prisma = new PrismaClient()
  try {
    const dir = await prisma.productDirection.findUnique({
      where: { name: "Одежда" },
    })
    if (!dir) {
      console.error("Direction 'Одежда' не найден")
      process.exit(1)
    }

    const cats = await prisma.category.findMany({
      where: { brand: { directionId: dir.id } },
      include: { properties: { where: { name: "Состав" } } },
      orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
    })

    console.log(`[1/2] Категорий одежды: ${cats.length}`)

    let created = 0
    let skipped = 0
    for (const cat of cats) {
      if (cat.properties.length > 0) {
        console.log(`     skip: ${cat.name} (уже есть)`)
        skipped++
        continue
      }
      const max = await prisma.categoryProperty.aggregate({
        where: { categoryId: cat.id },
        _max: { sortOrder: true },
      })
      await prisma.categoryProperty.create({
        data: {
          categoryId: cat.id,
          name: "Состав",
          kind: "STRING",
          options: [],
          wbAttrName: "Состав",
          sortOrder: (max._max.sortOrder ?? -1) + 1,
        },
      })
      console.log(`     create: ${cat.name}`)
      created++
    }

    console.log(`[2/2] Created: ${created}, skipped: ${skipped}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
