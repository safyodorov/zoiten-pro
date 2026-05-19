// app/api/wb-adv-backfill/route.ts
// Phase 19 Wave 4: Manual backfill WB Advert sync за окно N дней (1..30).
// x-cron-secret guard. POST-only (никакого GET alias — backfill пишет в БД).

import { NextRequest, NextResponse } from "next/server"
import { runAdvSync } from "@/lib/wb-adv-sync"
import { WbRateLimitError } from "@/lib/wb-api"

export const runtime = "nodejs"
export const maxDuration = 600

const MAX_DAYS = 30

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("x-cron-secret")
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const daysParam = searchParams.get("days")
  const days = daysParam ? parseInt(daysParam, 10) : 7
  if (!Number.isFinite(days) || days < 1 || days > MAX_DAYS) {
    return NextResponse.json(
      { ok: false, error: `Параметр days должен быть целым числом 1..${MAX_DAYS}` },
      { status: 400 },
    )
  }
  try {
    console.log(`[wb-adv-backfill] start days=${days}`)
    const result = await runAdvSync(days)
    console.log(`[wb-adv-backfill] done`, result)
    return NextResponse.json({ ok: true, days, ...result })
  } catch (err) {
    if (err instanceof WbRateLimitError) {
      return NextResponse.json(
        { ok: false, error: "rate-limit", retryAfterSec: err.retryAfterSec },
        { status: 429 },
      )
    }
    console.error("[wb-adv-backfill] error:", err)
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    )
  }
}
