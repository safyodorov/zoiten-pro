// POST /api/support-sync — ручная синхронизация WB Feedbacks+Questions.
// Требует SUPPORT + MANAGE. Делегирует в lib/support-sync.ts syncSupport().

import { NextResponse } from "next/server"
import { requireSection } from "@/lib/rbac"
import { syncSupport } from "@/lib/support-sync"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(): Promise<NextResponse> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    const result = await syncSupport({ isAnswered: false })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка синхронизации"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
