// scripts/backfill-cbr-rates.ts
//
// 260704-fzt: бэкфилл исторических курсов ЦБ РФ через архивный эндпоинт cbr-xml-daily.ru.
//
// Проблема: CurrencyRate накапливается только с 09.06.2026 (forward-only ежедневный sync).
// Платежи закупок март–май 2026 конвертируются по самому раннему курсу (approximate=true),
// что занижает баланс. Этот скрипт заполняет пробел за произвольный диапазон дат.
//
// Идемпотентен: upsert по @@unique([date, code]) — повторный запуск не задваивает записи.
// Загружает ВСЕ валюты из ответа ЦБ (не только CNY/USD).
//
// Запуск:
//   npx tsx scripts/backfill-cbr-rates.ts [--from=2026-03-01] [--to=2026-06-09]
//   На VPS: set -a; . /etc/zoiten.pro.env; set +a; npx tsx scripts/backfill-cbr-rates.ts
//
// НЕ трогает /api/cbr-rate-sync (forward-only daily остаётся как есть).
// Требует DATABASE_URL.

import { PrismaClient } from "@prisma/client"
import { fetchCbrRatesForDate, ratePerUnit } from "../lib/cbr-rates"

const prisma = new PrismaClient()

const DEFAULT_FROM = "2026-03-01"
const DEFAULT_TO = "2026-06-09"

export interface BackfillCliArgs {
  from: string
  to: string
}

/** PURE — парсит --from= / --to= из argv (process.argv.slice(2)). */
export function parseCliArgs(argv: string[]): BackfillCliArgs {
  let from = DEFAULT_FROM
  let to = DEFAULT_TO
  for (const arg of argv) {
    if (arg.startsWith("--from=")) from = arg.slice("--from=".length)
    if (arg.startsWith("--to=")) to = arg.slice("--to=".length)
  }
  return { from, to }
}

/** Строит полночь UTC для строки YYYY-MM-DD. */
function parseDateUtc(dateStr: string): Date {
  const [yyyy, mm, dd] = dateStr.split("-").map(Number)
  return new Date(Date.UTC(yyyy, mm - 1, dd))
}

/** Итерация по диапазону дат [from, to] включительно. */
function* dateRange(from: Date, to: Date): Generator<Date> {
  const cur = new Date(from)
  while (cur.getTime() <= to.getTime()) {
    yield new Date(cur)
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
}

async function main() {
  const { from, to } = parseCliArgs(process.argv.slice(2))

  const fromDate = parseDateUtc(from)
  const toDate = parseDateUtc(to)

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    console.error(`Некорректный диапазон дат: from="${from}" to="${to}" (ожидается YYYY-MM-DD)`)
    process.exit(1)
  }
  if (fromDate.getTime() > toDate.getTime()) {
    console.error(`from="${from}" позже to="${to}" — диапазон пуст`)
    process.exit(1)
  }

  console.log(`Бэкфилл курсов ЦБ РФ: from=${from} to=${to}`)

  let datesProcessed = 0
  let datesSkipped = 0
  let ratesUpserted = 0

  for (const date of dateRange(fromDate, toDate)) {
    const dateStr = date.toISOString().split("T")[0]

    const resp = await fetchCbrRatesForDate(date)
    if (resp == null) {
      // Нет курса за дату (выходной/праздник) — пропускаем
      console.log(`  skip ${dateStr} (нет курса — выходной или праздник)`)
      datesSkipped++
      // Пауза между запросами — не заваливать cbr-xml-daily.ru
      await new Promise((r) => setTimeout(r, 150))
      continue
    }

    // Upsert всех валют из ответа по @@unique([date, code])
    for (const valute of Object.values(resp.Valute)) {
      await prisma.currencyRate.upsert({
        where: { date_code: { date, code: valute.CharCode } },
        create: {
          date,
          code: valute.CharCode,
          nominal: valute.Nominal,
          rateToRub: ratePerUnit(valute),
        },
        update: {
          nominal: valute.Nominal,
          rateToRub: ratePerUnit(valute),
        },
      })
      ratesUpserted++
    }

    console.log(`  done  ${dateStr} (${Object.keys(resp.Valute).length} валют)`)
    datesProcessed++

    // Пауза 150мс между датами — не заваливать архивный эндпоинт
    await new Promise((r) => setTimeout(r, 150))
  }

  const summary = { from, to, datesProcessed, datesSkipped, ratesUpserted }
  console.log(`\nГотово:`)
  console.log(JSON.stringify(summary, null, 2))
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
