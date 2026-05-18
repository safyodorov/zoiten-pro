// app/api/wb-orders-backfill/route.ts
// POST /api/wb-orders-backfill — ручной re-run backfill с 2026-04-01.
// Защищён dual-gate: x-cron-secret HEADER ИЛИ requireSection("PRODUCTS", "MANAGE").
// 2026-05-15 (quick 260515-phv): добавлен x-cron-secret гейт — orchestrator curl
// с VPS shell не имеет браузерной сессии, но знает CRON_SECRET из /etc/zoiten.pro.env.
// B-1 fix: ERP_SECTION enum НЕ содержит "CARDS" — все /cards/wb actions использует "PRODUCTS"
// (см. app/actions/wb-cards.ts).
// W-3 fix: maxDuration=600 (backfill 45 дней может занять до 1-2 мин из-за rate limit).
//
// quick 260518-igw: добавлен query param ?days=N для targeted backfill последних N дней.
// Без параметра — backfill с BACKFILL_START (2026-04-01). С ?days=N — dateFrom = today MSK - N days.
// Используется после fix orders sync bug (rolling 7-day daily cron) чтобы быстро
// довосстановить последние дни без длинного full re-sweep.

import { NextResponse, type NextRequest } from "next/server"
import { requireSection } from "@/lib/rbac"
import {
  fetchOrdersForRange,
  upsertOrdersDaily,
  WbRateLimitError,
} from "@/lib/wb-api"
import { getMskTodayDate } from "@/lib/wb-orders-chart"

export const runtime = "nodejs"
export const maxDuration = 600

const BACKFILL_START = new Date("2026-04-01T00:00:00")
const MAX_DAYS = 365

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Dual-gate: x-cron-secret header (для orchestrator curl) ИЛИ RBAC сессия (для UI button).
  const cronSecret = req.headers.get("x-cron-secret")
  const isCronAuth = Boolean(
    cronSecret && process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET,
  )

  if (!isCronAuth) {
    try {
      await requireSection("PRODUCTS", "MANAGE")
    } catch {
      return NextResponse.json({ error: "Нет прав" }, { status: 403 })
    }
  }

  // quick 260518-igw: parse ?days=N (1..365). NaN / out-of-range → ignore, fallback на BACKFILL_START.
  const url = new URL(req.url)
  const daysParam = url.searchParams.get("days")
  const daysParsed = daysParam != null ? parseInt(daysParam, 10) : NaN
  const days =
    Number.isFinite(daysParsed) && daysParsed >= 1 && daysParsed <= MAX_DAYS
      ? daysParsed
      : null

  let dateFrom: Date
  if (days != null) {
    const today = getMskTodayDate()
    dateFrom = new Date(today.getTime() - days * 24 * 3600_000)
  } else {
    dateFrom = BACKFILL_START
  }

  try {
    console.log(
      `[wb-orders-backfill] start dateFrom=${dateFrom.toISOString()} days=${days ?? "all"} auth=${isCronAuth ? "cron-secret" : "rbac"}`,
    )
    const rows = await fetchOrdersForRange(dateFrom)
    const { upserted } = await upsertOrdersDaily(rows)
    console.log(
      `[wb-orders-backfill] done fetched=${rows.length} upserted=${upserted}`,
    )
    return NextResponse.json({
      ok: true,
      dateFrom: dateFrom.toISOString(),
      days,
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
    console.error("[wb-orders-backfill] error:", err)
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    )
  }
}
