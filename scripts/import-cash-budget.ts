/**
 * Разовый скрипт импорта наличной кассы из «Офис Бюджет.xlsx».
 * Phase 23 (23-03): парсит листы «Юля» + «Павел» (2024-2026), нормализует, категоризирует,
 * сохраняет в CashEntry через fingerprint-дедуп (createMany skipDuplicates).
 * Лист «Микроволновка на склад» — игнорируется.
 *
 * Запуск:
 *   Локально:  npx tsx scripts/import-cash-budget.ts
 *   На VPS:    set -a; . /etc/zoiten.pro.env; set +a; npx tsx scripts/import-cash-budget.ts
 *
 * Идемпотентен: повторный прогон → imported=0, skipped=N (через fingerprint @unique).
 * Файл «Офис Бюджет.xlsx» untracked — не коммитится в git.
 */

import { PrismaClient } from "@prisma/client"
import * as XLSX from "xlsx"
import fs from "fs"
import path from "path"
import { parseBudget } from "../lib/cash-import/parse"
import { persistCashEntries } from "../lib/cash-import/persist"

const prisma = new PrismaClient()

async function main() {
  // WARNING 3: preflight — Employee «Иванова» используется как default ответственный.
  // Если её нет в справочнике, записи с пустым ответственным получат responsibleEmployeeId=null
  // (responsibleNameRaw="Иванова" при этом сохранится).
  const iv = await prisma.employee.findFirst({ where: { lastName: "Иванова" } })
  if (!iv) {
    console.warn(
      "⚠ Employee Иванова не найдена — записи с пустым ответственным получат responsibleEmployeeId=null (responsibleNameRaw сохранится)"
    )
  } else {
    console.log(`✓ Default ответственный найден: Иванова (id=${iv.id})`)
  }

  const file = path.resolve(process.cwd(), "Офис Бюджет.xlsx")
  if (!fs.existsSync(file)) {
    console.error(`Файл не найден: ${file}`)
    console.error('Скопируйте "Офис Бюджет.xlsx" в корень проекта и повторите запуск.')
    process.exit(1)
  }

  const wb = XLSX.read(fs.readFileSync(file), { type: "buffer", raw: true })
  const entries = parseBudget(wb)
  console.log(`Распознано записей: ${entries.length} (Юля+Павел, ${new Date().getFullYear() >= 2024 ? "2024-2026" : "фильтр 2024-2026"})`)

  if (entries.length === 0) {
    console.log("Нет записей для импорта.")
    return
  }

  console.log("Импортируем в БД...")
  const r = await persistCashEntries(prisma, entries)
  console.log(`total=${r.total} imported=${r.imported} skipped=${r.skipped}`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
