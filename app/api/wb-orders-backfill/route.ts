// app/api/wb-orders-backfill/route.ts
// POST /api/wb-orders-backfill — ручной re-run backfill с 2026-04-01.
// Защищён сессией + requireSection("PRODUCTS", "MANAGE").
// B-1 fix: ERP_SECTION enum НЕ содержит "CARDS" — все /cards/wb actions использует "PRODUCTS"
// (см. app/actions/wb-cards.ts).
// W-3 fix: maxDuration=600 (backfill 45 дней может занять до 1-2 мин из-за rate limit).

import { NextResponse } from "next/server"
import { requireSection } from "@/lib/rbac"
import {
  fetchOrdersForRange,
  upsertOrdersDaily,
  WbRateLimitError,
} from "@/lib/wb-api"

export const runtime = "nodejs"
export const maxDuration = 600

const BACKFILL_START = new Date("2026-04-01T00:00:00")

export async function POST(): Promise<NextResponse> {
  try {
    await requireSection("PRODUCTS", "MANAGE")
  } catch {
    return NextResponse.json({ error: "Нет прав" }, { status: 403 })
  }

  try {
    console.log(
      `[wb-orders-backfill] start dateFrom=${BACKFILL_START.toISOString()}`,
    )
    const rows = await fetchOrdersForRange(BACKFILL_START)
    const { upserted } = await upsertOrdersDaily(rows)
    console.log(
      `[wb-orders-backfill] done fetched=${rows.length} upserted=${upserted}`,
    )
    return NextResponse.json({
      ok: true,
      dateFrom: BACKFILL_START.toISOString(),
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
