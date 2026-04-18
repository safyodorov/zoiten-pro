// GET /api/cron/support-sync-returns — cron синхронизация только возвратов (15 мин).
// Отделён от support-sync-reviews чтобы не превышать Next.js maxDuration при 2500+ feedbacks.
// Защищён x-cron-secret.
import { NextRequest, NextResponse } from "next/server"
import { syncReturns } from "@/lib/support-sync"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("x-cron-secret")
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }
  try {
    const returns = await syncReturns()
    return NextResponse.json({ ok: true, returns })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка синхронизации возвратов"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
