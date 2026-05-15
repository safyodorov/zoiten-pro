// 2026-05-14 (quick 260514-mci): Агрегация рейтингов из WB Feedbacks API.
// WB Seller API не имеет dedicated endpoint per nmId — собираем все feedback'и
// продавца (active + archive) и считаем avg(productValuation) per nmId и imtId.
// Rate limit: 1 req/sec на bucket `feedbacks` (общий с support-sync).

import { listFeedbacks, type Feedback } from "@/lib/wb-support-api"

export interface RatingAggregate {
  rating: number | null // avg, 1.0-5.0, округлено до 2 знаков
  count: number // total feedbacks
}

export interface ProductRatingsResult {
  perNmId: Map<number, RatingAggregate & { imtId: number | null }>
  perImtId: Map<number, RatingAggregate>
  totalProcessed: number
}

// Pure aggregator — выделено для unit-теста БЕЗ I/O.
// Игнорирует productValuation null/0 (грязные данные).
// imtId=0/null → попадает в perNmId, но не в perImtId.
export function aggregateFeedbacks(feedbacks: Feedback[]): ProductRatingsResult {
  const nmSums = new Map<number, { sum: number; count: number; imtId: number | null }>()
  const imtSums = new Map<number, { sum: number; count: number }>()

  for (const fb of feedbacks) {
    const v = Number(fb.productValuation)
    if (!Number.isFinite(v) || v <= 0) continue
    const nmId = fb.productDetails?.nmId
    const imtId = fb.productDetails?.imtId
    if (!nmId) continue

    const nm = nmSums.get(nmId) ?? { sum: 0, count: 0, imtId: null }
    nm.sum += v
    nm.count += 1
    if (nm.imtId == null && imtId) nm.imtId = imtId
    nmSums.set(nmId, nm)

    if (imtId && imtId > 0) {
      const im = imtSums.get(imtId) ?? { sum: 0, count: 0 }
      im.sum += v
      im.count += 1
      imtSums.set(imtId, im)
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100
  const perNmId = new Map<number, RatingAggregate & { imtId: number | null }>()
  for (const [nmId, s] of nmSums) {
    perNmId.set(nmId, {
      rating: s.count > 0 ? round2(s.sum / s.count) : null,
      count: s.count,
      imtId: s.imtId,
    })
  }
  const perImtId = new Map<number, RatingAggregate>()
  for (const [imtId, s] of imtSums) {
    perImtId.set(imtId, {
      rating: s.count > 0 ? round2(s.sum / s.count) : null,
      count: s.count,
    })
  }
  return { perNmId, perImtId, totalProcessed: feedbacks.length }
}

// ── Sweep parameters ───────────────────────────────────────────

const TAKE = 5000 // WB max per docs
const SLEEP_MS = 1100 // 1 req/sec + 100ms буфер
const MAX_PAGES = 20 // safety cap (20×5000 = 100k feedbacks)

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// Sweep активных + архивных feedbacks через listFeedbacks
// (isAnswered=false → активные, isAnswered=true → обработанные ≈ архив).
// WbRateLimitError из callApi пробрасывается — caller (route) ловит и
// возвращает 429 с retryAfterSec.
async function sweepFeedbacks(): Promise<Feedback[]> {
  const all: Feedback[] = []
  for (const isAnswered of [false, true]) {
    for (let page = 0; page < MAX_PAGES; page++) {
      if (page > 0) await sleep(SLEEP_MS)
      const batch = await listFeedbacks({
        isAnswered,
        take: TAKE,
        skip: page * TAKE,
      })
      all.push(...batch)
      if (batch.length < TAKE) break // последняя страница
    }
    await sleep(SLEEP_MS) // буфер между active/archive sweep
  }
  return all
}

/**
 * Собрать все feedback'и продавца (active + archive) и агрегировать рейтинги
 * per nmId и per imtId. Возвращает Maps готовые к batch update WbCard.
 *
 * Кидает WbRateLimitError если WB заблокировал bucket=feedbacks (>60s retry).
 */
export async function fetchProductRatings(): Promise<ProductRatingsResult> {
  const feedbacks = await sweepFeedbacks()
  return aggregateFeedbacks(feedbacks)
}
