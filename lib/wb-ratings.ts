// 2026-05-14 (quick 260514-mci): Агрегация рейтингов из WB Feedbacks API.
// WB Seller API не имеет dedicated endpoint per nmId — собираем все feedback'и
// продавца (active + archive) и считаем avg(productValuation) per nmId и imtId.
// Rate limit: 1 req/sec на bucket `feedbacks` (общий с support-sync).
//
// 2026-05-15 (260515 follow-up): добавлены два фильтра, чтобы наш агрегат
// совпадал с витриной WB:
//   1) state="wbRu"  — исключаем обнулённые/модерированные (state="none" и пр.).
//      WB на витрине показывает только опубликованные на WB.ru отзывы;
//      обнулённые после успешного апелляции продавца переходят в state ≠ wbRu.
//   2) createdDate >= now - 2 лет — WB на витрине считает только последние 2 года.
//      Старые отзывы остаются в seller API, но не влияют на storefront rating.
// Returns diagnostics object с распределением исключённых для UI toast и debug.

import { listFeedbacks, type Feedback } from "@/lib/wb-support-api"

export interface RatingAggregate {
  rating: number | null // avg, 1.0-5.0, округлено до 2 знаков
  count: number // total feedbacks
}

export interface RatingsDiagnostics {
  totalFeedbacks: number // получили из API всего
  excludedByState: number // state !== "wbRu" (обнулённые)
  excludedByAge: number // createdDate < (now - 2 года)
  excludedByValuation: number // valuation null/0 (защита от грязных данных)
  excludedNoNmId: number // productDetails.nmId отсутствует
  states: Record<string, number> // распределение state-значений в выборке
  includedInAggregate: number // сколько реально попали в agg
}

export interface ProductRatingsResult {
  perNmId: Map<number, RatingAggregate & { imtId: number | null }>
  perImtId: Map<number, RatingAggregate>
  totalProcessed: number
  diagnostics: RatingsDiagnostics
}

const PUBLIC_STATE = "wbRu"
const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000

// Pure aggregator — выделено для unit-теста БЕЗ I/O.
// opts.now необязателен — для детерминированных тестов передаём timestamp.
export function aggregateFeedbacks(
  feedbacks: Feedback[],
  opts: { now?: number } = {}
): ProductRatingsResult {
  const now = opts.now ?? Date.now()
  const cutoff = now - TWO_YEARS_MS

  const nmSums = new Map<number, { sum: number; count: number; imtId: number | null }>()
  const imtSums = new Map<number, { sum: number; count: number }>()

  const diag: RatingsDiagnostics = {
    totalFeedbacks: feedbacks.length,
    excludedByState: 0,
    excludedByAge: 0,
    excludedByValuation: 0,
    excludedNoNmId: 0,
    states: {},
    includedInAggregate: 0,
  }

  for (const fb of feedbacks) {
    const state = fb.state ?? ""
    diag.states[state] = (diag.states[state] ?? 0) + 1

    // 1. State filter — только опубликованные на WB.ru попадают в агрегат.
    if (state !== PUBLIC_STATE) {
      diag.excludedByState += 1
      continue
    }

    // 2. Valuation guard — защита от грязных данных API.
    const v = Number(fb.productValuation)
    if (!Number.isFinite(v) || v <= 0) {
      diag.excludedByValuation += 1
      continue
    }

    // 3. Age filter — старее 2 лет в WB display не входит.
    // createdDate может быть "YYYY-MM-DD" или ISO 8601 — Date.parse оба обрабатывает.
    const created = Date.parse(fb.createdDate)
    if (Number.isFinite(created) && created < cutoff) {
      diag.excludedByAge += 1
      continue
    }

    const nmId = fb.productDetails?.nmId
    const imtId = fb.productDetails?.imtId
    if (!nmId) {
      diag.excludedNoNmId += 1
      continue
    }

    diag.includedInAggregate += 1

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
  return { perNmId, perImtId, totalProcessed: feedbacks.length, diagnostics: diag }
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
