// app/api/cron/wb-orders-daily/route.ts
// GET /api/cron/wb-orders-daily — daily 05:00 МСК cron + auto-backfill при пустой таблице.
// Защищён x-cron-secret == process.env.CRON_SECRET. Per D-03 (CONTEXT.md).
// W-3 fix: maxDuration=600 (nginx уже до 600s — см. CLAUDE.md «WB Promotions Calendar API»).

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  fetchOrdersForRange,
  upsertOrdersDaily,
  WbRateLimitError,
} from "@/lib/wb-api"
import { getMskYesterdayDate } from "@/lib/wb-orders-chart"
import { getMskTodayString } from "@/lib/wb-cron-schedule"

export const runtime = "nodejs"
export const maxDuration = 600

const BACKFILL_START = new Date("2026-04-01T00:00:00")

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("x-cron-secret")
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }

  try {
    const existing = await prisma.wbCardOrdersDaily.count()
    let dateFrom: Date
    let mode: "backfill" | "delta"

    if (existing === 0) {
      // Первый запуск — backfill с 2026-04-01
      dateFrom = BACKFILL_START
      mode = "backfill"
    } else {
      // Daily delta — вчерашний день MSK 00:00 (W-4 fix: shared helper)
      dateFrom = getMskYesterdayDate()
      mode = "delta"
    }

    console.log(
      `[wb-orders-daily cron] start mode=${mode} dateFrom=${dateFrom.toISOString()}`,
    )
    const rows = await fetchOrdersForRange(dateFrom)
    const { upserted } = await upsertOrdersDaily(rows)
    console.log(
      `[wb-orders-daily cron] done mode=${mode} fetched=${rows.length} upserted=${upserted}`,
    )

    // 2026-05-15 (quick 260515-o4o): записываем lastRun marker для dispatcher idempotency.
    // Без этого dispatcher не узнает что orders уже отработал → будет fire дважды.
    const todayStr = getMskTodayString()
    await prisma.appSetting.upsert({
      where: { key: "wbOrdersDailyLastRun" },
      create: { key: "wbOrdersDailyLastRun", value: todayStr },
      update: { value: todayStr },
    })

    return NextResponse.json({
      ok: true,
      mode,
      dateFrom: dateFrom.toISOString(),
      rowsFetched: rows.length,
      upserted,
    })
  } catch (err) {
    if (err instanceof WbRateLimitError) {
      return NextResponse.json(
        { ok: false, error: "rate-limit", retryAfterSec: err.retryAfterSec },
        { status: 429 },
      )
    }
    console.error("[wb-orders-daily cron] error:", err)
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    )
  }
}
