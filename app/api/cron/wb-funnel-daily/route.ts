// app/api/cron/wb-funnel-daily/route.ts
// Quick 260519-funnel: daily cron (по умолчанию 04:00 МСК через dispatcher).
// Скачивает WB Analytics Funnel report за rolling N дней (по умолчанию 7),
// upsert в WbCardFunnelDaily.
// Защищён x-cron-secret. Auto-backfill 30 дней при пустой таблице.
// Источник лимитов: 3 reports/day (общий counter wbAnalyticsDailyCounter).

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  fetchFunnelDaily,
  upsertFunnelDaily,
  WbAnalyticsCapError,
} from "@/lib/wb-funnel-api"
import { getMskTodayString } from "@/lib/wb-cron-schedule"

export const runtime = "nodejs"
export const maxDuration = 600

const DAILY_ROLLING_DAYS = 7
const BACKFILL_DAYS = 30

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }

  try {
    const existing = await prisma.wbCardFunnelDaily.count()
    const days = existing === 0 ? BACKFILL_DAYS : DAILY_ROLLING_DAYS
    const mode: "backfill" | "delta" = existing === 0 ? "backfill" : "delta"

    const cards = await prisma.wbCard.findMany({
      where: { deletedAt: null },
      select: { nmId: true },
    })
    const nmIds = cards.map(c => c.nmId)
    if (nmIds.length === 0) {
      return NextResponse.json({ ok: true, mode, rows: 0, message: "no active cards" })
    }

    const endDate = todayMskString()
    const startDate = mskDateMinusDays(days)

    console.log(
      `[wb-funnel-daily cron] start mode=${mode} nmIds=${nmIds.length} period=${startDate}..${endDate}`,
    )
    const rows = await fetchFunnelDaily(nmIds, startDate, endDate)
    const { upserted } = await upsertFunnelDaily(rows)
    console.log(
      `[wb-funnel-daily cron] done fetched=${rows.length} upserted=${upserted}`,
    )

    const todayStr = getMskTodayString()
    await prisma.appSetting.upsert({
      where: { key: "wbFunnelDailyLastRun" },
      create: { key: "wbFunnelDailyLastRun", value: todayStr },
      update: { value: todayStr },
    })

    return NextResponse.json({
      ok: true,
      mode,
      windowDays: days,
      nmIds: nmIds.length,
      period: { startDate, endDate },
      rowsFetched: rows.length,
      upserted,
    })
  } catch (err) {
    if (err instanceof WbAnalyticsCapError) {
      console.warn(`[wb-funnel-daily cron] cap reached: ${err.current}/${err.max}`)
      return NextResponse.json(
        { ok: false, error: "analytics-cap-reached", current: err.current, max: err.max },
        { status: 429 },
      )
    }
    console.error("[wb-funnel-daily cron] error:", err)
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
