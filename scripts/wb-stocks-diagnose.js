#!/usr/bin/env node
// scripts/wb-stocks-diagnose.js
// Phase 16 (STOCK-30): Diagnostic — сравнение WB Statistics API snapshot ↔ БД
// для контрольных nmId. Выгружает CSV с расхождениями.
//
// Запуск: node scripts/wb-stocks-diagnose.js
// Опционально: WB_STOCKS_DIAGNOSE_NMIDS="111,222,333" node scripts/wb-stocks-diagnose.js
//
// Использует:
//   - WB_API_TOKEN из env (или /etc/zoiten.pro.env на VPS)
//   - Prisma client (DATABASE_URL из .env)
//   - curl (system) — паттерн scripts/wb-sync-stocks.js
//
// Цель: golden baseline ДО фикса sync-бага (Plan 16-02), чтобы повторный
// запуск после re-sync (Plan 16-06) показал diff=0 — объективное доказательство
// для UAT (STOCK-37 acceptance).

const { execSync } = require("node:child_process")
const fs = require("node:fs")
const { PrismaClient } = require("@prisma/client")

const TOKEN = process.env.WB_API_TOKEN
if (!TOKEN) {
  console.error("ERROR: WB_API_TOKEN не задан в env. Установите перед запуском.")
  process.exit(1)
}

const DEFAULT_NMIDS = [859398279, 901585883]
const targetEnv = process.env.WB_STOCKS_DIAGNOSE_NMIDS
const TARGET_NMIDS = targetEnv
  ? targetEnv.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
  : DEFAULT_NMIDS

if (TARGET_NMIDS.length === 0) {
  console.error("ERROR: TARGET_NMIDS пусто (некорректный WB_STOCKS_DIAGNOSE_NMIDS).")
  process.exit(1)
}

async function main() {
  console.log(`Diagnostic для nmId: ${TARGET_NMIDS.join(", ")}`)

  // 1. Snapshot из API (одним запросом — Statistics API rate limit ~1 req/min).
  // dateFrom = 2019-06-20T00:00:00 — фильтр по lastChangeDate, полный snapshot.
  // Если "now-1d" — стабильные остатки (не менявшиеся) выпадут из ответа,
  // см. lib/wb-api.ts комментарий к fetchStocksPerWarehouse.
  const dateFrom = "2019-06-20T00:00:00"
  const url = `https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=${encodeURIComponent(dateFrom)}`
  const cmd = `curl -sS -H "Authorization: ${TOKEN}" "${url}"`
  console.log("Fetching WB Statistics API...")
  const raw = execSync(cmd, { encoding: "utf-8", maxBuffer: 200 * 1024 * 1024 })

  let apiRowsAll
  try {
    apiRowsAll = JSON.parse(raw)
  } catch (e) {
    console.error("ERROR: API response не является JSON:", e.message)
    console.error("Raw начало:", raw.slice(0, 500))
    process.exit(1)
  }

  if (!Array.isArray(apiRowsAll)) {
    console.error("ERROR: API response не массив. Type:", typeof apiRowsAll)
    process.exit(1)
  }

  const apiRows = apiRowsAll.filter((r) => TARGET_NMIDS.includes(r.nmId))
  console.log(`API: ${apiRows.length} rows для целевых nmId (всего ${apiRowsAll.length})`)

  // 2. Aggregate API per (nmId, warehouseName) — sum across techSize.
  // В legacy schema (до Plan 16-01) по одному (nmId, warehouseName) может быть
  // несколько rows с разными techSize — суммируем их.
  const apiAgg = new Map()
  for (const r of apiRows) {
    const key = `${r.nmId}:${r.warehouseName ?? ""}`
    apiAgg.set(key, (apiAgg.get(key) ?? 0) + (r.quantity ?? 0))
  }

  // 3. Read DB
  const prisma = new PrismaClient()
  const dbRows = await prisma.wbCardWarehouseStock.findMany({
    where: { wbCard: { nmId: { in: TARGET_NMIDS } } },
    include: {
      wbCard: { select: { nmId: true } },
      warehouse: { select: { name: true } },
    },
  })
  console.log(`DB: ${dbRows.length} rows для целевых nmId`)

  // Aggregate DB per (nmId, warehouseName) — sum в legacy schema гарантирует,
  // что мы корректно сравним даже если внутри одного (wbCardId, warehouseId)
  // оказались дубликаты (которые быть не должны, но скрипт устойчив).
  const dbAgg = new Map()
  for (const r of dbRows) {
    const key = `${r.wbCard.nmId}:${r.warehouse?.name ?? ""}`
    dbAgg.set(key, (dbAgg.get(key) ?? 0) + (r.quantity ?? 0))
  }

  // 4. Compute diff CSV
  const allKeys = new Set([...apiAgg.keys(), ...dbAgg.keys()])
  const csvRows = [["nmId", "warehouseName", "apiTotal", "dbTotal", "diff", "ratio"]]
  for (const key of allKeys) {
    const [nmIdStr, warehouseName] = key.split(":")
    const apiTotal = apiAgg.get(key) ?? 0
    const dbTotal = dbAgg.get(key) ?? 0
    const diff = apiTotal - dbTotal
    if (diff === 0) continue
    const ratio = dbTotal > 0 ? (apiTotal / dbTotal).toFixed(2) : "—"
    csvRows.push([nmIdStr, warehouseName, String(apiTotal), String(dbTotal), String(diff), ratio])
  }

  // 5. Write CSV
  const today = new Date().toISOString().slice(0, 10)
  const filename = `wb-stocks-diff-${today}.csv`
  fs.writeFileSync(filename, csvRows.map((row) => row.join(",")).join("\n") + "\n")

  const diffCount = csvRows.length - 1
  if (diffCount === 0) {
    console.log(`No diffs found — БД соответствует API. CSV (только header): ${filename}`)
  } else {
    console.log(`Diff written: ${diffCount} rows → ${filename}`)
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
