// app/api/wb-funnel-backfill/route.ts
// Ручной backfill funnel за произвольный диапазон дат (from, to).
// Поддерживает также legacy-параметр days (обратная совместимость).
// Диапазоны > 31 дня автоматически разбиваются на чанки ≤31 дня
// (fetchFunnelDaily окно ≤31д; каждый чанк расходует 1 Analytics report из cap 3/день).
// Защищён dual-gate: x-cron-secret HEADER ИЛИ requireSection("PRODUCTS", "MANAGE").

import { NextResponse, type NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import {
  fetchFunnelDaily,
  upsertFunnelDaily,
  WbAnalyticsCapError,
} from "@/lib/wb-funnel-api"

export const runtime = "nodejs"
export const maxDuration = 600

// Максимальный размер чанка (fetchFunnelDaily ограничение WB ≤31д)
const CHUNK_DAYS = 31

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cronSecret = req.headers.get("x-cron-secret")
  const isCronAuth = Boolean(
    cronSecret && process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET,
  )
  if (!isCronAuth) {
    try {
      await requireSection("PRODUCTS", "MANAGE")
    } catch {
      return NextResponse.json({ error: "Нет прав" }, { status: 403 })
    }
  }

  const url = new URL(req.url)

  // Определение диапазона: from/to (явные даты) или days (legacy, от today)
  const fromParam = url.searchParams.get("from")
  const toParam = url.searchParams.get("to")
  const daysParam = url.searchParams.get("days")

  const todayStr = todayMskString()
  let startDate: string
  let endDate: string

  if (fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam)) {
    startDate = fromParam
    endDate =
      toParam && /^\d{4}-\d{2}-\d{2}$/.test(toParam) ? toParam : todayStr
  } else {
    // Legacy: days=N (без явного лимита — принимаем любое значение ≥ 1)
    const daysParsed = daysParam != null ? parseInt(daysParam, 10) : NaN
    const days = Number.isFinite(daysParsed) && daysParsed >= 1 ? daysParsed : 30
    startDate = mskDateMinusDays(days)
    endDate = todayStr
  }

  // Защита: startDate не позже endDate
  if (startDate > endDate) {
    return NextResponse.json(
      { ok: false, error: `from(${startDate}) > to(${endDate})` },
      { status: 400 },
    )
  }

  const cards = await prisma.wbCard.findMany({
    where: { deletedAt: null },
    select: { nmId: true },
  })
  const nmIds = cards.map(c => c.nmId)
  if (nmIds.length === 0) {
    return NextResponse.json({ ok: true, rows: 0, message: "no active cards" })
  }

  // Разбивка на чанки ≤31 дня
  const chunks = buildDateChunks(startDate, endDate, CHUNK_DAYS)

  let totalFetched = 0
  let totalUpserted = 0
  const chunkResults: Array<{ from: string; to: string; fetched: number; upserted: number }> = []

  try {
    console.log(
      `[wb-funnel-backfill] start nmIds=${nmIds.length} period=${startDate}..${endDate} chunks=${chunks.length} auth=${isCronAuth ? "cron-secret" : "rbac"}`,
    )

    for (const chunk of chunks) {
      const rows = await fetchFunnelDaily(nmIds, chunk.from, chunk.to)
      const { upserted } = await upsertFunnelDaily(rows)
      totalFetched += rows.length
      totalUpserted += upserted
      chunkResults.push({ from: chunk.from, to: chunk.to, fetched: rows.length, upserted })
      console.log(
        `[wb-funnel-backfill] chunk ${chunk.from}..${chunk.to} fetched=${rows.length} upserted=${upserted}`,
      )
    }

    console.log(
      `[wb-funnel-backfill] done totalFetched=${totalFetched} totalUpserted=${totalUpserted}`,
    )

    return NextResponse.json({
      ok: true,
      nmIds: nmIds.length,
      period: { startDate, endDate },
      chunks: chunkResults,
      rowsFetched: totalFetched,
      upserted: totalUpserted,
    })
  } catch (err) {
    if (err instanceof WbAnalyticsCapError) {
      return NextResponse.json(
        {
          ok: false,
          error: "analytics-cap-reached",
          current: err.current,
          max: err.max,
          partialChunks: chunkResults,
        },
        { status: 429 },
      )
    }
    console.error("[wb-funnel-backfill] error:", err)
    return NextResponse.json(
      { ok: false, error: (err as Error).message, partialChunks: chunkResults },
      { status: 500 },
    )
  }
}

/** Разбивает диапазон [from, to] на чанки размером не более maxDays дней. */
function buildDateChunks(
  from: string,
  to: string,
  maxDays: number,
): Array<{ from: string; to: string }> {
  const chunks: Array<{ from: string; to: string }> = []
  let cur = from
  while (cur <= to) {
    const chunkEnd = addDays(cur, maxDays - 1)
    chunks.push({ from: cur, to: chunkEnd > to ? to : chunkEnd })
    cur = addDays(chunkEnd > to ? to : chunkEnd, 1)
    if (chunkEnd >= to) break
  }
  return chunks
}

function todayMskString(): string {
  const ms = Date.now() + 3 * 3600_000
  return new Date(ms).toISOString().split("T")[0]
}

function mskDateMinusDays(days: number): string {
  const ms = Date.now() + 3 * 3600_000 - days * 24 * 3600_000
  return new Date(ms).toISOString().split("T")[0]
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().split("T")[0]
}
