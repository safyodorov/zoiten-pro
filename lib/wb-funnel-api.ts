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
  const bytes = Buffer.from(buf)

  // Diagnostic: сохраняем raw bytes для пост-mortem если парсинг сломается
  try {
    const fs = await import("node:fs/promises")
    await fs.writeFile("/tmp/funnel_raw_last.bin", bytes)
  } catch {}

  const csvBody = extractCsvFromResponse(bytes)
  if (!csvBody) {
    throw new Error(
      `Funnel CSV not found. Response head: ${bytes.subarray(0, 16).toString("hex")} size=${bytes.length}`,
    )
  }

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

/** Извлекает CSV из ответа WB download endpoint.
 *  WB возвращает ZIP в streaming-format (flag bit 3 — sizes в data descriptor
 *  ПОСЛЕ compressed data, не в local file header). Поэтому парсим через
 *  Central Directory record в конце файла — там надёжные размеры.
 *
 *  Sequence:
 *   1) Если bytes начинаются с CSV-заголовка → plain text, отдаём.
 *   2) Иначе ищем End-of-Central-Directory (EOCD, magic PK\x05\x06) от конца.
 *   3) EOCD даёт offset Central Directory.
 *   4) Central Directory File Header (PK\x01\x02) даёт:
 *      - compressed size (offset 20)
 *      - method (offset 10)
 *      - local header offset (offset 42)
 *   5) Skip local header (30 + nameLen + extraLen) → compressed data.
 *   6) Inflate если method=8, иначе bytes as-is.
 */
export function extractCsvFromResponse(bytes: Buffer): string | null {
  if (bytes.length < 30) return null

  // Сценарий 1: plain CSV
  const head = bytes.subarray(0, 10).toString("utf-8")
  if (head.startsWith("nmID,dt,") || head.startsWith('"nmID')) {
    return bytes.toString("utf-8")
  }

  // Сценарий 2: ZIP. Проверяем magic PK\x03\x04
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    return null
  }

  // Ищем End-of-Central-Directory (EOCD) record — magic PK\x05\x06, обычно в last 22 bytes.
  // Сканируем с конца файла (EOCD может иметь optional comment, поэтому не на фиксированном offset).
  const EOCD_SIG = Buffer.from([0x50, 0x4b, 0x05, 0x06])
  let eocdOffset = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (
      bytes[i] === EOCD_SIG[0] &&
      bytes[i + 1] === EOCD_SIG[1] &&
      bytes[i + 2] === EOCD_SIG[2] &&
      bytes[i + 3] === EOCD_SIG[3]
    ) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset === -1) return null

  // EOCD: offset 16 = Central Directory start offset (LE32)
  const cdOffset = bytes.readUInt32LE(eocdOffset + 16)
  if (cdOffset >= bytes.length - 46) return null

  // Central Directory File Header — magic PK\x01\x02
  if (
    bytes[cdOffset] !== 0x50 ||
    bytes[cdOffset + 1] !== 0x4b ||
    bytes[cdOffset + 2] !== 0x01 ||
    bytes[cdOffset + 3] !== 0x02
  ) {
    return null
  }

  // CD header layout (relevant fields):
  //   offset 10 : compression method (LE16)
  //   offset 20 : compressed size (LE32)
  //   offset 24 : uncompressed size (LE32)
  //   offset 28 : filename length (LE16)
  //   offset 30 : extra field length (LE16)
  //   offset 32 : comment length (LE16)
  //   offset 42 : local header offset (LE32)
  const method = bytes.readUInt16LE(cdOffset + 10)
  const compressedSize = bytes.readUInt32LE(cdOffset + 20)
  const localHeaderOffset = bytes.readUInt32LE(cdOffset + 42)

  // Парсим local file header чтобы пропустить filename+extra и найти data start
  if (
    bytes[localHeaderOffset] !== 0x50 ||
    bytes[localHeaderOffset + 1] !== 0x4b ||
    bytes[localHeaderOffset + 2] !== 0x03 ||
    bytes[localHeaderOffset + 3] !== 0x04
  ) {
    return null
  }
  const lfhNameLen = bytes.readUInt16LE(localHeaderOffset + 26)
  const lfhExtraLen = bytes.readUInt16LE(localHeaderOffset + 28)
  const dataStart = localHeaderOffset + 30 + lfhNameLen + lfhExtraLen
  const compressedData = bytes.subarray(dataStart, dataStart + compressedSize)

  if (method === 0) {
    return compressedData.toString("utf-8")
  }
  if (method === 8) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { inflateRawSync } = require("node:zlib") as typeof import("node:zlib")
    const decompressed = inflateRawSync(compressedData)
    return decompressed.toString("utf-8")
  }
  return null
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
