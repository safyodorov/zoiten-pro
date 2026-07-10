// app/api/wb-realization-sync/route.ts
// W1 (quick 260710-jgs): POST — импорт отчёта реализации WB выбранной недели
// (clean-replace в WbRealizationWeekly). Кнопка «Реализация WB» на /finance/weekly.
// RBAC: FINANCE MANAGE. Body: { week: "YYYY-MM-DD" } — нормализуется к
// ISO-понедельнику UTC. Образец MANAGE-sync-route: wb-promotions-sync.
// maxDuration 600 — rate limit sales-reports 1 req/мин → импорт занимает минуты.

import { NextRequest, NextResponse } from "next/server"
import { requireSection } from "@/lib/rbac"
import { WbRateLimitError } from "@/lib/wb-api"
import { syncRealizationWeek } from "@/lib/wb-realization-sync"

export const runtime = "nodejs"
export const maxDuration = 600

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Нормализует произвольную ISO-дату к её ISO-понедельнику (UTC). */
function normalizeToIsoMonday(iso: string): string {
  const d = new Date(iso + "T00:00:00Z")
  const jsDay = d.getUTCDay() // 0=вс, 1=пн
  const isoDay = jsDay === 0 ? 7 : jsDay
  d.setUTCDate(d.getUTCDate() - (isoDay - 1))
  return d.toISOString().slice(0, 10)
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // RBAC: write action → требуется MANAGE
  try {
    await requireSection("FINANCE", "MANAGE")
  } catch {
    return NextResponse.json(
      { error: "Недостаточно прав для импорта отчёта реализации" },
      { status: 403 },
    )
  }

  let week: unknown
  try {
    const body = (await req.json()) as { week?: unknown }
    week = body?.week
  } catch {
    return NextResponse.json({ error: "Некорректное тело запроса" }, { status: 400 })
  }
  if (typeof week !== "string" || !ISO_DATE_RE.test(week)) {
    return NextResponse.json(
      { error: 'Ожидается body { week: "YYYY-MM-DD" }' },
      { status: 400 },
    )
  }

  const mondayISO = normalizeToIsoMonday(week)
  const weekStart = new Date(mondayISO + "T00:00:00Z")

  try {
    const result = await syncRealizationWeek(weekStart)
    return NextResponse.json({ ok: true, week: mondayISO, ...result })
  } catch (e) {
    if (e instanceof WbRateLimitError) {
      return NextResponse.json(
        { error: `WB Finance API rate limit, повторите через ${e.retryAfterSec} сек` },
        { status: 429 },
      )
    }
    console.error("[wb-realization-sync] error:", e)
    return NextResponse.json(
      { error: (e as Error).message || "Ошибка импорта отчёта реализации" },
      { status: 500 },
    )
  }
}
