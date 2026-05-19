// app/api/wb-funnel-backfill/route.ts
// Quick 260519-funnel: ручной backfill funnel за N дней (1..30).
// Защищён dual-gate: x-cron-secret HEADER ИЛИ requireSection("PRODUCTS", "MANAGE").
// 1 Analytics report = -1 от дневного cap (3/день общий).

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

const MAX_DAYS = 30

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
  const daysParam = url.searchParams.get("days")
  const daysParsed = daysParam != null ? parseInt(daysParam, 10) : NaN
  const days =
    Number.isFinite(daysParsed) && daysParsed >= 1 && daysParsed <= MAX_DAYS
      ? daysParsed
      : 30

  const cards = await prisma.wbCard.findMany({
    where: { deletedAt: null },
    select: { nmId: true },
  })
  const nmIds = cards.map(c => c.nmId)
  if (nmIds.length === 0) {
    return NextResponse.json({ ok: true, rows: 0, message: "no active cards" })
  }

  const endDate = todayMskString()
  const startDate = mskDateMinusDays(days)

  try {
    console.log(
      `[wb-funnel-backfill] start nmIds=${nmIds.length} period=${startDate}..${endDate} auth=${isCronAuth ? "cron-secret" : "rbac"}`,
    )
    const rows = await fetchFunnelDaily(nmIds, startDate, endDate)
    const { upserted } = await upsertFunnelDaily(rows)
    console.log(
      `[wb-funnel-backfill] done fetched=${rows.length} upserted=${upserted}`,
    )
    return NextResponse.json({
      ok: true,
      days,
      nmIds: nmIds.length,
      period: { startDate, endDate },
      rowsFetched: rows.length,
      upserted,
    })
  } catch (err) {
    if (err instanceof WbAnalyticsCapError) {
      return NextResponse.json(
        { ok: false, error: "analytics-cap-reached", current: err.current, max: err.max },
        { status: 429 },
      )
    }
    console.error("[wb-funnel-backfill] error:", err)
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    )
  }
}

function todayMskString(): string {
  const ms = Date.now() + 3 * 3600_000
  return new Date(ms).toISOString().split("T")[0]
}

function mskDateMinusDays(days: number): string {
  const ms = Date.now() + 3 * 3600_000 - days * 24 * 3600_000
  return new Date(ms).toISOString().split("T")[0]
}
