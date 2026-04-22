// scripts/import-ivanovo-once.ts
// Одноразовый скрипт: парсит Excel файла Иваново + делает upsert через Prisma.
// Обходит UI (т.к. у оркестратора нет browser session).
//
// Использование: tsx scripts/import-ivanovo-once.ts <path-to-xlsx>
// Пример: tsx scripts/import-ivanovo-once.ts /tmp/ivanovo-stock-16042026.xlsx

import fs from "node:fs"
import { PrismaClient } from "@prisma/client"
import { parseIvanovoExcel } from "../lib/parse-ivanovo-excel"
import { normalizeSku } from "../lib/normalize-sku"

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error("Usage: tsx scripts/import-ivanovo-once.ts <path>")
    process.exit(1)
  }

  const buf = fs.readFileSync(filePath)
  const parsed = parseIvanovoExcel(buf)

  console.log("\n== Parser result ==")
  console.log("columnMap:", parsed.columnMap)
  console.log("valid rows:", parsed.valid.length)
  console.log("invalid rows:", parsed.invalid.length)
  console.log("duplicates (keys):", parsed.duplicates.length)

  if (parsed.invalid.length > 0) {
    console.log("\n-- First 5 invalid --")
    parsed.invalid.slice(0, 5).forEach((r) =>
      console.log(`  row ${r.rowIndex}: ${r.reason} (sku=${r.sku ?? "?"}, bc=${r.barcode ?? "?"})`),
    )
  }

  if (parsed.duplicates.length > 0) {
    console.log("\n-- Duplicates (first 5) --")
    parsed.duplicates.slice(0, 5).forEach((d) =>
      console.log(`  ${d.keyType}=${d.key} → rows ${d.rows.join(",")}`),
    )
  }

  if (parsed.valid.length === 0) {
    console.log("\nNothing to import. Exit.")
    process.exit(0)
  }

  // Сопоставление с БД: пробуем по штрих-коду, затем по нормализованному sku/article
  const prisma = new PrismaClient()

  // Собираем все keys из Excel
  const barcodes = parsed.valid.map((r) => r.barcode).filter((b): b is string => !!b)
  const skusRaw = parsed.valid.map((r) => r.sku).filter((s): s is string => !!s)

  // Ищем Product по barcode (через Barcode table)
  const byBarcode = barcodes.length
    ? await prisma.barcode.findMany({
        where: { code: { in: barcodes } },
        select: { code: true, productId: true, product: { select: { sku: true } } },
      })
    : []

  // Ищем Product по MarketplaceArticle.article (для SKU колонки если это артикул МП)
  const byArticle = skusRaw.length
    ? await prisma.marketplaceArticle.findMany({
        where: { article: { in: skusRaw } },
        select: { article: true, productId: true, product: { select: { sku: true } } },
      })
    : []

  // Ищем Product по sku напрямую (нормализованный)
  const byProductSku = skusRaw.length
    ? await prisma.product.findMany({
        where: { sku: { in: skusRaw }, deletedAt: null },
        select: { sku: true, id: true },
      })
    : []

  // Строим lookup maps
  const barcodeToProduct = new Map(byBarcode.map((b) => [b.code, { productId: b.productId, sku: b.product.sku }]))
  const articleToProduct = new Map(byArticle.map((a) => [a.article, { productId: a.productId, sku: a.product.sku }]))
  const skuToProduct = new Map(byProductSku.map((p) => [p.sku, { productId: p.id, sku: p.sku }]))

  // Matching
  const matched: Array<{ sku: string; quantity: number; productId: string; source: string }> = []
  const unmatched: typeof parsed.valid = []

  for (const row of parsed.valid) {
    // 1. Barcode
    if (row.barcode) {
      const hit = barcodeToProduct.get(row.barcode)
      if (hit) {
        matched.push({ sku: hit.sku, quantity: row.quantity, productId: hit.productId, source: `barcode:${row.barcode}` })
        continue
      }
    }
    // 2. Sku as Product.sku
    if (row.sku) {
      const hit = skuToProduct.get(row.sku)
      if (hit) {
        matched.push({ sku: hit.sku, quantity: row.quantity, productId: hit.productId, source: `product.sku:${row.sku}` })
        continue
      }
    }
    // 3. Sku as MarketplaceArticle.article
    if (row.sku) {
      const hit = articleToProduct.get(row.sku)
      if (hit) {
        matched.push({ sku: hit.sku, quantity: row.quantity, productId: hit.productId, source: `article:${row.sku}` })
        continue
      }
    }
    // 4. Sku normalized → попробуем через article
    if (row.sku) {
      const normalized = normalizeSku(row.sku)
      if (normalized && normalized !== row.sku) {
        const hit = articleToProduct.get(normalized) || skuToProduct.get(normalized)
        if (hit) {
          matched.push({ sku: hit.sku, quantity: row.quantity, productId: hit.productId, source: `normalized:${row.sku}→${normalized}` })
          continue
        }
      }
    }
    unmatched.push(row)
  }

  console.log(`\n== Matching ==`)
  console.log(`matched: ${matched.length}`)
  console.log(`unmatched: ${unmatched.length}`)

  if (unmatched.length > 0) {
    console.log("\n-- First 10 unmatched --")
    unmatched.slice(0, 10).forEach((r) =>
      console.log(`  row ${r.rowIndex}: bc=${r.barcode ?? "—"} sku=${r.sku ?? "—"} name=${r.name ?? "—"} qty=${r.quantity}`),
    )
  }

  // Confirm: dry-run сначала
  if (process.env.DRY_RUN === "1") {
    console.log("\n== DRY RUN — не применяем изменения ==")
    await prisma.$disconnect()
    return
  }

  // Применяем upsert в Product.ivanovoStock (агрегация по productId — если дубли барьеры)
  // Агрегируем по productId: если один Product сматчился несколько раз, суммируем (или последний)?
  // Берём последний как в upsertIvanovoStock (updateMany by sku перезаписывает)
  const byProduct = new Map<string, { sku: string; quantity: number }>()
  for (const m of matched) {
    byProduct.set(m.productId, { sku: m.sku, quantity: m.quantity })
  }

  const now = new Date()
  let imported = 0
  await prisma.$transaction(async (tx) => {
    for (const [productId, data] of byProduct) {
      await tx.product.update({
        where: { id: productId },
        data: {
          ivanovoStock: data.quantity,
          ivanovoStockUpdatedAt: now,
        },
      })
      imported++
    }
  })

  console.log(`\n== Imported ==`)
  console.log(`Продуктов обновлено: ${imported}`)
  console.log(`Timestamp: ${now.toISOString()}`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
