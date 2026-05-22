// app/api/cron/wb-adv-targets-backfill/route.ts
// GET — backfill / refresh WbAdvertTarget через /api/advert/v2/adverts.
//
// v2 (2026-05-22): этот endpoint теперь не просто «бэкфилл missing», а
// «refresh oldest». Раньше: ищет кампании без всяких targets и upsert'ит. После
// одного прохода targets никогда не обновляются → старые таргеты живут вечно,
// даже если в кабинете WB их давно убрали. Сейчас:
//
//   1) Приоритет: campaigns БЕЗ targets (NULLS FIRST), затем самые старые
//      по MAX(WbAdvertTarget.updatedAt). Это даёт постоянную ротацию через
//      ВСЕ active/paused/completed (7/9/11) кампании.
//   2) Для каждого advertId: маркируем все существующие real targets (nmId > 0)
//      как active=false, потом upsert свежий список с active=true. Стало:
//      «active=true» — текущее состояние кабинета, «active=false» — историческое.
//   3) Sentinel (nmId=-1, active=false) — кампания проверена, но targets нет
//      (auto-РК или WB не вернул nm_settings). Помечается active=false как и
//      устаревшие — атрибуция теперь использует только active=true.
//
// Rate limit: /api/advert/v2/adverts — 1 req/час per token. С ротацией двух
// токенов = 2/час = 100 advertIds/час (batch 50). 429 campaigns → полный
// рефреш цикла ~5 часов. Dispatcher вызывает каждые 5 мин — лишние вызовы
// получают 429 и тихо скипаются.
//
// Атрибуция (lib/wb-legend-metrics.ts + app/(dashboard)/ads/wb/page.tsx) с
// 2026-05-22 фильтрует targets по active=true. Сначала targets должны быть
// рефрешнуты, потом числа в UI сойдутся с кабинетом.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  fetchAdvertsInfoV2,
  resetAdvTokenForRun,
} from "@/lib/wb-adv-api"
import { WbRateLimitError } from "@/lib/wb-api"

export const runtime = "nodejs"
export const maxDuration = 600

const BATCH_SIZE = 50

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  resetAdvTokenForRun()

  try {
    // Priority: campaigns без targets (NULLS FIRST), затем самые старые
    // по MAX(WbAdvertTarget.updatedAt). Это обеспечивает постоянный круг
    // рефреша через все active/paused/completed campaigns.
    const oldest = await prisma.$queryRaw<Array<{ advertId: number }>>`
      SELECT c."advertId"
      FROM "WbAdvertCampaign" c
      LEFT JOIN (
        SELECT "advertId", MAX("updatedAt") AS last_refresh
        FROM "WbAdvertTarget"
        GROUP BY "advertId"
      ) t ON t."advertId" = c."advertId"
      WHERE c.status IN (7, 9, 11)
      ORDER BY
        t.last_refresh ASC NULLS FIRST,
        CASE c.status WHEN 9 THEN 0 WHEN 11 THEN 1 WHEN 7 THEN 2 ELSE 3 END,
        c."advertId" ASC
      LIMIT ${BATCH_SIZE}
    `

    if (oldest.length === 0) {
      return NextResponse.json({
        ok: true,
        done: true,
        message: "Нет кампаний для рефреша (status NOT IN 7/9/11)",
        processed: 0,
      })
    }

    const ids = oldest.map((r) => r.advertId)
    console.log(`[wb-adv-targets-backfill] refreshing ${ids.length} advertIds (oldest first)`)

    const infos = await fetchAdvertsInfoV2(ids)
    console.log(`[wb-adv-targets-backfill] fetched ${infos.length} info rows`)

    const respondedSet = new Set(infos.map((i) => i.advertId))

    let pairsActivated = 0
    let pairsDeactivated = 0
    let campaignsWithNms = 0
    let sentinelsAdded = 0

    async function addSentinel(advertId: number): Promise<void> {
      await prisma.wbAdvertTarget.upsert({
        where: { advertId_nmId: { advertId, nmId: -1 } },
        create: { advertId, nmId: -1, active: false },
        update: { active: false },
      })
      sentinelsAdded++
    }

    for (const info of infos) {
      // Маркируем все ранее активные real targets (nmId > 0) как inactive.
      // На предыдущем шаге дёрнул updatedAt — следующий рефреш этой кампании
      // снова случится через ~5 часов (после всех others).
      const deactivated = await prisma.wbAdvertTarget.updateMany({
        where: {
          advertId: info.advertId,
          nmId: { gt: 0 },
          active: true,
        },
        data: { active: false },
      })
      pairsDeactivated += deactivated.count

      if (info.nmIds.length === 0) {
        // Auto-РК / WB вернул без nm_settings — sentinel
        await addSentinel(info.advertId)
        continue
      }
      campaignsWithNms++
      for (const nmId of info.nmIds) {
        await prisma.wbAdvertTarget.upsert({
          where: { advertId_nmId: { advertId: info.advertId, nmId } },
          create: { advertId: info.advertId, nmId, active: true },
          update: { active: true },
        })
        pairsActivated++
      }
    }

    // advertIds, которые мы запросили, но WB не вернул — типично 404
    // (кампания удалена в кабинете). Не деактивируем существующие targets
    // (WB может временно не отвечать) — только добавляем sentinel чтобы
    // updatedAt продвинулся и эта кампания ушла в конец очереди.
    for (const advertId of ids) {
      if (!respondedSet.has(advertId)) {
        await addSentinel(advertId)
      }
    }

    // Сколько ещё не рефрешено за последние 6 часов
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000)
    const remaining = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
      SELECT COUNT(*)::bigint AS cnt
      FROM "WbAdvertCampaign" c
      LEFT JOIN (
        SELECT "advertId", MAX("updatedAt") AS last_refresh
        FROM "WbAdvertTarget"
        GROUP BY "advertId"
      ) t ON t."advertId" = c."advertId"
      WHERE c.status IN (7, 9, 11)
        AND (t.last_refresh IS NULL OR t.last_refresh < ${sixHoursAgo})
    `
    const remainCount = Number(remaining[0]?.cnt ?? 0)

    return NextResponse.json({
      ok: true,
      done: remainCount === 0,
      processed: ids.length,
      campaignsWithNms,
      pairsActivated,
      pairsDeactivated,
      sentinelsAdded,
      remainingStaleOver6h: remainCount,
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
