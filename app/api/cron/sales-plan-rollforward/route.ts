// app/api/cron/sales-plan-rollforward/route.ts
// Daily cron (~04:40 МСК через dispatcher). Регенерирует авто-SUGGESTED виртуальные
// закупки и сдвигает просроченные авто-ACCEPTED (orderDate < today -> today),
// чтобы план сам отражал «нет товара — нет продаж» без ручного клика (SP-17, D-4).
// Защищён x-cron-secret. Phase 26.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { regenerateVirtualPurchasesInternal } from "@/app/actions/sales-plan"
import { getMskTodayString } from "@/lib/wb-cron-schedule"

export const runtime = "nodejs"
export const maxDuration = 600

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }
  try {
    await regenerateVirtualPurchasesInternal()
    const todayStr = getMskTodayString()
    await prisma.appSetting.upsert({
      where: { key: "vpRollforwardLastRun" },
      create: { key: "vpRollforwardLastRun", value: todayStr },
      update: { value: todayStr },
    })
    console.log("[sales-plan-rollforward cron] done", todayStr)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[sales-plan-rollforward cron] error:", err)
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
