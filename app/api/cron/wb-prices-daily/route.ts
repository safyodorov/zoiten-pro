// app/api/cron/wb-prices-daily/route.ts
// GET — daily snapshot цен (по умолчанию 05:10 МСК через dispatcher).
// Защищён x-cron-secret == process.env.CRON_SECRET.
// 2026-05-15 (quick 260515-o4o)

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { fetchBuyerPricesViaCurlV4 } from "@/lib/wb-api"
import { getMskTodayDate } from "@/lib/wb-orders-chart"
import { getMskTodayString } from "@/lib/wb-cron-schedule"

export const runtime = "nodejs"
export const maxDuration = 600

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const cards = await prisma.wbCard.findMany({
    where: { deletedAt: null },
    select: { nmId: true, price: true },
  })
  const sellerMap = new Map<number, number | null>(
    cards.map((c) => [c.nmId, c.price ? Math.round(c.price) : null]),
  )
  const nmIds = cards.map((c) => c.nmId)
  const buyerMap = await fetchBuyerPricesViaCurlV4(nmIds)

  const today = getMskTodayDate()
  let upserted = 0
  for (const nmId of nmIds) {
    const buyerPrice = buyerMap.get(nmId) ?? null
    const sellerPrice = sellerMap.get(nmId) ?? null
    if (!buyerPrice && !sellerPrice) continue
    // СПП = (1 − buyerPrice/sellerPrice) × 100, точность 0.1. null если нет обеих цен.
    const discountWb =
      sellerPrice && sellerPrice > 0 && buyerPrice
        ? Math.round((1 - buyerPrice / sellerPrice) * 1000) / 10
        : null
    await prisma.wbCardOrdersDaily.upsert({
      where: { nmId_date: { nmId, date: today } },
      create: { nmId, date: today, qty: 0, sellerPrice, buyerPrice, discountWb },
      update: { sellerPrice, buyerPrice, discountWb }, // qty не трогаем
    })
    upserted++
  }

  const todayStr = getMskTodayString()
  await prisma.appSetting.upsert({
    where: { key: "wbPricesDailyLastRun" },
    create: { key: "wbPricesDailyLastRun", value: todayStr },
    update: { value: todayStr },
  })

  console.log(
    `[cron prices-daily] upserted=${upserted}/${nmIds.length} for ${todayStr}`,
  )
  return NextResponse.json({
    ok: true,
    upserted,
    total: nmIds.length,
    date: todayStr,
  })
}
