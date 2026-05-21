// app/api/cron/wb-adv-targets-backfill/route.ts
// GET — backfill WbAdvertTarget через /api/advert/v2/adverts.
// Раньше targets деривились из /fullstats — но он возвращает данные только
// для кампаний с активностью в запрошенном окне. Из 429 кампаний только 15
// получили targets таким путём → cascade-фильтр на /ads/wb ломался.
//
// Новый источник: /api/advert/v2/adverts (replacement для deprecated
// /adv/v1/promotion/adverts) даёт реальные target nmIds для ВСЕХ статусов.
// Lim Basic: 1/час per token. С rotation 2 токенов = 100 advertIds/час.
//
// Per call: ОДИН батч ≤50 кампаний без targets (приоритет — active+paused).
// Несколько вызовов в течение дня покроют все 429. Цикл self-clears когда
// все обработаны. Безопасно вызывать многократно.
//
// 2026-05-21

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  fetchAdvertsInfoV2,
  resetAdvTokenForRun,
} from "@/lib/wb-adv-api"
import { WbRateLimitError } from "@/lib/wb-api"

export const runtime = "nodejs"
export const maxDuration = 600

/** Размер одного батча per call — соответствует limit'у /api/advert/v2/adverts. */
const BATCH_SIZE = 50

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  resetAdvTokenForRun()

  try {
    // Найти все advertIds без targets, приоритет 11 (paused, недавний spend) +
    // 9 (active) первыми. status 4 (ready) и -1/8 (удалены) пропускаем —
    // у них нет смысла.
    const missing = await prisma.$queryRaw<Array<{ advertId: number }>>`
      SELECT c."advertId"
      FROM "WbAdvertCampaign" c
      LEFT JOIN (
        SELECT DISTINCT "advertId" FROM "WbAdvertTarget"
      ) t ON t."advertId" = c."advertId"
      WHERE t."advertId" IS NULL
        AND c.status IN (7, 9, 11)
      ORDER BY
        CASE c.status WHEN 9 THEN 0 WHEN 11 THEN 1 WHEN 7 THEN 2 ELSE 3 END,
        c."advertId" ASC
      LIMIT ${BATCH_SIZE}
    `

    if (missing.length === 0) {
      return NextResponse.json({
        ok: true,
        done: true,
        message: "Все кампании уже имеют targets",
        processed: 0,
      })
    }

    const ids = missing.map((r) => r.advertId)
    console.log(`[wb-adv-targets-backfill] processing ${ids.length} advertIds`)

    const infos = await fetchAdvertsInfoV2(ids)
    console.log(`[wb-adv-targets-backfill] fetched ${infos.length} info rows`)

    let pairsUpserted = 0
    let campaignsWithNms = 0
    let sentinelsAdded = 0
    for (const info of infos) {
      if (info.nmIds.length === 0) {
        // Кампания без nm_settings — Auto-РК / пустая / removed. Без сентинела
        // она вечно крутилась бы в "missing" списке. Ставим (-1, false) —
        // безвредный маркер «проверено, таргетов нет», не пересекается с
        // реальными nmId (WB не выдаёт 0/отрицательные).
        await prisma.wbAdvertTarget.upsert({
          where: {
            advertId_nmId: { advertId: info.advertId, nmId: -1 },
          },
          create: { advertId: info.advertId, nmId: -1, active: false },
          update: { active: false },
        })
        sentinelsAdded++
        continue
      }
      campaignsWithNms++
      for (const nmId of info.nmIds) {
        await prisma.wbAdvertTarget.upsert({
          where: { advertId_nmId: { advertId: info.advertId, nmId } },
          create: { advertId: info.advertId, nmId, active: true },
          update: { active: true },
        })
        pairsUpserted++
      }
    }

    // Сколько ещё осталось — для прозрачности в ответе
    const remaining = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
      SELECT COUNT(*)::bigint AS cnt
      FROM "WbAdvertCampaign" c
      LEFT JOIN (
        SELECT DISTINCT "advertId" FROM "WbAdvertTarget"
      ) t ON t."advertId" = c."advertId"
      WHERE t."advertId" IS NULL AND c.status IN (7, 9, 11)
    `
    const remainCount = Number(remaining[0]?.cnt ?? 0)

    return NextResponse.json({
      ok: true,
      done: remainCount === 0,
      processed: ids.length,
      campaignsWithNms,
      pairsUpserted,
      sentinelsAdded,
      remaining: remainCount,
    })
  } catch (err) {
    if (err instanceof WbRateLimitError) {
      return NextResponse.json(
        { ok: false, error: "rate-limit", retryAfterSec: err.retryAfterSec },
        { status: 429 },
      )
    }
    console.error("[wb-adv-targets-backfill] error:", err)
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    )
  }
}
