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
          "wbOrdersDailyLastRun",
          "wbPricesDailyLastRun",
          "wbFunnelDailyLastRun",
        ],
      },
    },
  })
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const ordersTime = settings.wbOrdersDailyCronTime ?? "05:00"
  const pricesTime = settings.wbPricesDailyCronTime ?? "05:10"
  const funnelTime = settings.wbFunnelDailyCronTime ?? "04:00"
  const ordersLastRun = settings.wbOrdersDailyLastRun ?? null
  const pricesLastRun = settings.wbPricesDailyLastRun ?? null
  const funnelLastRun = settings.wbFunnelDailyLastRun ?? null

  const fired: string[] = []

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

  return NextResponse.json({ ok: true, currentHHMM, today, fired })
}
