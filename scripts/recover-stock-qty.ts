// scripts/recover-stock-qty.ts
// Восстановление WbCard.stockQty из per-warehouse таблицы WbCardWarehouseStock.
//
// Причина: коммит c5d2d88 + баг «!ok → empty Map → NULL в БД» перетёр stockQty
// для всех 273 карточек при 429 от Statistics API (2026-05-12).
//
// Стратегия: SUM(WbCardWarehouseStock.quantity) GROUP BY wbCardId — то же, что
// делает route.ts:296 totalStock при успешном fetchStocksPerWarehouse.
//
// WbCardWarehouseStock уцелел (2320 строк): per-warehouse блок в route.ts
// охранялся `if (stocksPerWarehouse.size > 0)` и корректно скипнулся при пустом Map.
//
// Запуск:
//   npx tsx scripts/recover-stock-qty.ts
//
// Требует DATABASE_URL в .env или env переменной.
// На VPS: DATABASE_URL уже в /etc/zoiten.pro.env через systemd EnvironmentFile.
//   Запуск: cd /opt/zoiten-pro && DATABASE_URL=$(grep DATABASE_URL /etc/zoiten.pro.env | cut -d= -f2-) npx tsx scripts/recover-stock-qty.ts

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("Восстановление WbCard.stockQty из WbCardWarehouseStock...")

  // Агрегируем stockQty = SUM(quantity) для каждого wbCardId
  const aggregates = await prisma.wbCardWarehouseStock.groupBy({
    by: ["wbCardId"],
    _sum: { quantity: true },
  })

  console.log(`Найдено ${aggregates.length} карточек с per-warehouse остатками.`)

  if (aggregates.length === 0) {
    console.warn("WbCardWarehouseStock пуст — нет данных для восстановления.")
    process.exit(0)
  }

  // Одной транзакцией обновляем все WbCard.stockQty
  let updated = 0
  let skipped = 0

  await prisma.$transaction(async (tx) => {
    for (const agg of aggregates) {
      const totalQty = agg._sum.quantity ?? 0

      const result = await tx.wbCard.updateMany({
        where: { id: agg.wbCardId },
        data: { stockQty: totalQty },
      })

      if (result.count > 0) {
        updated++
      } else {
        skipped++
      }
    }
  })

  console.log(`Обновлено: ${updated} карточек. Пропущено (не найдено): ${skipped}.`)

  // Проверка — выводим несколько строк до/после
  const sample = await prisma.wbCard.findMany({
    take: 5,
    orderBy: { updatedAt: "desc" },
    select: { nmId: true, article: true, stockQty: true },
  })

  console.log("Первые 5 обновлённых карточек:")
  for (const card of sample) {
    console.log(`  nmId=${card.nmId} article=${card.article} stockQty=${card.stockQty}`)
  }

  // Проверяем что не осталось NULL
  const nullCount = await prisma.wbCard.count({ where: { stockQty: null } })
  const totalCards = await prisma.wbCard.count()
  console.log(`\nРезультат: ${nullCount} карточек с stockQty=NULL из ${totalCards} всего.`)

  if (nullCount > 0) {
    console.warn(
      `ВНИМАНИЕ: ${nullCount} карточек не получили stockQty (нет строк в WbCardWarehouseStock). ` +
        `Это карточки с нулевыми остатками на всех складах — значение NULL или 0 одинаково корректно.`
    )
  } else {
    console.log("stockQty восстановлен для всех карточек.")
  }
}

main()
  .catch((e) => {
    console.error("Ошибка восстановления:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
