// app/api/cron/dispatch/route.ts
// GET — fires каждые 5 минут (systemd zoiten-cron-dispatch.timer).
// Читает AppSetting wbOrdersDailyCronTime + wbPricesDailyCronTime,
// сравнивает с MSK now (HH:MM exact match) + проверяет lastRun guard,
// вызывает соответствующий cron endpoint через dynamic import.
// 2026-05-15 (quick 260515-o4o)

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  getMskHHMM,
  getMskTodayString,
  shouldFireCron,
} from "@/lib/wb-cron-schedule"

export const runtime = "nodejs"
export const maxDuration = 600

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const currentHHMM = getMskHHMM()
  const today = getMskTodayString()

  const rows = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [
          "wbOrdersDailyCronTime",
          "wbPricesDailyCronTime",
          "wbFunnelDailyCronTime",
          "wbAdvSyncCronTime",
          "wbAdvUpdSyncCronTime",
          "wbCardsRefreshCronTime",
          "wbOrdersDailyLastRun",
          "wbPricesDailyLastRun",
          "wbFunnelDailyLastRun",
          "wbAdvSyncLastRun",
          "wbAdvUpdSyncLastRun",
          "wbCardsRefreshLastRun",
        ],
      },
    },
  })
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const ordersTime = settings.wbOrdersDailyCronTime ?? "05:00"
  const pricesTime = settings.wbPricesDailyCronTime ?? "05:10"
  const funnelTime = settings.wbFunnelDailyCronTime ?? "04:00"
  const advSyncTime = settings.wbAdvSyncCronTime ?? "03:00"
  const advUpdSyncTime = settings.wbAdvUpdSyncCronTime ?? "03:30"
  const cardsRefreshTime = settings.wbCardsRefreshCronTime ?? "05:30"
  const ordersLastRun = settings.wbOrdersDailyLastRun ?? null
  const pricesLastRun = settings.wbPricesDailyLastRun ?? null
  const funnelLastRun = settings.wbFunnelDailyLastRun ?? null
  const advSyncLastRun = settings.wbAdvSyncLastRun ?? null
  const advUpdSyncLastRun = settings.wbAdvUpdSyncLastRun ?? null
  const cardsRefreshLastRun = settings.wbCardsRefreshLastRun ?? null

  const fired: string[] = []

  // Phase 19 Wave 4: WB Advert sync. По умолчанию 03:00 МСК — самый ранний
  // в цепочке (Advert + Statistics + Analytics — РАЗНЫЕ buckets per-seller,
  // но всё равно разносим по времени чтобы не складывать нагрузку).
  if (
    shouldFireCron({
      currentHHMM,
      storedTime: advSyncTime,
      lastRunDate: advSyncLastRun,
      today,
    })
  ) {
    try {
      const { GET: advHandler } = await import("../wb-adv-sync/route")
      const res = await advHandler(req)
      fired.push(`adv:${res.status}`)
    } catch (e) {
      console.error("[dispatch] adv error:", e)
      fired.push("adv:error")
    }
  }

  // Phase 19+ 2026-05-20: /adv/v1/upd history. По умолч. 03:30 МСК — за 30 мин
  // после wb-adv-sync (03:00). Hourly bucket per-token независим от /fullstats.
  if (
    shouldFireCron({
      currentHHMM,
      storedTime: advUpdSyncTime,
      lastRunDate: advUpdSyncLastRun,
      today,
    })
  ) {
    try {
      const { GET: advUpdHandler } = await import("../wb-adv-upd-sync/route")
      const res = await advUpdHandler(req)
      fired.push(`adv-upd:${res.status}`)
    } catch (e) {
      console.error("[dispatch] adv-upd error:", e)
      fired.push("adv-upd:error")
    }
  }

  if (
    shouldFireCron({
      currentHHMM,
      storedTime: funnelTime,
      lastRunDate: funnelLastRun,
      today,
    })
  ) {
    try {
      const { GET: funnelHandler } = await import("../wb-funnel-daily/route")
      const res = await funnelHandler(req)
      fired.push(`funnel:${res.status}`)
    } catch (e) {
      console.error("[dispatch] funnel error:", e)
      fired.push("funnel:error")
    }
  }

  if (
    shouldFireCron({
      currentHHMM,
      storedTime: ordersTime,
      lastRunDate: ordersLastRun,
      today,
    })
  ) {
    try {
      const { GET: ordersHandler } = await import("../wb-orders-daily/route")
      const res = await ordersHandler(req)
      fired.push(`orders:${res.status}`)
    } catch (e) {
      console.error("[dispatch] orders error:", e)
      fired.push("orders:error")
    }
  }

  if (
    shouldFireCron({
      currentHHMM,
      storedTime: pricesTime,
      lastRunDate: pricesLastRun,
      today,
    })
  ) {
    try {
      const { GET: pricesHandler } = await import("../wb-prices-daily/route")
      const res = await pricesHandler(req)
      fired.push(`prices:${res.status}`)
    } catch (e) {
      console.error("[dispatch] prices error:", e)
      fired.push("prices:error")
    }
  }

  // 2026-05-21: refresh «горячих» полей WbCard (stockQty, inWay*, price, СПП).
  // По умолчанию 05:30 МСК — после wb-prices-daily (05:10) чтобы не сложить v4 calls.
  if (
    shouldFireCron({
      currentHHMM,
      storedTime: cardsRefreshTime,
      lastRunDate: cardsRefreshLastRun,
      today,
    })
  ) {
    try {
      const { GET: cardsRefreshHandler } = await import("../wb-cards-refresh/route")
      const res = await cardsRefreshHandler(req)
      fired.push(`cards-refresh:${res.status}`)
    } catch (e) {
      console.error("[dispatch] cards-refresh error:", e)
      fired.push("cards-refresh:error")
    }
  }

  // 2026-05-21: backfill WbAdvertTarget через /api/advert/v2/adverts.
  // 1 батч (50 advertId) per dispatcher tick. Dispatcher fires каждые 5 мин,
  // но /api/advert/v2/adverts имеет lim 1/час per token (rotation 2 токена).
  // Само API кинет 429 → endpoint вернёт 429 → dispatcher просто пропустит.
  // После полного покрытия endpoint сам возвращает done:true (no-op).
  // Без gate'a по времени — без attempt запускаем каждые 5 мин, безопасно.
  try {
    const { GET: targetsBackfillHandler } = await import(
      "../wb-adv-targets-backfill/route"
    )
    const res = await targetsBackfillHandler(req)
    fired.push(`targets-backfill:${res.status}`)
  } catch (e) {
    console.error("[dispatch] targets-backfill error:", e)
    fired.push("targets-backfill:error")
  }

  return NextResponse.json({ ok: true, currentHHMM, today, fired })
}
