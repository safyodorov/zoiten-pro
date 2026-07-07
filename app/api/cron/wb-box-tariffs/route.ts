// app/api/cron/wb-box-tariffs/route.ts
// Фаза B (2026-07-07): daily cron (через dispatcher, default 05:20 МСК) —
// обновляет box-тарифы складов WB (/tariffs/box → WbBoxTariff → AppSetting.wbBoxTariffEffective).
// Защищён x-cron-secret.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { syncBoxTariffs } from "@/lib/wb-box-tariffs"
import { getMskTodayString } from "@/lib/wb-cron-schedule"

export const runtime = "nodejs"
export const maxDuration = 120

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }

  try {
    const result = await syncBoxTariffs(prisma)

    const todayStr = getMskTodayString()
    await prisma.appSetting.upsert({
      where: { key: "wbBoxTariffsLastRun" },
      create: { key: "wbBoxTariffsLastRun", value: todayStr },
      update: { value: todayStr },
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error("[wb-box-tariffs cron] error:", e)
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
