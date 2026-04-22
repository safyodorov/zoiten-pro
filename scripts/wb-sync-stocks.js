// scripts/wb-sync-stocks.js (one-shot)
// Заполняет WbCardWarehouseStock из Statistics API /api/v1/supplier/stocks.
// Обходит HTTP /api/wb-sync (требует Auth.js session cookie).

const { execSync } = require("node:child_process")
const { PrismaClient } = require("@prisma/client")

const WB_API_TOKEN = process.env.WB_API_TOKEN
if (!WB_API_TOKEN) {
  console.error("WB_API_TOKEN не установлен")
  process.exit(1)
}

function stableWarehouseIdFromName(name) {
  let hash = 5381
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 33) ^ name.charCodeAt(i)
  }
  return 10_000_001 + (Math.abs(hash) % 8_446_744)
}

async function main() {
  // Вчера (1 day ago) ISO
  const date = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 19)
  console.log(`Fetching stocks since ${date}...`)

  const cmd = `curl -sS -H "Authorization: ${WB_API_TOKEN}" "https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=${date}"`
  const raw = execSync(cmd, { encoding: "utf-8", maxBuffer: 100 * 1024 * 1024 })
  const stocks = JSON.parse(raw)
  console.log(`Received ${stocks.length} stock rows`)

  // Группируем по nmId
  const byNmId = new Map()
  for (const s of stocks) {
    if (!s.nmId || !s.warehouseName) continue
    if (!byNmId.has(s.nmId)) byNmId.set(s.nmId, [])
    byNmId.get(s.nmId).push(s)
  }
  console.log(`Unique nmIds: ${byNmId.size}`)

  const prisma = new PrismaClient()

  // Собираем все WbCards которые есть в БД
  const allCards = await prisma.wbCard.findMany({ select: { id: true, nmId: true } })
  const cardByNmId = new Map(allCards.map((c) => [c.nmId, c.id]))
  console.log(`WbCards в БД: ${allCards.length}`)

  let matched = 0
  let inserted = 0
  let unknownWarehouses = 0
  const newWarehouses = new Set()

  for (const [nmId, items] of byNmId) {
    const wbCardId = cardByNmId.get(nmId)
    if (!wbCardId) continue
    matched++

    await prisma.$transaction(async (tx) => {
      const incoming = new Set()

      for (const item of items) {
        // Lookup by name (seed создал 75 известных складов)
        let wh = await tx.wbWarehouse.findFirst({
          where: { name: item.warehouseName },
          select: { id: true },
        })

        let warehouseId
        if (wh) {
          warehouseId = wh.id
        } else {
          // Новый склад — создаём с stable hash id
          warehouseId = stableWarehouseIdFromName(item.warehouseName)
          try {
            await tx.wbWarehouse.create({
              data: {
                id: warehouseId,
                name: item.warehouseName,
                cluster: "Прочие склады",
                shortCluster: "Прочие",
                isActive: true,
                needsClusterReview: true,
              },
            })
            newWarehouses.add(item.warehouseName)
            unknownWarehouses++
          } catch (e) {
            // race condition — берём существующий
            const existing = await tx.wbWarehouse.findFirst({ where: { name: item.warehouseName }, select: { id: true } })
            if (existing) warehouseId = existing.id
            else throw e
          }
        }

        incoming.add(warehouseId)

        // Агрегация: у одного склада может быть несколько записей (разные barcode / размеры) — суммируем
        const qty = (item.quantity || 0) + (item.inWayToClient || 0) + (item.inWayFromClient || 0)

        const existing = await tx.wbCardWarehouseStock.findUnique({
          where: { wbCardId_warehouseId: { wbCardId, warehouseId } },
          select: { quantity: true },
        })

        if (existing) {
          await tx.wbCardWarehouseStock.update({
            where: { wbCardId_warehouseId: { wbCardId, warehouseId } },
            data: { quantity: existing.quantity + qty },
          })
        } else {
          await tx.wbCardWarehouseStock.create({
            data: { wbCardId, warehouseId, quantity: qty },
          })
          inserted++
        }
      }

      // Удалить склады которых нет в текущем ответе (clean-replace per wbCardId)
      await tx.wbCardWarehouseStock.deleteMany({
        where: {
          wbCardId,
          NOT: { warehouseId: { in: [...incoming] } },
        },
      })
    })
  }

  console.log(`\n== Результат ==`)
  console.log(`Matched nmIds: ${matched} / ${byNmId.size}`)
  console.log(`Новых записей WbCardWarehouseStock: ${inserted}`)
  console.log(`Unknown warehouses auto-inserted: ${unknownWarehouses}`)
  if (newWarehouses.size > 0) {
    console.log(`\nНовые склады (needsClusterReview):`)
    newWarehouses.forEach((n) => console.log(`  - ${n}`))
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
