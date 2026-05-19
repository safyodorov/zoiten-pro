// app/api/cron/wb-adv-sync/route.ts
// Phase 19 Wave 4: Daily cron оркестрация WB Advert sync.
// Источник истины — WB Advert API (advert-api.wildberries.ru). По умолчанию
// 03:00 МСК через dispatcher. Защищён x-cron-secret.
// Идемпотентный — upsert не создаёт дубликатов на повторных run.
//
// Flow:
//   1. fetchPromotionCount → upsert WbAdvertCampaign (advertId/type/status/changeTime)
//   2. fetchFullStats для running/paused кампаний (status 4 или 7), rolling N дней
//   3. upsert WbAdvertStatDaily (compound key advertId+date+nmId+appType)
//   4. Derive WbAdvertTarget из fullstats.nms — endpoint /promotion/adverts
//      deprecated (404), targets берём из реальной работы кампаний
//   5. fetchBalance → create WbAdvertBalanceSnapshot

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  fetchPromotionCount,
  fetchFullStats,
  fetchBalance,
  type WbAdvertStat,
} from "@/lib/wb-adv-api"
import { WbRateLimitError } from "@/lib/wb-api"
import { getMskTodayDate } from "@/lib/wb-orders-chart"
import { getMskTodayString } from "@/lib/wb-cron-schedule"

export const runtime = "nodejs"
export const maxDuration = 600

const DAILY_DELTA_DAYS = 7

/** Активные статусы кампаний для fullstats запроса.
 *  4 = Running, 7 = Paused. 9 = Completed (нет свежих stats), 11 = Draft (никогда не запускалась). */
const STATS_RELEVANT_STATUSES = new Set([4, 7])

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

/** Выполняет полную orchestration. Возвращает счётчики для лога. */
export async function runAdvSync(daysWindow: number = DAILY_DELTA_DAYS) {
  // 1. Список кампаний
  const campaigns = await fetchPromotionCount()
  console.log(`[wb-adv-sync] fetched ${campaigns.length} campaigns`)

  // 2. Upsert WbAdvertCampaign (только поля доступные из /promotion/count)
  let campaignsUpserted = 0
  for (const c of campaigns) {
    await prisma.wbAdvertCampaign.upsert({
      where: { advertId: c.advertId },
      create: {
        advertId: c.advertId,
        type: c.type,
        status: c.status,
        changeTime: new Date(c.changeTime),
      },
      update: {
        type: c.type,
        status: c.status,
        changeTime: new Date(c.changeTime),
      },
    })
    campaignsUpserted++
  }

  // 3. Stats для running/paused кампаний rolling N дней
  const today = getMskTodayDate()
  const begin = new Date(today.getTime() - daysWindow * 24 * 3600_000)
  const end = new Date(today.getTime() - 24 * 3600_000) // вчера включительно
  const statsRelevantIds = campaigns
    .filter(c => STATS_RELEVANT_STATUSES.has(c.status))
    .map(c => c.advertId)
  console.log(
    `[wb-adv-sync] stats query: ${statsRelevantIds.length} relevant advertIds, period ${formatDate(begin)}..${formatDate(end)}`,
  )
  const stats: WbAdvertStat[] = statsRelevantIds.length > 0
    ? await fetchFullStats(statsRelevantIds, {
        beginDate: formatDate(begin),
        endDate: formatDate(end),
      })
    : []
  console.log(`[wb-adv-sync] fetched ${stats.length} stat rows`)

  // 4. Upsert WbAdvertStatDaily (compound unique advertId+date+nmId+appType)
  let statsUpserted = 0
  // Также собираем уникальные (advertId, nmId) для derived WbAdvertTarget
  const targetSeen = new Set<string>()
  const targetRows: Array<{ advertId: number; nmId: number }> = []
  for (const s of stats) {
    await prisma.wbAdvertStatDaily.upsert({
      where: {
        advertId_date_nmId_appType: {
          advertId: s.advertId,
          date: new Date(s.date),
          nmId: s.nmId,
          appType: s.appType,
        },
      },
      create: {
        advertId: s.advertId,
        date: new Date(s.date),
        nmId: s.nmId,
        appType: s.appType,
        views: s.views,
        clicks: s.clicks,
        ctr: s.ctr,
        cpc: s.cpc,
        sum: s.sum,
        atbs: s.atbs,
        orders: s.orders,
        cr: s.cr,
        shks: s.shks,
        sumPrice: s.sumPrice,
        canceled: s.canceled,
      },
      update: {
        views: s.views,
        clicks: s.clicks,
        ctr: s.ctr,
        cpc: s.cpc,
        sum: s.sum,
        atbs: s.atbs,
        orders: s.orders,
        cr: s.cr,
        shks: s.shks,
        sumPrice: s.sumPrice,
        canceled: s.canceled,
      },
    })
    statsUpserted++
    const tKey = `${s.advertId}::${s.nmId}`
    if (!targetSeen.has(tKey)) {
      targetSeen.add(tKey)
      targetRows.push({ advertId: s.advertId, nmId: s.nmId })
    }
  }

  // 5. Derive WbAdvertTarget из реальных nm в fullstats (workaround для deprecated
  //    /promotion/adverts endpoint). Только campaigns которые есть в БД.
  const existingCampaignIds = new Set(campaigns.map(c => c.advertId))
  let targetsUpserted = 0
  for (const t of targetRows) {
    if (!existingCampaignIds.has(t.advertId)) continue // safety
    await prisma.wbAdvertTarget.upsert({
      where: { advertId_nmId: { advertId: t.advertId, nmId: t.nmId } },
      create: { advertId: t.advertId, nmId: t.nmId, active: true },
      update: { active: true },
    })
    targetsUpserted++
  }

  // 6. Balance snapshot — всегда create (история)
  const balance = await fetchBalance()
  await prisma.wbAdvertBalanceSnapshot.create({
    data: {
      balance: balance.balance,
      net: balance.net,
      currency: balance.currency,
    },
  })

  return {
    campaigns: campaignsUpserted,
    statsRelevantIds: statsRelevantIds.length,
    statsUpserted,
    targetsUpserted,
    balance: balance.balance,
    net: balance.net,
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("x-cron-secret")
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }
  try {
    console.log(`[wb-adv-sync cron] start`)
    const result = await runAdvSync(DAILY_DELTA_DAYS)
    console.log(`[wb-adv-sync cron] done`, result)
    const todayStr = getMskTodayString()
    await prisma.appSetting.upsert({
      where: { key: "wbAdvSyncLastRun" },
      create: { key: "wbAdvSyncLastRun", value: todayStr },
      update: { value: todayStr },
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof WbRateLimitError) {
      return NextResponse.json(
        { ok: false, error: "rate-limit", retryAfterSec: err.retryAfterSec },
        { status: 429 },
      )
    }
    console.error("[wb-adv-sync cron] error:", err)
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    )
  }
}
