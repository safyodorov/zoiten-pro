// scripts/seed-bpla-warehouses.ts
//
// quick 260720-oh2 (волна 1) + quick 260723-hr5-2-gate (волна 2, gate-механизм):
// идемпотентный сид виртуальных складов БПЛА.
//
// ВОЛНА 1 — «Электросталь БПЛА» (id=99001) / «Котовск БПЛА» (id=99002) — фиксирует
// сгоревшие 17.07.2026 остатки (единственный сохранившийся источник — прод-строки удалены
// clean-replace'ом синка 20.07 13:43) из burned-stock-2026-07-17.json
// (.planning/quick/260720-oh2-bpla-virtual-warehouses/). Идемпотентна (upsert REPLACE),
// итерирует ТОЛЬКО BPLA_WAREHOUSES.filter(w => w.wave === 1), чтобы не создавать
// склады волны 2 этим блоком.
//
// ВОЛНА 2 — «Невинномысск БПЛА» (id=99003) / «Краснодар БПЛА» (id=99004) — GATE-механизм.
// В отличие от волны 1 (реальные склады были обнулены к моменту фиксации остатков),
// на 23.07.2026 реальные склады-прообразы (Невинномысск id=90024, Краснодар id=304)
// ЕЩЁ НЕ обнулены WB. Сеять виртуальный склад можно ТОЛЬКО после того как WB обнулит
// реальный склад (иначе двойной счёт в /finance/balance + преждевременный вычет из
// inWayFromClient). Решение — pure-функция decideBplaSeedAction (lib/wb-virtual-warehouse.ts):
//   - виртуальный склад уже засеян (есть строки)           → "already-seeded" (skip, не пересеиваем)
//   - виртуальный не засеян, реальный склад ещё не обнулён → "gate-blocked" (лог, skip)
//   - виртуальный не засеян, реальный склад обнулён (0)    → "seed"
// Это делает скрипт безопасным для ЕЖЕДНЕВНОГО крон-запуска — он сам «дожидается»
// обнуления реального склада и засевает данные ровно один раз, дальше no-op даже если
// WB снова временно повезёт товар на тот же реальный склад.
//
// Идемпотентность (обе волны):
//   - Склады: upsert по id (isVirtual=true, isActive=true, needsClusterReview=false,
//     cluster="БПЛА (сгоревшие склады)", shortCluster="БПЛА").
//   - Остатки: upsert по (wbCardId, warehouseId, techSize) — update REPLACE quantity
//     (не суммировать), повторный запуск не создаёт дублей и не удваивает qty.
//   - nmId без WbCard в БД → console.warn + skip (НЕ throw) — задача терпима к пропавшим
//     карточкам (soft/hard delete, ещё не синканы и т.п.).
//
// Запуск (ВРУЧНУЮ; крон см. SUMMARY 260723-hr5-2-gate — оркестратор НЕ ставит crontab):
//   npx tsx scripts/seed-bpla-warehouses.ts
//   На VPS: set -a; . /etc/zoiten.pro.env; set +a; npx tsx scripts/seed-bpla-warehouses.ts
//
// Требует DATABASE_URL + применённую миграцию 20260720_bpla_virtual_warehouses
// (WbWarehouse.isVirtual + enum FinanceStockLocation.WB_BURNED).

import { PrismaClient } from "@prisma/client"
import { readFileSync } from "fs"
import { join } from "path"
import { BPLA_WAREHOUSES, decideBplaSeedAction } from "../lib/wb-virtual-warehouse"

const prisma = new PrismaClient()

// ---------------------------------------------------------------------------
// Волна 1 — типы + данные
// ---------------------------------------------------------------------------

interface BurnedStockItemWave1 {
  nmId: number
  qty: number
  costRub: number | null
}

interface BurnedStockFileWave1 {
  elektrostal: { warehouseName: string; totalQty: number; items: BurnedStockItemWave1[] }
  kotovsk: { warehouseName: string; totalQty: number; items: BurnedStockItemWave1[] }
}

const DATA_PATH_WAVE1 = join(
  __dirname,
  "..",
  ".planning",
  "quick",
  "260720-oh2-bpla-virtual-warehouses",
  "burned-stock-2026-07-17.json",
)

// ---------------------------------------------------------------------------
// Волна 2 — типы + данные
// ---------------------------------------------------------------------------

interface BurnedStockItemWave2 {
  nmId: number
  techSize: string
  quantity: number
}

interface BurnedStockGroupWave2 {
  virtualWarehouseId: number
  warehouseName: string
  realWarehouseId: number
  totalQty: number
  items: BurnedStockItemWave2[]
}

interface BurnedStockFileWave2 {
  _source: string
  nevinnomyssk: BurnedStockGroupWave2
  krasnodar: BurnedStockGroupWave2
}

const DATA_PATH_WAVE2 = join(
  __dirname,
  "..",
  ".planning",
  "quick",
  "260723-hr5-2-gate",
  "burned-stock-wave2-2026-07-23.json",
)

async function upsertWarehouse(wh: { id: number; name: string }) {
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
}

async function seedWave1() {
  console.log(`[wave1] Читаем сгоревшие остатки: ${DATA_PATH_WAVE1}`)
  const raw = readFileSync(DATA_PATH_WAVE1, "utf-8")
  const data: BurnedStockFileWave1 = JSON.parse(raw)

  const wave1Warehouses = BPLA_WAREHOUSES.filter((w) => w.wave === 1)

  let warehousesUpserted = 0
  for (const wh of wave1Warehouses) {
    await upsertWarehouse(wh)
    warehousesUpserted++
  }

  const groups: Array<{ warehouseId: number; items: BurnedStockItemWave1[] }> = [
    { warehouseId: wave1Warehouses[0].id, items: data.elektrostal.items }, // 99001 Электросталь
    { warehouseId: wave1Warehouses[1].id, items: data.kotovsk.items }, // 99002 Котовск
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
        console.warn(`[wave1] nmId=${item.nmId} — WbCard не найдена, пропуск`)
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

  return { warehousesUpserted, rowsUpserted, skippedNoCard, skippedNmIds }
}

async function seedWave2() {
  console.log(`[wave2] Читаем сгоревшие остатки: ${DATA_PATH_WAVE2}`)
  const raw = readFileSync(DATA_PATH_WAVE2, "utf-8")
  const data: BurnedStockFileWave2 = JSON.parse(raw)

  const wave2Warehouses = BPLA_WAREHOUSES.filter((w) => w.wave === 2)

  const groupByVirtualId = new Map<number, BurnedStockGroupWave2>([
    [data.nevinnomyssk.virtualWarehouseId, data.nevinnomyssk],
    [data.krasnodar.virtualWarehouseId, data.krasnodar],
  ])

  let warehousesUpserted = 0
  const actions: Array<{
    warehouseId: number
    name: string
    action: string
    realWarehouseQty: number
    rowsUpserted: number
    skippedNoCard: number
  }> = []

  for (const wh of wave2Warehouses) {
    const group = groupByVirtualId.get(wh.id)
    if (!group) {
      console.warn(`[wave2] ${wh.name}: нет данных в data-файле — пропуск`)
      continue
    }

    const virtualRowsCount = await prisma.wbCardWarehouseStock.count({
      where: { warehouseId: wh.id },
    })
    const virtualHasRows = virtualRowsCount > 0

    const realAgg = await prisma.wbCardWarehouseStock.aggregate({
      where: { warehouseId: wh.realWarehouseId, quantity: { gt: 0 } },
      _sum: { quantity: true },
    })
    const realWarehouseQty = realAgg._sum.quantity ?? 0

    const action = decideBplaSeedAction({ virtualHasRows, realWarehouseQty })

    if (action === "already-seeded") {
      console.log(`[wave2] ${wh.name}: уже засеян (виртуальные строки есть) — skip`)
      actions.push({ warehouseId: wh.id, name: wh.name, action, realWarehouseQty, rowsUpserted: 0, skippedNoCard: 0 })
      continue
    }

    if (action === "gate-blocked") {
      console.log(
        `GATE: ${wh.name} ещё не обнулён WB (qty=${realWarehouseQty}) — сид отложен`,
      )
      actions.push({ warehouseId: wh.id, name: wh.name, action, realWarehouseQty, rowsUpserted: 0, skippedNoCard: 0 })
      continue
    }

    // action === "seed"
    await upsertWarehouse(wh)
    warehousesUpserted++

    let rowsUpserted = 0
    let skippedNoCard = 0

    for (const item of group.items) {
      const card = await prisma.wbCard.findUnique({
        where: { nmId: item.nmId },
        select: { id: true },
      })
      if (!card) {
        console.warn(`[wave2] ${wh.name}: nmId=${item.nmId} — WbCard не найдена, пропуск`)
        skippedNoCard++
        continue
      }

      await prisma.wbCardWarehouseStock.upsert({
        where: {
          wbCardId_warehouseId_techSize: {
            wbCardId: card.id,
            warehouseId: wh.id,
            techSize: item.techSize,
          },
        },
        create: {
          wbCardId: card.id,
          warehouseId: wh.id,
          techSize: item.techSize,
          quantity: item.quantity,
        },
        update: {
          quantity: item.quantity, // REPLACE — не суммировать
        },
      })
      rowsUpserted++
    }

    console.log(`[wave2] ${wh.name}: seeded rows=${rowsUpserted}, skippedNoCard=${skippedNoCard}`)
    actions.push({ warehouseId: wh.id, name: wh.name, action, realWarehouseQty, rowsUpserted, skippedNoCard })
  }

  return { warehousesUpserted, actions }
}

async function main() {
  const wave1Result = await seedWave1()
  const wave2Result = await seedWave2()

  console.log(
    JSON.stringify(
      {
        wave1: wave1Result,
        wave2: wave2Result,
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
