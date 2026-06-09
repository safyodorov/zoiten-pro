// app/api/cbr-rate-sync/route.ts
// GET — синхронизация курсов валют ЦБ РФ (D-09).
// Вызывается dispatcher'ом в 12:00 МСК (forward-only, без backfill).
// На выходные/праздники ЦБ РФ возвращает курсы прошлого рабочего дня —
// upsert идемпотентен через @@unique([date, code]).

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getMskTodayString } from "@/lib/wb-cron-schedule"
import { fetchCbrRates, ratePerUnit } from "@/lib/cbr-rates"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const data = await fetchCbrRates()
  const rateDate = new Date(data.Date) // "2026-06-09T11:30:00+03:00"
  const syncedAt = new Date()

  let upserted = 0
  for (const valute of Object.values(data.Valute)) {
    await prisma.currencyRate.upsert({
      where: { date_code: { date: rateDate, code: valute.CharCode } },
      create: {
        date: rateDate,
        code: valute.CharCode,
        nominal: valute.Nominal,
        rateToRub: ratePerUnit(valute),
        syncedAt,
      },
      update: {
        nominal: valute.Nominal,
        rateToRub: ratePerUnit(valute),
        syncedAt,
      },
    })
    upserted++
  }

  await prisma.appSetting.upsert({
    where: { key: "cbrRateSyncLastRun" },
    create: { key: "cbrRateSyncLastRun", value: getMskTodayString() },
    update: { value: getMskTodayString() },
  })

  return NextResponse.json({ ok: true, upserted, rateDate: data.Date })
}
