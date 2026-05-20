// lib/wb-adv-sync.ts
// Phase 19 Wave 4: Pure orchestration helper для WB Advert daily sync.
// Вынесено из route.ts из-за Next.js 15 ограничения (route.ts может
// экспортировать только HTTP-методы). Используется как cron (GET), так и
// manual backfill (POST) endpoint'ами.

import { prisma } from "@/lib/prisma"
import {
  fetchPromotionCount,
  fetchFullStats,
  fetchBalance,
  type WbAdvertStat,
} from "@/lib/wb-adv-api"
import { getMskTodayDate } from "@/lib/wb-orders-chart"

export const DAILY_DELTA_DAYS = 7

/** Статусы кампаний для fullstats запроса.
 *
 *  КРИТИЧЕСКИЙ ЛИМИТ: GET /adv/v3/fullstats — **1 запрос в ЧАС** на seller (per WB
 *  docs «Маркетинг и продвижение»). max 50 advertId per request. Это значит:
 *    - 196 paused + 1 running = 197 advertIds → 4 батча → 4 ЧАСА на полный sweep
 *  Поэтому здесь фильтруем только status=4 (Running) — у нас обычно <50 running
 *  campaigns, помещаются в 1 батч = 1 запрос = укладывается в hourly limit.
 *
 *  Для sweep paused (status=7) нужен отдельный механизм (batch offset через
 *  AppSetting + cron runs в разные часы). См. memory/project_wb_advert_api.md.
 *
 *  status 4 = Running, 7 = Paused, 9 = Completed (archived), 11 = Draft. */
const STATS_RELEVANT_STATUSES = new Set([4])

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

/** Выполняет полную orchestration WB Advert sync.
 *  Идемпотентный — upsert не создаёт дубликатов на повторных run.
 *  Throws WbRateLimitError при 429 — caller должен поймать и вернуть HTTP 429.
 */
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
