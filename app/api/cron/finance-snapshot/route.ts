// app/api/cron/finance-snapshot/route.ts
// Phase 24 Plan 24-06: ежедневный снапшот баланса (D-01/D-02) — остатки Product × 4 локации
// (себестоимость на дату) + дебиторка WB (Balance API + forPay-хвост, degraded mode — m5).
// По умолчанию 06:00 МСК через dispatcher (после ночных WB-sync: adv 03:00, funnel 04:00,
// orders 05:00, prices 05:10, cards-refresh 05:30). Защищён x-cron-secret.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { runFinanceSnapshot } from "@/lib/finance-snapshot"
import { getMskTodayString } from "@/lib/wb-cron-schedule"

export const runtime = "nodejs"
export const maxDuration = 600

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }

  try {
    const result = await runFinanceSnapshot()

    const todayStr = getMskTodayString()
    await prisma.appSetting.upsert({
      where: { key: "financeBalanceSnapshotLastRun" },
      create: { key: "financeBalanceSnapshotLastRun", value: todayStr },
      update: { value: todayStr },
    })

    console.log(
      `[finance-snapshot cron] done date=${result.date} stockRows=${result.stockRows} receivables=${result.receivables}`,
    )

    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error("[finance-snapshot cron] error:", err)
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    )
  }
}
