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
  // ВАЖНО: dateFrom в Statistics API stocks — фильтр по lastChangeDate.
  // Если указать "вчера", вернутся ТОЛЬКО остатки изменённые за 24ч →
  // стабильные остатки (не менялись) пропадут. Решение: использовать
  // 2019-06-20 (дата запуска API) для полного snapshot всех остатков.
  // Пример: nmId 418716179 с qty=90 на Электростали не менялся >24ч →
  // без этого фикса возвращалась бы только inWay-запись (1 шт).
  const date = "2019-06-20T00:00:00"
  console.log(`Fetching stocks since ${date} (full snapshot)...`)

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

        // Phase 15.1: per-warehouse — только физический остаток (без in-way).
        // In-way хранится отдельно на WbCard.inWayTo/From (см. ниже).
        const qty = item.quantity || 0

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

  // ─── Phase 15 (ORDERS-02): orders per-warehouse ─────────────
  console.log(`\nFetching orders (7 days)...`)
  const PERIOD_DAYS = 7
  const dateFrom7 = new Date(Date.now() - PERIOD_DAYS * 24 * 3600 * 1000).toISOString()
  const cmdOrders = `curl -sS -H "Authorization: ${WB_API_TOKEN}" "https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom=${encodeURIComponent(dateFrom7)}&flag=0"`
  const rawOrders = execSync(cmdOrders, { encoding: "utf-8", maxBuffer: 200 * 1024 * 1024 })
  let orders
  try {
    orders = JSON.parse(rawOrders)
  } catch (e) {
    console.error("Orders API JSON parse failed — пропускаем секцию orders:", e.message)
    orders = null
  }

  let ordersMatched = 0
  let ordersInserted = 0
  let ordersUnknownWarehouses = 0
  const newOrdersWarehouses = new Set()

  if (Array.isArray(orders)) {
    console.log(`Received ${orders.length} order rows`)

    // Группируем по nmId → Map<warehouseName, count> (исключая isCancel)
    const ordersByNmId = new Map()
    for (const o of orders) {
      if (o.isCancel) continue
      const nm = o.nmId ?? o.nm_id
      const wh = (o.warehouseName || "").trim()
      if (!nm || !wh) continue
      if (!ordersByNmId.has(nm)) ordersByNmId.set(nm, new Map())
      const whMap = ordersByNmId.get(nm)
      whMap.set(wh, (whMap.get(wh) ?? 0) + 1)
    }
    console.log(`Unique nmIds with orders: ${ordersByNmId.size}`)

    for (const [nmId, whMap] of ordersByNmId) {
      const wbCardId = cardByNmId.get(nmId)
      if (!wbCardId) continue
      ordersMatched++

      await prisma.$transaction(async (tx) => {
        const incoming = new Set()

        for (const [warehouseName, ordersCount] of whMap) {
          let wh = await tx.wbWarehouse.findFirst({
            where: { name: warehouseName },
            select: { id: true },
          })

          let warehouseId
          if (wh) {
            warehouseId = wh.id
          } else {
            warehouseId = stableWarehouseIdFromName(warehouseName)
            try {
              await tx.wbWarehouse.create({
                data: {
                  id: warehouseId,
                  name: warehouseName,
                  cluster: "Прочие склады",
                  shortCluster: "Прочие",
                  isActive: true,
                  needsClusterReview: true,
                },
              })
              newOrdersWarehouses.add(warehouseName)
              ordersUnknownWarehouses++
            } catch (e) {
              // race condition — берём существующий
              const existing = await tx.wbWarehouse.findFirst({
                where: { name: warehouseName },
                select: { id: true },
              })
              if (existing) warehouseId = existing.id
              else throw e
            }
          }

          incoming.add(warehouseId)

          const existing = await tx.wbCardWarehouseOrders.findUnique({
            where: { wbCardId_warehouseId: { wbCardId, warehouseId } },
            select: { id: true },
          })

          if (existing) {
            await tx.wbCardWarehouseOrders.update({
              where: { wbCardId_warehouseId: { wbCardId, warehouseId } },
              data: { ordersCount, periodDays: PERIOD_DAYS },
            })
          } else {
            await tx.wbCardWarehouseOrders.create({
              data: { wbCardId, warehouseId, ordersCount, periodDays: PERIOD_DAYS },
            })
            ordersInserted++
          }
        }

        // Clean: удалить склады которых нет в текущем ответе
        if (incoming.size > 0) {
          await tx.wbCardWarehouseOrders.deleteMany({
            where: {
              wbCardId,
              NOT: { warehouseId: { in: [...incoming] } },
            },
          })
        }
      })
    }
  }

  // Денормализация на WbCard per nmId:
  //   stockQty = sum(warehouse.quantity)
  //   inWayToClient = sum inWayToClient из raw rows (за весь snapshot)
  //   inWayFromClient = sum inWayFromClient
  // Нужно потому что /api/wb-sync это делает, а этот скрипт выполняется отдельно.
  const inWayByNmId = new Map()
  for (const s of stocks) {
    if (!s.nmId) continue
    const entry = inWayByNmId.get(s.nmId) ?? { to: 0, from: 0 }
    entry.to += s.inWayToClient || 0
    entry.from += s.inWayFromClient || 0
    inWayByNmId.set(s.nmId, entry)
  }

  const cardsForStockQty = await prisma.wbCard.findMany({
    select: { id: true, nmId: true, warehouses: { select: { quantity: true } } },
  })
  let stockQtyUpdated = 0
  for (const c of cardsForStockQty) {
    const total = c.warehouses.reduce((s, w) => s + w.quantity, 0)
    const inWay = inWayByNmId.get(c.nmId) ?? { to: 0, from: 0 }
    await prisma.wbCard.update({
      where: { id: c.id },
      data: {
        stockQty: total,
        inWayToClient: inWay.to,
        inWayFromClient: inWay.from,
      },
    })
    stockQtyUpdated++
  }

  console.log(`\n== Результат ==`)
  console.log(`[STOCKS] WbCard.stockQty пересчитан: ${stockQtyUpdated}`)
  console.log(`[STOCKS] Matched nmIds: ${matched} / ${byNmId.size}`)
  console.log(`[STOCKS] Новых записей WbCardWarehouseStock: ${inserted}`)
  console.log(`[STOCKS] Unknown warehouses auto-inserted: ${unknownWarehouses}`)
  if (newWarehouses.size > 0) {
    console.log(`\n[STOCKS] Новые склады (needsClusterReview):`)
    newWarehouses.forEach((n) => console.log(`  - ${n}`))
  }
  console.log(`\n[ORDERS] Matched nmIds: ${ordersMatched}`)
  console.log(`[ORDERS] Новых записей WbCardWarehouseOrders: ${ordersInserted}`)
  console.log(`[ORDERS] Unknown warehouses auto-inserted: ${ordersUnknownWarehouses}`)
  if (newOrdersWarehouses.size > 0) {
    console.log(`\n[ORDERS] Новые склады (needsClusterReview):`)
    newOrdersWarehouses.forEach((n) => console.log(`  - ${n}`))
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
