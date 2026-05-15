// app/api/wb-ratings-sync/route.ts
// Phase 260514-mci: синхронизация рейтингов карточек WB.
//
// 2026-05-15: объединение в одну кнопку «Рейтинги» по фидбеку пользователя:
//   Шаг 1 (быстро, ~45с): curl к card.wb.ru v4 → точные WB-витрина значения
//     wbStoreRating + wbStoreFeedbacks per nmId. Без shared rate-limit с
//     Feedbacks/Statistics API (v4 — buyer-facing, без seller-token).
//   Шаг 2 (медленно, минуты): Feedbacks API sweep → наш weighted-average
//     расчёт по WB-документированной формуле time-decay.
//
// Если Шаг 2 заблокирован cooldown'ом — возвращаем частичный успех (хотя бы
// WB-витрина обновлена). UX: пользователь всегда получает СВЕЖЕЕ значение
// что показывает покупатель, даже когда feedbacks bucket залочен support-sync'ом.

export const runtime = "nodejs"
export const maxDuration = 600

import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { execSync } from "node:child_process"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { fetchProductRatings } from "@/lib/wb-ratings"
import {
  getWbCooldownSecondsRemaining,
  setWbCooldownUntil,
} from "@/lib/wb-cooldown"
import { WbRateLimitError } from "@/lib/wb-support-api"

interface StorefrontUpdate {
  totalCards: number // карточек в БД
  v4Batches: number // успешных v4 batches
  updated: number // карточек обновлено
  failed: boolean // v4 не отвечает / 403
}

// Шаг 1: v4 batch для wbStoreRating + wbStoreFeedbacks.
// Тот же паттерн что в wb-sync-spp/route.ts и lib/wb-api.ts fetchWbDiscounts.
async function syncStorefrontRatings(): Promise<StorefrontUpdate> {
  const cards = await prisma.wbCard.findMany({ select: { nmId: true } })
  const nmIds = cards.map((c) => c.nmId)

  const result: StorefrontUpdate = {
    totalCards: nmIds.length,
    v4Batches: 0,
    updated: 0,
    failed: false,
  }
  if (nmIds.length === 0) return result

  for (let i = 0; i < nmIds.length; i += 20) {
    const batch = nmIds.slice(i, i + 20)
    const nmStr = batch.join(";")

    let raw: string
    try {
      raw = execSync(
        `curl -s -H "Accept: application/json" -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" "https://card.wb.ru/cards/v4/detail?appType=1&curr=rub&dest=-1257786&nm=${nmStr}"`,
        { timeout: 15000 }
      ).toString()
    } catch {
      console.warn(`[ratings-sync v4] curl ошибка на батче ${i / 20 + 1}`)
      result.failed = true
      break
    }

    if (raw.includes("403 Forbidden") || raw.includes("<html>")) {
      console.warn(`[ratings-sync v4] 403 на батче ${i / 20 + 1}`)
      result.failed = true
      break
    }

    let data
    try {
      data = JSON.parse(raw)
    } catch {
      console.warn(`[ratings-sync v4] JSON parse error на батче ${i / 20 + 1}`)
      result.failed = true
      break
    }

    const products = data?.products ?? []
    for (const product of products) {
      const nmId: number = product.id
      if (!nmId) continue

      const update: { wbStoreRating?: number; wbStoreFeedbacks?: number } = {}
      if (typeof product.reviewRating === "number" && product.reviewRating > 0) {
        update.wbStoreRating = product.reviewRating
      }
      if (typeof product.feedbacks === "number" && product.feedbacks >= 0) {
        update.wbStoreFeedbacks = product.feedbacks
      }

      if (Object.keys(update).length > 0) {
        try {
          await prisma.wbCard.update({ where: { nmId }, data: update })
          result.updated += 1
        } catch {
          // nmId которого нет в WbCard — skip
        }
      }
    }

    result.v4Batches += 1

    if (i + 20 < nmIds.length) {
      // 3-секундная пауза между батчами — паттерн SPP sync (избегаем PoW challenge).
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  return result
}

export async function POST(): Promise<NextResponse> {
  try {
    // /cards/wb gated на section "PRODUCTS" (см. app/(dashboard)/cards/layout.tsx).
    await requireSection("PRODUCTS", "MANAGE")
  } catch {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 })
  }

  // ── Шаг 1: WB-витрина через v4 (всегда, независимо от cooldown) ────
  const storefront = await syncStorefrontRatings()
  revalidatePath("/cards/wb")

  // ── Шаг 2: Feedbacks sweep + наш weighted-average расчёт ─────────
  const cooldownSec = await getWbCooldownSecondsRemaining("feedbacks")
  if (cooldownSec > 0) {
    // Bucket заблокирован — возвращаем частичный успех со Шага 1.
    return NextResponse.json({
      ok: true,
      partial: true,
      storefront,
      ourAggregate: {
        skipped: true,
        reason: `WB Feedbacks API на cooldown ${Math.ceil(cooldownSec / 60)} мин`,
        retryAfterSec: cooldownSec,
      },
    })
  }

  let updatedNmIds = 0
  let updatedImtGroups = 0
  let totalProcessed = 0
  let diagnostics
  try {
    const ratings = await fetchProductRatings()
    totalProcessed = ratings.totalProcessed
    diagnostics = ratings.diagnostics

    for (const [nmId, agg] of ratings.perNmId.entries()) {
      try {
        await prisma.wbCard.update({
          where: { nmId },
          data: {
            rating: agg.rating,
            reviewsTotal: agg.count,
            ...(agg.imtId ? { imtId: agg.imtId } : {}),
          },
        })
        updatedNmIds++
      } catch {
        // nmId не в БД — skip
      }
    }

    for (const [imtId, agg] of ratings.perImtId.entries()) {
      const result = await prisma.wbCard.updateMany({
        where: { imtId },
        data: { ratingImt: agg.rating, reviewsTotalImt: agg.count },
      })
      if (result.count > 0) updatedImtGroups++
    }

    revalidatePath("/cards/wb")
    return NextResponse.json({
      ok: true,
      partial: false,
      storefront,
      ourAggregate: {
        skipped: false,
        totalProcessed,
        updatedNmIds,
        updatedImtGroups,
        perNmIdCount: ratings.perNmId.size,
        perImtIdCount: ratings.perImtId.size,
        diagnostics,
      },
    })
  } catch (err) {
    if (err instanceof WbRateLimitError) {
      await setWbCooldownUntil("feedbacks", err.retryAfterSec).catch(() => {})
      // Шаг 1 уже прошёл — возвращаем частичный успех.
      return NextResponse.json({
        ok: true,
        partial: true,
        storefront,
        ourAggregate: {
          skipped: true,
          reason: `WB Feedbacks API 429: ждите ${Math.ceil(err.retryAfterSec / 60)} мин`,
          retryAfterSec: err.retryAfterSec,
        },
      })
    }
    return NextResponse.json(
      {
        error: (err as Error).message || "Ошибка sync рейтингов",
        storefront, // Шаг 1 успешно прошёл
      },
      { status: 500 }
    )
  }
}
