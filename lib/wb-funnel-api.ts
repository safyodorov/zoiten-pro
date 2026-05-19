// lib/wb-funnel-api.ts
// Quick 260519-funnel: WB Analytics Funnel daily per nmId per day.
// Источник — POST /api/v2/nm-report/downloads с reportType="DETAIL_HISTORY_REPORT"
// (3-фазный async: create task → poll status → download ZIP/CSV).
// Это полные funnel-метрики (openCard/addToCart/orders/buyouts/cancels +
// conversions) — то, что показывается в WB cabinet «Аналитика → По дням».
//
// NOTE про лимиты Analytics API:
//   - 3 reports/day max per WB token (по wbAnalyticsDailyCounter в AppSetting).
//   - Counter общий с fetchBuyoutPercent (lib/wb-api.ts). Если хватает,
//     можно даже отказаться от fetchBuyoutPercent — Funnel содержит те же поля.
//   - Create endpoint лимит 1 req/min (см. .planning/research/wb-api-rate-limits-2026-05-12.md).

import { prisma } from "@/lib/prisma"
import { getWbToken } from "@/lib/wb-token"

const ANALYTICS_DAILY_MAX = 3

/** Проверяет дневной лимит Analytics API. Возвращает canRun=false если исчерпан.
 *  Идемпотентно использует AppSetting('wbAnalyticsDailyCounter') {date,count}.
 *  Логика дублирует lib/wb-api.ts:checkAndIncrementAnalyticsCounter — todo:
 *  вынести в общий модуль `lib/wb-analytics-cap.ts` отдельным рефакторингом.
 */
async function checkAndIncrementAnalyticsCounter(): Promise<{
  canRun: boolean
  current: number
  max: number
}> {
  const today = new Date().toISOString().split("T")[0]
  const setting = await prisma.appSetting.findUnique({
    where: { key: "wbAnalyticsDailyCounter" },
  })
  let data: { date: string; count: number } = { date: today, count: 0 }
  if (setting) {
    try {
      const parsed = JSON.parse(setting.value)
      if (parsed.date === today && typeof parsed.count === "number") {
        data = parsed
      }
    } catch {}
  }
  if (data.count >= ANALYTICS_DAILY_MAX) {
    return { canRun: false, current: data.count, max: ANALYTICS_DAILY_MAX }
  }
  data.count++
  await prisma.appSetting.upsert({
    where: { key: "wbAnalyticsDailyCounter" },
    create: { key: "wbAnalyticsDailyCounter", value: JSON.stringify(data) },
    update: { value: JSON.stringify(data) },
  })
  return { canRun: true, current: data.count, max: ANALYTICS_DAILY_MAX }
}

export interface FunnelDailyRow {
  nmId: number
  date: Date // 00:00 UTC соответствующее MSK date (Prisma @db.Date нормализует)
  openCardCount: number
  addToCartCount: number
  ordersCount: number
  ordersSumRub: number
  buyoutsCount: number
  buyoutsSumRub: number
  cancelCount: number
  cancelSumRub: number
  addToCartConversion: number | null
  cartToOrderConversion: number | null
  buyoutPercent: number | null
}

export class WbAnalyticsCapError extends Error {
  current: number
  max: number
  constructor(current: number, max: number) {
    super(`WB Analytics дневной лимит исчерпан: ${current}/${max} reports`)
    this.current = current
    this.max = max
    this.name = "WbAnalyticsCapError"
  }
}

/** Скачивает Funnel CSV через async /downloads, парсит, возвращает плоский массив строк.
 *  startDate / endDate — формат "YYYY-MM-DD" (MSK).
 *  Все nmIds в одном запросе, period до 31 дня.
 *  Throws WbAnalyticsCapError если дневной cap исчерпан (не вызывает WB).
 *  Throws Error при сетевых/парсинг ошибках.
 */
export async function fetchFunnelDaily(
  nmIds: number[],
  startDate: string,
  endDate: string,
): Promise<FunnelDailyRow[]> {
  if (nmIds.length === 0) return []

  const cap = await checkAndIncrementAnalyticsCounter()
  if (!cap.canRun) {
    throw new WbAnalyticsCapError(cap.current, cap.max)
  }

  const token = await getWbToken("WB_API_TOKEN")
  const id = crypto.randomUUID()

  // ── Phase 1: create task ────────────────────────────────────────
  const createRes = await fetch(
    "https://seller-analytics-api.wildberries.ru/api/v2/nm-report/downloads",
    {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        reportType: "DETAIL_HISTORY_REPORT",
        params: { nmIDs: nmIds, startDate, endDate },
      }),
    },
  )
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => "")
    throw new Error(`Funnel create task ${createRes.status}: ${text}`)
  }

  // ── Phase 2: poll status (max ~60 sec) ──────────────────────────
  let ready = false
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise(r => setTimeout(r, 3000))
    const statusRes = await fetch(
      `https://seller-analytics-api.wildberries.ru/api/v2/nm-report/downloads?downloadId=${id}`,
      { headers: { Authorization: token } },
    )
    if (!statusRes.ok) continue
    const statusData = await statusRes.json()
    const report = (statusData.data ?? []).find(
      (r: { id: string }) => r.id === id,
    )
    if (report?.status === "SUCCESS") {
      ready = true
      break
    }
    if (report?.status === "ERROR" || report?.status === "FAILED") {
      throw new Error(`Funnel task failed: status=${report.status}`)
    }
  }
  if (!ready) {
    throw new Error("Funnel task not ready after 60 sec polling")
  }

  // ── Phase 3: download ZIP/CSV ───────────────────────────────────
  const fileRes = await fetch(
    `https://seller-analytics-api.wildberries.ru/api/v2/nm-report/downloads/file/${id}`,
    { headers: { Authorization: token } },
  )
  if (!fileRes.ok) {
    throw new Error(`Funnel download ${fileRes.status}`)
  }

  const buf = await fileRes.arrayBuffer()
  const bytes = new Uint8Array(buf)
  const raw = new TextDecoder("utf-8").decode(bytes)

  // WB иногда возвращает plain CSV, иногда ZIP-обёртку. Ищем CSV-заголовок.
  const headerMark = "nmID,dt,"
  const csvStart = raw.indexOf(headerMark)
  if (csvStart === -1) {
    throw new Error("Funnel CSV header not found in response (corrupted ZIP?)")
  }
  // Отрезаем мусор после CSV (ZIP footer + null bytes)
  const csvBody = raw.slice(csvStart).split(/\x00|\x50\x4b\x01\x02/)[0]

  // ── Парсим CSV ──────────────────────────────────────────────────
  // ВАЖНО: WB CSV содержит quoted fields с запятой как decimal separator
  // (например `"14,00"` для процентов). Naive split(",") сломается на них.
  // Используем mini-CSV-parser с поддержкой "..." quoting.
  const lines = csvBody.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const rows: FunnelDailyRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    // Format: nmID,dt,openCardCount,addToCartCount,ordersCount,ordersSumRub,
    //         buyoutsCount,buyoutsSumRub,cancelCount,cancelSumRub,
    //         addToCartConversion,cartToOrderConversion,buyoutPercent
    if (cols.length < 13) continue
    const nmId = parseInt(cols[0], 10)
    const dt = cols[1].trim() // "YYYY-MM-DD"
    if (!nmId || !/^\d{4}-\d{2}-\d{2}$/.test(dt)) continue
    rows.push({
      nmId,
      date: new Date(dt), // 00:00 UTC, Prisma @db.Date нормализует
      openCardCount: parseInt(cols[2], 10) || 0,
      addToCartCount: parseInt(cols[3], 10) || 0,
      ordersCount: parseInt(cols[4], 10) || 0,
      ordersSumRub: parseRussianFloat(cols[5]),
      buyoutsCount: parseInt(cols[6], 10) || 0,
      buyoutsSumRub: parseRussianFloat(cols[7]),
      cancelCount: parseInt(cols[8], 10) || 0,
      cancelSumRub: parseRussianFloat(cols[9]),
      addToCartConversion: parseNullableFloat(cols[10]),
      cartToOrderConversion: parseNullableFloat(cols[11]),
      buyoutPercent: parseNullableFloat(cols[12]),
    })
  }
  return rows
}

/** Mini-CSV-parser: разбивает строку с поддержкой "..." quoting (двойные кавычки экранируются "").
 *  Не покрывает edge cases (multi-line quoted fields) — WB их не возвращает. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        inQuote = false
      } else {
        cur += ch
      }
    } else {
      if (ch === '"') {
        inQuote = true
      } else if (ch === ",") {
        out.push(cur)
        cur = ""
      } else {
        cur += ch
      }
    }
  }
  out.push(cur)
  return out
}

/** WB Russian decimal: comma → dot, parseFloat. Возвращает 0 при невалидном. */
function parseRussianFloat(s: string): number {
  const v = parseFloat((s ?? "").trim().replace(",", "."))
  return Number.isFinite(v) ? v : 0
}

function parseNullableFloat(s: string): number | null {
  const trimmed = (s ?? "").trim()
  if (!trimmed) return null
  const v = parseFloat(trimmed.replace(",", "."))
  if (!Number.isFinite(v)) return null
  // 0 в WB обычно значит "нет данных" для conversion/buyoutPercent
  return v === 0 ? null : v
}

/** Идемпотентный upsert строк в WbCardFunnelDaily.
 *  Чанки по 500 в транзакциях (callback variant с timeout). */
export async function upsertFunnelDaily(
  rows: FunnelDailyRow[],
): Promise<{ upserted: number }> {
  if (rows.length === 0) return { upserted: 0 }
  const CHUNK = 500
  let total = 0
  const totalChunks = Math.ceil(rows.length / CHUNK)
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const chunkIdx = Math.floor(i / CHUNK) + 1
    await prisma.$transaction(
      async tx => {
        for (const r of chunk) {
          await tx.wbCardFunnelDaily.upsert({
            where: { nmId_date: { nmId: r.nmId, date: r.date } },
            create: { ...r },
            update: { ...r },
          })
        }
      },
      { timeout: 90_000 },
    )
    total += chunk.length
    console.log(
      `[wb-funnel upsert] chunk=${chunkIdx}/${totalChunks} processed=${total}/${rows.length}`,
    )
  }
  return { upserted: total }
}
