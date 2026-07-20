// scripts/seed-bpla-warehouses.ts
//
// quick 260720-oh2: идемпотентный сид виртуальных складов «Электросталь БПЛА» (id=99001) /
// «Котовск БПЛА» (id=99002) — фиксирует сгоревшие 17.07.2026 остатки (единственный
// сохранившийся источник — прод-строки удалены clean-replace'ом синка 20.07 13:43) из
// burned-stock-2026-07-17.json (.planning/quick/260720-oh2-bpla-virtual-warehouses/).
//
// Идемпотентность:
//   - Склады: upsert по id (isVirtual=true, isActive=true, needsClusterReview=false,
//     cluster="БПЛА (сгоревшие склады)", shortCluster="БПЛА").
//   - Остатки: upsert по (wbCardId, warehouseId, techSize="") — update REPLACE quantity
//     (не суммировать), повторный запуск не создаёт дублей и не удваивает qty.
//   - nmId без WbCard в БД → console.warn + skip (НЕ throw) — задача терпима к пропавшим
//     карточкам (soft/hard delete, ещё не синканы и т.п.).
//
// Запуск (ВРУЧНУЮ, deploy.sh НЕ вызывает этот скрипт):
//   npx tsx scripts/seed-bpla-warehouses.ts
//   На VPS: set -a; . /etc/zoiten.pro.env; set +a; npx tsx scripts/seed-bpla-warehouses.ts
//
// Требует DATABASE_URL + применённую миграцию 20260720_bpla_virtual_warehouses
// (WbWarehouse.isVirtual + enum FinanceStockLocation.WB_BURNED).

import { PrismaClient } from "@prisma/client"
import { readFileSync } from "fs"
import { join } from "path"
import { BPLA_WAREHOUSES } from "../lib/wb-virtual-warehouse"

const prisma = new PrismaClient()

interface BurnedStockItem {
  nmId: number
  qty: number
  costRub: number | null
}

interface BurnedStockFile {
  elektrostal: { warehouseName: string; totalQty: number; items: BurnedStockItem[] }
  kotovsk: { warehouseName: string; totalQty: number; items: BurnedStockItem[] }
}

const DATA_PATH = join(
  __dirname,
  "..",
  ".planning",
  "quick",
  "260720-oh2-bpla-virtual-warehouses",
  "burned-stock-2026-07-17.json",
)

async function main() {
  console.log(`Читаем сгоревшие остатки: ${DATA_PATH}`)
  const raw = readFileSync(DATA_PATH, "utf-8")
  const data: BurnedStockFile = JSON.parse(raw)

  // 1. Upsert двух виртуальных складов
  let warehousesUpserted = 0
  for (const wh of BPLA_WAREHOUSES) {
    await prisma.wbWarehouse.upsert({
      where: { id: wh.id },
      create: {
        id: wh.id,
        name: wh.name,
        cluster: "БПЛА (сгоревшие склады)",
        shortCluster: "БПЛА",
        isActive: true,
        needsClusterReview: false,
        isVirtual: true,
      },
      update: {
        name: wh.name,
        cluster: "БПЛА (сгоревшие склады)",
        shortCluster: "БПЛА",
        isVirtual: true,
      },
    })
    warehousesUpserted++
  }

  // 2. Upsert остатков per nmId на соответствующий виртуальный склад
  const groups: Array<{ warehouseId: number; items: BurnedStockItem[] }> = [
    { warehouseId: BPLA_WAREHOUSES[0].id, items: data.elektrostal.items }, // 99001 Электросталь
    { warehouseId: BPLA_WAREHOUSES[1].id, items: data.kotovsk.items }, // 99002 Котовск
  ]

  let rowsUpserted = 0
  let skippedNoCard = 0
  const skippedNmIds: number[] = []

  for (const group of groups) {
    for (const item of group.items) {
      const card = await prisma.wbCard.findUnique({
        where: { nmId: item.nmId },
        select: { id: true },
      })
      if (!card) {
        console.warn(`[seed-bpla-warehouses] nmId=${item.nmId} — WbCard не найдена, пропуск`)
        skippedNoCard++
        skippedNmIds.push(item.nmId)
        continue
      }

      await prisma.wbCardWarehouseStock.upsert({
        where: {
          wbCardId_warehouseId_techSize: {
            wbCardId: card.id,
            warehouseId: group.warehouseId,
            techSize: "",
          },
        },
        create: {
          wbCardId: card.id,
          warehouseId: group.warehouseId,
          techSize: "",
          quantity: item.qty,
        },
        update: {
          quantity: item.qty, // REPLACE — не суммировать
        },
      })
      rowsUpserted++
    }
  }

  console.log(
    JSON.stringify(
      {
        warehousesUpserted,
        rowsUpserted,
        skippedNoCard,
        skippedNmIds,
      },
      null,
      2,
    ),
  )
}

main()
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
