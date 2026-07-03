// scripts/bootstrap-balance-snapshot.ts
//
// Phase 24 Plan 24-09 (D-03): однократный bootstrap-скрипт — снапшот баланса на 01.07.2026
// (или произвольную дату через --date). Два режима:
//
//   --mode=csv (default) — ТОЧНЫЕ WB-остатки через отчёт STOCK_HISTORY_DAILY_CSV
//     («Аналитика продавца CSV», токен WB_API_TOKEN — scope Аналитика уже включён,
//     см. CLAUDE.md). Механизм — тот же downloads API, что lib/wb-api.ts:fetchBuyoutPercent
//     (create job → poll status → download ZIP → parse CSV), только reportType и params
//     другие. ⚠ Точный endpoint/форма ответа НЕ подтверждены официально (24-RESEARCH.md
//     §«История остатков WB») — при 400/404/пустом отчёте скрипт печатает полный ответ WB
//     и завершается с process.exit(2) — сигнал оператору перезапустить с --mode=fallback.
//
//   --mode=fallback — приближение: остатки WB_WAREHOUSE / в пути к-от клиента берутся
//     ТЕКУЩИМИ (computeStockSnapshotRows на «сейчас»), если CSV endpoint недоступен,
//     не подтверждён или токен не настроен.
//
// Иваново (Product.ivanovoStock) и «в пути к/от клиента» (WbCard.inWayToClient/
// inWayFromClient) — истории нет в ЛЮБОМ режиме, берутся ТЕКУЩИМИ значениями с
// console.warn-пометкой «приближение».
// costPriceAtDate = ТЕКУЩАЯ ProductCost.costPrice (D-10 — истории себестоимости в проекте
// нет, это ожидаемое приближение; кнопка «Пересчитать дату» (D-04) переоценит qty по
// свежей себестоимости, но НЕ восстановит qty задним числом).
//
// prisma.financeReceivablesSnapshot НЕ создаётся этим скриптом на bootstrap-дату — Balance
// API (D-14) отдаёт только «сейчас», снапшот дебиторки задним числом технически невозможен.
// Строка дебиторки в /finance/balance на bootstrap-дату честно покажет «нет снапшота».
//
// Идемпотентность: deleteMany({date}) + createMany внутри транзакции — повторный запуск
// на ту же дату НЕ задваивает строки FinanceStockSnapshot.
//
// Daily-cap Analytics (3 отчёта/день, WB, см. CLAUDE.md §«WB API rate-limit защиты») —
// общий счётчик AppSetting('wbAnalyticsDailyCounter'), та же запись, что
// lib/wb-api.ts:checkAndIncrementAnalyticsCounter использует для fetchBuyoutPercent.
// Логика продублирована здесь (не экспортирована из wb-api.ts) намеренно — правка общего
// модуля вне scope этого плана; ключ и лимит СОВПАДАЮТ, счётчик общий с остальным Analytics.
//
// Запуск:
//   npx tsx scripts/bootstrap-balance-snapshot.ts [--date=2026-07-01] [--mode=csv|fallback]
//   На VPS: set -a; . /etc/zoiten.pro.env; set +a; npx tsx scripts/bootstrap-balance-snapshot.ts
//
// Требует DATABASE_URL (+ WB_API_TOKEN в БД/env для --mode=csv, читается через
// lib/wb-token.ts:getWbToken — тот же токен, что использует остальной Analytics/Content).

import { PrismaClient } from "@prisma/client"
import {
  computeStockSnapshotRows,
  type StockSnapshotProductInput,
  type WbCardStockInput,
} from "../lib/finance-snapshot"
import { getWbToken } from "../lib/wb-token"
import { getWbCooldownSecondsRemaining, setWbCooldownUntil } from "../lib/wb-cooldown"

const prisma = new PrismaClient()

const DEFAULT_DATE = "2026-07-01"
const ANALYTICS_DAILY_MAX = 3
// Ключ ОБЩИЙ с lib/wb-api.ts:checkAndIncrementAnalyticsCounter — один физический дневной
// лимит WB Analytics на весь проект (fetchBuyoutPercent + этот bootstrap делят один счётчик).
const ANALYTICS_COUNTER_KEY = "wbAnalyticsDailyCounter"

export interface CliArgs {
  date: string
  mode: "csv" | "fallback"
}

/** PURE — парсит --date=/--mode= из argv (process.argv.slice(2)). Неизвестный --mode игнорируется (остаётся default). */
export function parseCliArgs(argv: string[]): CliArgs {
  let date = DEFAULT_DATE
  let mode: "csv" | "fallback" = "csv"
  for (const arg of argv) {
    if (arg.startsWith("--date=")) date = arg.slice("--date=".length)
    if (arg.startsWith("--mode=")) {
      const v = arg.slice("--mode=".length)
      if (v === "csv" || v === "fallback") mode = v
    }
  }
  return { date, mode }
}

/** Дневной cap WB Analytics API (3 отчёта/день) — общий счётчик с lib/wb-api.ts. */
async function checkAndIncrementAnalyticsCounter(): Promise<{
  canRun: boolean
  current: number
  max: number
}> {
  const today = new Date().toISOString().split("T")[0]
  const setting = await prisma.appSetting.findUnique({ where: { key: ANALYTICS_COUNTER_KEY } })
  let data: { date: string; count: number } = { date: today, count: 0 }
  if (setting) {
    try {
      const parsed = JSON.parse(setting.value)
      if (parsed.date === today && typeof parsed.count === "number") data = parsed
    } catch {
      // повреждённый JSON — считаем счётчик обнулённым на сегодня
    }
  }
  if (data.count >= ANALYTICS_DAILY_MAX) {
    return { canRun: false, current: data.count, max: ANALYTICS_DAILY_MAX }
  }
  data.count++
  await prisma.appSetting.upsert({
    where: { key: ANALYTICS_COUNTER_KEY },
    create: { key: ANALYTICS_COUNTER_KEY, value: JSON.stringify(data) },
    update: { value: JSON.stringify(data) },
  })
  return { canRun: true, current: data.count, max: ANALYTICS_DAILY_MAX }
}

/**
 * PURE — парсит CSV-текст отчёта STOCK_HISTORY_DAILY_CSV → Σ qty по nmId.
 *
 * Реальные заголовки WB официально НЕ подтверждены (24-RESEARCH.md) — колонки резолвятся
 * по имени заголовка (case-insensitive, частичное совпадение), а НЕ по фиксированной
 * позиции (в отличие от lib/wb-api.ts:fetchBuyoutPercent, где позиции хардкожены под уже
 * подтверждённый формат DETAIL_HISTORY_REPORT). Кандидаты:
 *   nmId: "nmid", "nm_id", "nomenclature"
 *   qty:  "qty", "quantity", "stock", "остаток", "balance"
 * Период запроса — один день (startDate=endDate), поэтому разбивка по датам/складам внутри
 * CSV игнорируется — просто суммируем qty по nmId по всем строкам отчёта.
 * Обязательные колонки не найдены → пустой Map (caller решает про --mode=fallback).
 */
export function parseStockHistoryCsv(csvText: string): Map<number, number> {
  const result = new Map<number, number>()
  const lines = csvText.trim().split(/\r?\n/)
  if (lines.length < 2) return result

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase())
  const nmIdCandidates = ["nmid", "nm_id", "nomenclature"]
  const qtyCandidates = ["qty", "quantity", "stock", "остаток", "balance"]

  const nmIdIdx = headers.findIndex((h) => nmIdCandidates.some((c) => h.includes(c)))
  const qtyIdx = headers.findIndex((h) => qtyCandidates.some((c) => h.includes(c)))

  if (nmIdIdx === -1 || qtyIdx === -1) {
    console.warn(
      `[bootstrap-balance-snapshot] STOCK_HISTORY_DAILY_CSV: колонки не распознаны. Заголовки: "${lines[0]}"`
    )
    return result
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",")
    const nmId = parseInt(cols[nmIdIdx], 10)
    const qty = parseInt(cols[qtyIdx], 10)
    if (!nmId || isNaN(qty)) continue
    result.set(nmId, (result.get(nmId) ?? 0) + qty)
  }

  return result
}

/**
 * Создаёт CSV-задание STOCK_HISTORY_DAILY_CSV (тот же downloads-механизм, что
 * lib/wb-api.ts:fetchBuyoutPercent — create → poll → ZIP), период = один день [date, date].
 * Cooldown bucket 'analytics' (см. lib/wb-cooldown.ts) — та же защита, что остальной
 * Analytics/Content трафик WB_API_TOKEN.
 *
 * ⚠ Endpoint/форма params НЕ подтверждены официально — при 400/404/непустом-но-нераспознанном
 * ответе бросает Error с понятным сообщением, main() ловит и завершает process.exit(2).
 */
async function fetchStockHistoryDailyCsv(date: string): Promise<Map<number, number>> {
  const cooldownSec = await getWbCooldownSecondsRemaining("analytics")
  if (cooldownSec > 0) {
    throw new Error(
      `WB Analytics cooldown активен ещё ${cooldownSec}с — повторите позже или используйте --mode=fallback`
    )
  }

  const cap = await checkAndIncrementAnalyticsCounter()
  if (!cap.canRun) {
    throw new Error(
      `WB Analytics дневной лимит исчерпан (${cap.current}/${cap.max}) — повторите завтра или используйте --mode=fallback`
    )
  }

  const token = await getWbToken("WB_API_TOKEN")
  const id = crypto.randomUUID()

  const createRes = await fetch("https://seller-analytics-api.wildberries.ru/api/v2/nm-report/downloads", {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({
      id,
      reportType: "STOCK_HISTORY_DAILY_CSV",
      params: { startDate: date, endDate: date },
    }),
  })

  if (createRes.status === 429) {
    const retryAfter = parseInt(createRes.headers.get("X-Ratelimit-Retry") ?? "60", 10) || 60
    await setWbCooldownUntil("analytics", retryAfter).catch(() => {})
    throw new Error(`STOCK_HISTORY_DAILY_CSV create → 429 (retry-after ${retryAfter}с)`)
  }
  if (!createRes.ok) {
    const text = await createRes.text()
    console.error(`[bootstrap-balance-snapshot] STOCK_HISTORY_DAILY_CSV create ошибка ${createRes.status}: ${text}`)
    throw new Error(
      `STOCK_HISTORY_DAILY_CSV endpoint вернул ${createRes.status} — endpoint не подтверждён, переключитесь на --mode=fallback`
    )
  }

  // 2. Poll статуса (до 30 сек) — паттерн lib/wb-api.ts:fetchBuyoutPercent (строки ~317-332)
  let ready = false
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise((r) => setTimeout(r, 3000))
    const statusRes = await fetch(
      `https://seller-analytics-api.wildberries.ru/api/v2/nm-report/downloads?downloadId=${id}`,
      { headers: { Authorization: token } }
    )
    if (!statusRes.ok) continue
    const statusData = await statusRes.json()
    const report = (statusData.data ?? []).find((r: { id: string }) => r.id === id)
    if (report?.status === "SUCCESS") {
      ready = true
      break
    }
    if (report?.status === "FAILED" || report?.status === "ERROR") {
      throw new Error(`STOCK_HISTORY_DAILY_CSV report status=${report.status}`)
    }
  }

  if (!ready) {
    throw new Error("STOCK_HISTORY_DAILY_CSV report не готов за 30 сек — переключитесь на --mode=fallback")
  }

  // 3. Скачиваем ZIP → CSV (паттерн lib/wb-api.ts:fetchBuyoutPercent строки ~340-362:
  // текстовый поиск CSV-заголовка внутри декодированных ZIP-байтов, без полноценной
  // распаковки — работает для однофайловых store-ZIP отчётов WB в практике проекта).
  const fileRes = await fetch(
    `https://seller-analytics-api.wildberries.ru/api/v2/nm-report/downloads/file/${id}`,
    { headers: { Authorization: token } }
  )
  if (!fileRes.ok) {
    throw new Error(`STOCK_HISTORY_DAILY_CSV download ошибка ${fileRes.status}`)
  }

  const zipBuffer = await fileRes.arrayBuffer()
  const bytes = new Uint8Array(zipBuffer)
  const text = new TextDecoder().decode(bytes)
  const lines = text.split(/\r?\n/)
  const headerLineIdx = lines.findIndex((l) => /nm[_]?id/i.test(l))
  if (headerLineIdx === -1) {
    throw new Error("STOCK_HISTORY_DAILY_CSV: CSV-заголовок (колонка nmId) не найден внутри ZIP-ответа")
  }
  const csvText = lines.slice(headerLineIdx).join("\n").split("\x00")[0]

  const parsed = parseStockHistoryCsv(csvText)
  if (parsed.size === 0) {
    throw new Error("STOCK_HISTORY_DAILY_CSV: CSV распознан, но 0 строк с валидным nmId/qty")
  }
  return parsed
}

async function main() {
  const { date, mode } = parseCliArgs(process.argv.slice(2))
  const snapshotDate = new Date(date)
  if (isNaN(snapshotDate.getTime())) {
    console.error(`Некорректная дата: "${date}" (ожидается YYYY-MM-DD)`)
    process.exit(1)
  }

  console.log(`Bootstrap снапшота баланса: date=${date} mode=${mode}`)
  const warnings: string[] = [
    "Иваново — приближение (текущее Product.ivanovoStock, история склада не хранится)",
    "Себестоимость — текущая ProductCost.costPrice (D-10, истории нет; «Пересчитать дату» переоценит qty×costPrice)",
    "Дебиторка WB (FinanceReceivablesSnapshot) на bootstrap-дату НЕ создаётся — Balance API отдаёт только «сейчас» (D-14)",
  ]

  // Товары + nmIds (паттерн lib/finance-snapshot.ts:runFinanceSnapshot шаг 1)
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      sku: true,
      name: true,
      ivanovoStock: true,
      cost: { select: { costPrice: true } },
      articles: { select: { article: true, marketplace: { select: { name: true } } } },
    },
  })

  const productInputs: StockSnapshotProductInput[] = products.map((p) => {
    const nmIds: number[] = []
    for (const a of p.articles) {
      if (a.marketplace.name.toLowerCase() !== "wb") continue
      const nmId = parseInt(a.article, 10)
      if (!isNaN(nmId)) nmIds.push(nmId)
    }
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      ivanovoStock: p.ivanovoStock,
      costPrice: p.cost?.costPrice ?? null,
      nmIds,
    }
  })

  const allNmIds = [...new Set(productInputs.flatMap((p) => p.nmIds))]
  const currentWbCards =
    allNmIds.length > 0
      ? await prisma.wbCard.findMany({
          where: { nmId: { in: allNmIds } },
          select: { nmId: true, stockQty: true, inWayToClient: true, inWayFromClient: true },
        })
      : []
  const currentByNmId = new Map(currentWbCards.map((c) => [c.nmId, c]))

  let wbCardsByNmId: Map<number, WbCardStockInput>

  if (mode === "csv") {
    warnings.push(
      "«В пути к/от клиента» — приближение (текущие WbCard.inWayToClient/inWayFromClient, истории нет ни в одном режиме)"
    )
    let stockHistoryMap: Map<number, number>
    try {
      stockHistoryMap = await fetchStockHistoryDailyCsv(date)
    } catch (e) {
      console.error(
        `[bootstrap-balance-snapshot] STOCK_HISTORY_DAILY_CSV недоступен: ${e instanceof Error ? e.message : String(e)}`
      )
      console.error("Переключитесь на: npx tsx scripts/bootstrap-balance-snapshot.ts --mode=fallback")
      await prisma.$disconnect()
      process.exit(2)
      return
    }

    wbCardsByNmId = new Map()
    for (const nmId of allNmIds) {
      const current = currentByNmId.get(nmId)
      wbCardsByNmId.set(nmId, {
        stockQty: stockHistoryMap.get(nmId) ?? 0,
        inWayToClient: current?.inWayToClient ?? 0,
        inWayFromClient: current?.inWayFromClient ?? 0,
      })
    }
  } else {
    warnings.push(
      `BOOTSTRAP-ПРИБЛИЖЕНИЕ: остатки WB_WAREHOUSE и «в пути» на ${date} = текущее состояние (fallback режим)`
    )
    wbCardsByNmId = currentByNmId
  }

  const rows = computeStockSnapshotRows(productInputs, wbCardsByNmId)

  // Идемпотентность: deleteMany({date}) + createMany в одной транзакции — повторный запуск
  // на ту же дату не задваивает строки.
  // prisma.financeReceivablesSnapshot НЕ вызывается здесь (см. warnings выше + шапка файла).
  await prisma.$transaction([
    prisma.financeStockSnapshot.deleteMany({ where: { date: snapshotDate } }),
    prisma.financeStockSnapshot.createMany({
      data: rows.map((r) => ({ ...r, date: snapshotDate })),
    }),
  ])

  for (const w of warnings) console.warn(`⚠  ${w}`)
  console.log(JSON.stringify({ date, mode, stockRows: rows.length, warnings }, null, 2))
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
