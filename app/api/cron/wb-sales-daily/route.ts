// app/api/cron/wb-sales-daily/route.ts
// Daily cron (~04:30 МСК через dispatcher). Тянет Statistics Sales API за rolling
// N дней (default 7, ?days=N 1..60 override для backfill), clean-replace per date-окно
// в WbSalesDaily (дневной факт выкупов по дате реализации). Защищён x-cron-secret.
// Quick 260705-f1p.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { fetchSalesDaily } from "@/lib/wb-api"
import { getMskTodayString } from "@/lib/wb-cron-schedule"

export const runtime = "nodejs"
export const maxDuration = 600

const DAILY_ROLLING_DAYS = 7
const BACKFILL_DAYS = 30

function mskDateMinusDays(days: number): string {
  return new Date(Date.now() + 3 * 3600_000 - days * 24 * 3600_000).toISOString().split("T")[0]
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }

  try {
    const existing = await prisma.wbSalesDaily.count()
    const url = new URL(req.url)
    const daysParam = Number(url.searchParams.get("days"))
    const override =
      Number.isFinite(daysParam) && daysParam >= 1 && daysParam <= 60
        ? Math.floor(daysParam)
        : null
    const days = override ?? (existing === 0 ? BACKFILL_DAYS : DAILY_ROLLING_DAYS)
    const mode: "backfill" | "delta" = override != null || existing === 0 ? "backfill" : "delta"

    const dateFrom = mskDateMinusDays(days)
    console.log(`[wb-sales-daily cron] start mode=${mode} dateFrom=${dateFrom}`)

    const agg = await fetchSalesDaily(dateFrom)

    // clean-replace date-окна: удаляем [>= dateFrom] и вставляем свежий агрегат.
    // Идемпотентно — повторный прогон не задваивает.
    const fromDate = new Date(dateFrom + "T00:00:00Z")
    const written = await prisma.$transaction(async (tx) => {
      await tx.wbSalesDaily.deleteMany({ where: { date: { gte: fromDate } } })
      if (agg.length === 0) return 0
      const created = await tx.wbSalesDaily.createMany({
        data: agg.map((a) => ({
          nmId: a.nmId,
          date: new Date(a.date + "T00:00:00Z"),
          buyoutsRub: a.buyoutsRub,
          buyoutsCount: a.buyoutsCount,
          returnsRub: a.returnsRub,
          returnsCount: a.returnsCount,
          forPayRub: a.forPayRub,
        })),
      })
      return created.count
    })

    const todayStr = getMskTodayString()
    await prisma.appSetting.upsert({
      where: { key: "wbSalesDailyLastRun" },
      create: { key: "wbSalesDailyLastRun", value: todayStr },
      update: { value: todayStr },
    })

    console.log(`[wb-sales-daily cron] done rows=${agg.length} written=${written}`)
    return NextResponse.json({ ok: true, mode, windowDays: days, dateFrom, rows: agg.length, written })
  } catch (err) {
    console.error("[wb-sales-daily cron] error:", err)
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
