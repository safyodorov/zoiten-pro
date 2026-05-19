// app/api/cron/wb-adv-sync/route.ts
// Phase 19 Wave 4: Daily cron оркестрация WB Advert sync.
// По умолч. 03:00 МСК через dispatcher. Защищён x-cron-secret.
// Pure orchestration вынесена в lib/wb-adv-sync.ts (Next.js 15 не разрешает
// дополнительные exports из route.ts).

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { runAdvSync, DAILY_DELTA_DAYS } from "@/lib/wb-adv-sync"
import { WbRateLimitError } from "@/lib/wb-api"
import { getMskTodayString } from "@/lib/wb-cron-schedule"

export const runtime = "nodejs"
export const maxDuration = 600

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("x-cron-secret")
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }
  try {
    console.log(`[wb-adv-sync cron] start`)
    const result = await runAdvSync(DAILY_DELTA_DAYS)
    console.log(`[wb-adv-sync cron] done`, result)
    const todayStr = getMskTodayString()
    await prisma.appSetting.upsert({
      where: { key: "wbAdvSyncLastRun" },
      create: { key: "wbAdvSyncLastRun", value: todayStr },
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
    console.error("[wb-adv-sync cron] error:", err)
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    )
  }
}
