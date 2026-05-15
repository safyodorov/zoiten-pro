// app/api/wb-ratings-sync/route.ts
// Синхронизация рейтингов карточек WB.
//
// 2026-05-15 (v3): новый источник — undocumented buyer-side endpoint
// `feedbacks1.wb.ru/feedbacks/v1/{imtRoot}`. Возвращает уже отфильтрованные
// агрегаты (WB NLP-filter applied). Один запрос на склейку даёт точное
// совпадение с витриной WB.
//
// Шаг 1 (~45с): card.wb.ru v4 batch — fallback источник wbStoreRating
//   и wbStoreFeedbacks (на случай если feedbacks1.wb.ru недоступен).
// Шаг 2 (~30с): feedbacks1.wb.ru per imt — основной источник rating/
//   ratingImt/reviewsTotal/reviewsTotalImt.
//
// Source: .planning/quick/260514-mci-cards-wb/260515-rejected-feedbacks-RESEARCH.md

export const runtime = "nodejs"
export const maxDuration = 300

import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { execSync } from "node:child_process"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { fetchStorefrontRatings } from "@/lib/wb-storefront-feedbacks"

interface StorefrontUpdate {
  totalCards: number
  v4Batches: number
  updated: number
  failed: boolean
}

// Шаг 1: card.wb.ru v4 batch — wbStoreRating + wbStoreFeedbacks per nmId.
// Тот же паттерн что в wb-sync-spp/route.ts и lib/wb-api.ts fetchWbDiscounts.
// Использует curl (TLS-fingerprint блок на Node fetch для card.wb.ru).
async function syncStorefrontV4(): Promise<StorefrontUpdate> {
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
      result.failed = true
      break
    }

    if (raw.includes("403 Forbidden") || raw.includes("<html>")) {
      result.failed = true
      break
    }

    let data
    try {
      data = JSON.parse(raw)
    } catch {
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
          // nmId not in WbCard — skip
        }
      }
    }

    result.v4Batches += 1

    if (i + 20 < nmIds.length) {
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  return result
}

export async function POST(): Promise<NextResponse> {
  try {
    await requireSection("PRODUCTS", "MANAGE")
  } catch {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 })
  }

  // ── Шаг 1: card.wb.ru v4 (fallback источник + СПП context) ────────
  const storefrontV4 = await syncStorefrontV4()
  revalidatePath("/cards/wb")

  // ── Шаг 2: feedbacks1.wb.ru per-imt — основной источник рейтингов ──
  let updatedNmIds = 0
  let updatedImts = 0
  let imtsFetched = 0
  let imtsFailed = 0
  let totalCountIncluded = 0
  let totalCountTotal = 0
  try {
    // Берём уникальные imtId из БД (= imtRoot для feedbacks1.wb.ru endpoint).
    const dbImts = await prisma.wbCard.findMany({
      select: { imtId: true },
      where: { imtId: { not: null } },
      distinct: ["imtId"],
    })
    const imtRoots = dbImts
      .map((c) => c.imtId)
      .filter((id): id is number => id !== null && id > 0)

    const ratings = await fetchStorefrontRatings(imtRoots)
    imtsFetched = ratings.size
    imtsFailed = imtRoots.length - imtsFetched

    for (const [imtRoot, agg] of ratings) {
      totalCountIncluded += agg.countIncluded
      totalCountTotal += agg.countTotal

      // Обновить per-imt поля: ratingImt + reviewsTotalImt + wbStoreRating + wbStoreFeedbacks.
      // wbStoreRating/Feedbacks теперь приходит из достоверного источника (= что покупатель видит).
      const imtUpdate = await prisma.wbCard.updateMany({
        where: { imtId: imtRoot },
        data: {
          ratingImt: agg.rating,
          reviewsTotalImt: agg.countIncluded,
          wbStoreRating: agg.rating,
          wbStoreFeedbacks: agg.countTotal,
        },
      })
      if (imtUpdate.count > 0) updatedImts += 1

      // Per-nmId rating + count из nmValuationDistribution.
      for (const [nmId, perNm] of agg.perNmId) {
        try {
          await prisma.wbCard.update({
            where: { nmId },
            data: {
              rating: perNm.rating,
              reviewsTotal: perNm.count,
            },
          })
          updatedNmIds += 1
        } catch {
          // nmId не в БД — skip
        }
      }
    }

    revalidatePath("/cards/wb")
    return NextResponse.json({
      ok: true,
      storefrontV4,
      storefront: {
        imtsFetched,
        imtsFailed,
        updatedNmIds,
        updatedImts,
        totalFeedbacksIncluded: totalCountIncluded,
        totalFeedbacksAllTime: totalCountTotal,
      },
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: (err as Error).message || "Ошибка sync рейтингов",
        storefrontV4,
      },
      { status: 500 }
    )
  }
}
