// Phase 19+ 2026-05-20: Manual backfill истории затрат /adv/v1/upd.
// x-cron-secret guard. POST-only. days=1..31.

import { NextRequest, NextResponse } from "next/server"
import { runAdvUpdSync } from "@/lib/wb-adv-upd-sync"
import { WbRateLimitError } from "@/lib/wb-api"

export const runtime = "nodejs"
export const maxDuration = 120

const MAX_DAYS = 31

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
    console.log(`[wb-adv-upd-backfill] start days=${days}`)
    const result = await runAdvUpdSync(days)
    console.log(`[wb-adv-upd-backfill] done`, result)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof WbRateLimitError) {
      return NextResponse.json(
        { ok: false, error: "rate-limit", retryAfterSec: err.retryAfterSec },
        { status: 429 },
      )
    }
    console.error("[wb-adv-upd-backfill] error:", err)
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    )
  }
}
