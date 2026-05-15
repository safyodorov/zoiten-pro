// app/api/wb-ratings-sync/route.ts
// Phase 260514-mci: синхронизация рейтингов карточек WB через Feedbacks API.
// Отдельный endpoint (НЕ /api/wb-sync) — другой rate limit (feedbacks bucket, 1 req/sec)
// и медленнее (sweep тысяч feedback'ов). Только ручной trigger через кнопку.
export const runtime = "nodejs"
export const maxDuration = 600 // sweep может занять минуты

import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { fetchProductRatings } from "@/lib/wb-ratings"
import {
  getWbCooldownSecondsRemaining,
  setWbCooldownUntil,
} from "@/lib/wb-cooldown"
import { WbRateLimitError } from "@/lib/wb-support-api"

export async function POST(): Promise<NextResponse> {
  try {
    // ERP_SECTION не содержит "CARDS" — /cards/wb layout использует "PRODUCTS"
    // (см. app/(dashboard)/cards/layout.tsx). Используем тот же section для MANAGE-операций
    // на карточках WB. Rule 3 fix: план указывал "CARDS", но это сломало бы доступ
    // для non-superadmin MANAGER'ов.
    await requireSection("PRODUCTS", "MANAGE")
  } catch {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 })
  }

  // 1. Pre-check cooldown — feedbacks bucket общий с support-sync.
  // Если активен — НЕ дёргаем WB, возвращаем 429 с retryAfterSec.
  const cooldownSec = await getWbCooldownSecondsRemaining("feedbacks")
  if (cooldownSec > 0) {
    return NextResponse.json(
      {
        error: `WB Feedbacks API на cooldown ${Math.ceil(cooldownSec / 60)} мин — попробуйте позже`,
        retryAfterSec: cooldownSec,
      },
      { status: 429 }
    )
  }

  try {
    // 2. Sweep + aggregate
    const { perNmId, perImtId, totalProcessed, diagnostics } = await fetchProductRatings()

    // 3. Batch update — карточка: rating + reviewsTotal + (imtId backfill, если null в БД)
    let updatedNmIds = 0
    for (const [nmId, agg] of perNmId.entries()) {
      try {
        await prisma.wbCard.update({
          where: { nmId },
          data: {
            rating: agg.rating,
            reviewsTotal: agg.count,
            // Backfill imtId если ещё null (parseCard писал только при /api/wb-sync,
            // а этот endpoint может быть запущен раньше первого full sync с новой схемой)
            ...(agg.imtId ? { imtId: agg.imtId } : {}),
          },
        })
        updatedNmIds++
      } catch {
        // nmId которого нет в WbCard (карточка не синхронизирована full sync'ом) — skip
      }
    }

    // 4. Batch update склейки — все WbCard с этим imtId получают одинаковые ratingImt/reviewsTotalImt
    let updatedImtGroups = 0
    for (const [imtId, agg] of perImtId.entries()) {
      const result = await prisma.wbCard.updateMany({
        where: { imtId },
        data: { ratingImt: agg.rating, reviewsTotalImt: agg.count },
      })
      if (result.count > 0) updatedImtGroups++
    }

    revalidatePath("/cards/wb")
    return NextResponse.json({
      ok: true,
      totalProcessed, // сколько feedback'ов обработано
      updatedNmIds, // карточек обновлено
      updatedImtGroups, // склеек обновлено
      perNmIdCount: perNmId.size,
      perImtIdCount: perImtId.size,
      diagnostics, // распределение state'ов + exclusion counts (для UI toast и debug)
    })
  } catch (err) {
    // WbRateLimitError (>60s retry) — переводим в cooldown и возвращаем 429.
    // listFeedbacks уже мог поставить bucket lock через setWbCooldownUntil в callApi,
    // но дублируем для надёжности (idempotent).
    if (err instanceof WbRateLimitError) {
      await setWbCooldownUntil("feedbacks", err.retryAfterSec).catch(() => {})
      return NextResponse.json(
        {
          error: `WB 429: ждите ${Math.ceil(err.retryAfterSec / 60)} мин`,
          retryAfterSec: err.retryAfterSec,
        },
        { status: 429 }
      )
    }
    return NextResponse.json(
      { error: (err as Error).message || "Ошибка sync рейтингов" },
      { status: 500 }
    )
  }
}
