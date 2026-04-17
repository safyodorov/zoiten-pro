// GET /api/cron/support-sync-reviews — cron синхронизация отзывов/вопросов (15 мин).
// Защищён заголовком x-cron-secret (пример: см. app/api/cron/purge-deleted/route.ts).

import { NextRequest, NextResponse } from "next/server"
import { syncSupport } from "@/lib/support-sync"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("x-cron-secret")
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }
  try {
    const result = await syncSupport({ isAnswered: false })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка синхронизации"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
