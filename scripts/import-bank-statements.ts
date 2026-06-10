/**
 * Разовый скрипт импорта банковских выписок из папки Выписки/.
 * Phase 22 (22-05): использует тот же пайплайн, что и UI (detectFormat + parseStatement + persistParsedTransactions).
 *
 * Запуск:
 *   Локально (Windows):  npx tsx scripts/import-bank-statements.ts
 *   На VPS:              set -a; . /etc/zoiten.pro.env; set +a; npx tsx scripts/import-bank-statements.ts
 *   Либо через npm-скрипт (если добавлен в package.json):  npm run import:bank
 *
 * Идемпотентен: повторный прогон → imported 0 (через fingerprint @unique + createMany skipDuplicates).
 *
 * ВАЖНО: папка Выписки/ содержит реальные данные и НЕ коммитится в git (untracked).
 * Источник: 9 XLSX-файлов (2 ВТБ, 2 ПСБ, 5 СберБизнес) за период 01.01–10.06.2026.
 */

import { PrismaClient } from "@prisma/client"
import * as XLSX from "xlsx"
import fs from "fs"
import path from "path"
import { detectFormat, parseStatement } from "../lib/bank-import"
import { persistParsedTransactions } from "../lib/bank-import/persist"

const prisma = new PrismaClient()

async function main() {
  const dir = path.resolve(process.cwd(), "Выписки")

  if (!fs.existsSync(dir)) {
    console.error(`Папка не найдена: ${dir}`)
    console.error('Убедитесь, что папка "Выписки/" существует рядом с package.json.')
    process.exit(1)
  }

  const files = fs.readdirSync(dir).filter((f) => /\.(xlsx|xls)$/i.test(f))

  if (files.length === 0) {
    console.log("Нет XLSX-файлов в папке Выписки/")
    return
  }

  console.log(`Найдено файлов: ${files.length}`)
  console.log("─".repeat(60))

  let totalImported = 0
  let totalSkipped = 0
  let totalProcessed = 0

  for (const file of files) {
    const filePath = path.join(dir, file)
    try {
      const buffer = fs.readFileSync(filePath)

      // Первичный read для detectFormat (probe)
      const probe = XLSX.read(buffer, { type: "buffer" })
      const format = detectFormat(file, probe)

      // Для Сбера — re-read с raw:false для корректного парсинга merged cells
      const workbook =
        format === "sber" ? XLSX.read(buffer, { type: "buffer", raw: false }) : probe

      const { transactions } = parseStatement(format, workbook)

      const r = await persistParsedTransactions(prisma, transactions, {
        fileName: file,
        sourceBank: format,
        importedById: null, // системный скрипт, не привязан к пользователю
      })

      console.log(
        `${file} [${format}]: total=${r.total} imported=${r.imported} skipped=${r.skipped}`,
      )

      totalImported += r.imported
      totalSkipped += r.skipped
      totalProcessed += r.total
    } catch (e) {
      console.error(`ОШИБКА: ${file}:`, (e as Error).message)
    }
  }

  console.log("─".repeat(60))
  console.log(
    `Итого: обработано=${totalProcessed} импортировано=${totalImported} пропущено дублей=${totalSkipped}`,
  )
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
