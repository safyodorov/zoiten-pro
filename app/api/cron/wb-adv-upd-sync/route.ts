// Phase 19+ 2026-05-20: Daily cron для GET /adv/v1/upd (история списаний).
// По умолч. 03:30 МСК — через 30 мин после wb-adv-sync (03:00). Per-token
// hourly bucket независим для /upd vs /fullstats, можно ставить параллельно.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { runAdvUpdSync, DEFAULT_UPD_DAYS } from "@/lib/wb-adv-upd-sync"
import { WbRateLimitError } from "@/lib/wb-api"
import { getMskTodayString } from "@/lib/wb-cron-schedule"

export const runtime = "nodejs"
export const maxDuration = 120

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("x-cron-secret")
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }
  try {
    console.log(`[wb-adv-upd-sync cron] start`)
    const result = await runAdvUpdSync(DEFAULT_UPD_DAYS)
    console.log(`[wb-adv-upd-sync cron] done`, result)
    const todayStr = getMskTodayString()
    await prisma.appSetting.upsert({
      where: { key: "wbAdvUpdSyncLastRun" },
      create: { key: "wbAdvUpdSyncLastRun", value: todayStr },
      update: { value: todayStr },
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof WbRateLimitError) {
      return NextResponse.json(
        { ok: false, error: "rate-limit", retryAfterSec: err.retryAfterSec },
        { status: 429 },
      )
    }
    console.error("[wb-adv-upd-sync cron] error:", err)
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    )
  }
}
