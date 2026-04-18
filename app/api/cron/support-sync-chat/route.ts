// GET /api/cron/support-sync-chat — cron синхронизация чата (5 мин, Phase 10).
// Защищён x-cron-secret. Вызывает syncChats() + runAutoReplies() последовательно.
import { NextRequest, NextResponse } from "next/server"
import { syncChats } from "@/lib/support-sync"
import { runAutoReplies } from "@/lib/auto-reply"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("x-cron-secret")
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }
  try {
    const chat = await syncChats()
    const autoReply = await runAutoReplies()
    return NextResponse.json({ ok: true, chat, autoReply })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка синхронизации чата"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
