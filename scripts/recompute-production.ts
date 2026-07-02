// scripts/recompute-production.ts
// Quick 260702-j52: одноразовый (idempotent) пересчёт ProductIncoming.orderedQty
// из фактических открытых закупок (PLANNED+ACTIVE) через lib/production-sync.ts.
//
// Причина: «Производство» в /stock и /purchase-plan становится machine-managed —
// ручные значения orderedQty заменяются денормализованной суммой
// Σ max(0, PurchaseItem.quantity − WAREHOUSE.qty). Товары без открытых закупок → 0.
// expectedDate и plannedSalesPerDay НЕ трогаются.
//
// Запуск:
//   npx tsx scripts/recompute-production.ts
//
// Требует DATABASE_URL в .env или env переменной.
// На VPS: DATABASE_URL уже в /etc/zoiten.pro.env через systemd EnvironmentFile.
//   Запуск: cd /opt/zoiten-pro && DATABASE_URL=$(grep DATABASE_URL /etc/zoiten.pro.env | cut -d= -f2-) npx tsx scripts/recompute-production.ts

import { PrismaClient } from "@prisma/client"
import { recomputeAllProduction } from "../lib/production-sync"

const prisma = new PrismaClient()

async function main() {
  console.log("Пересчёт ProductIncoming.orderedQty из открытых закупок (PLANNED+ACTIVE)...")

  const before = await prisma.productIncoming.findMany({
    select: { productId: true, orderedQty: true },
  })
  console.log(`До пересчёта: ${before.length} записей ProductIncoming.`)

  await recomputeAllProduction(prisma)

  const after = await prisma.productIncoming.findMany({
    select: { productId: true, orderedQty: true },
  })
  console.log(`После пересчёта: ${after.length} записей ProductIncoming.`)

  const beforeMap = new Map(before.map((r) => [r.productId, r.orderedQty]))
  let changed = 0
  for (const row of after) {
    const prev = beforeMap.get(row.productId)
    if (prev !== row.orderedQty) changed++
  }
  console.log(`Изменено значений orderedQty: ${changed}.`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
