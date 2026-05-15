// 2026-05-14 (quick 260514-mci): Агрегация рейтингов из WB Feedbacks API.
// WB Seller API не имеет dedicated endpoint per nmId — собираем все feedback'и
// продавца (active + archive) и считаем weighted average per nmId и imtId.
// Rate limit: 1 req/sec на bucket `feedbacks` (общий с support-sync).
//
// 2026-05-15 (260515 follow-up): WB-витрина не использует простое среднее.
// Официальная формула опубликована на seller.wildberries.ru/instructions/.../product-rating:
//
//   weight(d) = 1                          если d ≤ 182 (полное «свежее» окно ~6 мес)
//   weight(d) = 100^(-(d-182) / 1095)      если d > 182 (экспоненциальное затухание)
//
//   Плюс: первые 15 САМЫХ СВЕЖИХ отзывов ВСЕГДА w=1 (защита cold-start новых карточек).
//   rating = Σ(productValuation × weight) / Σ(weight)
//
// Окно учёта: последние 2 года. Тз = 20 000 максимум — не достижимо для Zoiten.
// `d` = дни с момента publishing (`createdDate` из Feedbacks API).
//
// Verified locally: d=200→0.927, d=365→0.463, d=730→0.100, d=1095→0.022.
// Source: https://seller.wildberries.ru/instructions/ru/ru/material/product-rating
//
// Фильтры до формулы:
//   1) state === "wbRu" — только опубликованные на WB.ru. Обнулённые после
//      апелляции продавца переходят в state ≠ wbRu и исключаются.
//   2) productValuation > 0 — защита от грязных данных API.
//   3) createdDate >= now - 2 года (730 дней) — WB-окно учёта.
//   4) productDetails.nmId присутствует.
//
// Фильтр «невалидных» отзывов (спам/противоречивые/бессодержательные) у WB —
// NLP-чёрный ящик, мы не реплицируем. Принимаем residual ~3-5% по count.

import { listFeedbacks, type Feedback } from "@/lib/wb-support-api"

export interface RatingAggregate {
  rating: number | null // weighted avg, 0.0-5.0, округлено до 2 знаков
  count: number // кол-во включённых feedback'ов (не взвешенное)
  sumWeights: number // Σ(weights) — эффективный размер выборки, округлено до 2 знаков
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

// ── Конфигурация формулы WB ────────────────────────────────────
// Параметризовано чтобы менять без правок кода если WB меняет.
// Все значения — из официальной документации seller.wildberries.ru.

export const WB_RATING_FORMULA = {
  FRESH_DAYS: 182, // дней до начала затухания (~6 мес)
  DECAY_DIVISOR: 1095, // 730 × 1.5 — делитель в формуле
  DECAY_BASE: 100, // основание степени
  RECENT_FULL_WEIGHT: 15, // первые N свежих → w=1 независимо от возраста
  WINDOW_DAYS: 730, // окно учёта — последние 2 года
} as const

const PUBLIC_STATE = "wbRu"
const MS_PER_DAY = 86_400_000
const WINDOW_MS = WB_RATING_FORMULA.WINDOW_DAYS * MS_PER_DAY

/**
 * Коэффициент затухания по официальной формуле WB:
 *   d ≤ 182  → 1
 *   d > 182  → 100^(-(d - 182) / 1095)
 *
 * Verified: d=200 → 0.9271, d=365 → 0.4632, d=730 → 0.0998, d=1095 → 0.0215
 * Source: https://seller.wildberries.ru/instructions/ru/ru/material/product-rating
 */
export function wbDecayWeight(ageDays: number): number {
  const { FRESH_DAYS, DECAY_DIVISOR, DECAY_BASE } = WB_RATING_FORMULA
  if (ageDays <= FRESH_DAYS) return 1
  return Math.pow(DECAY_BASE, -(ageDays - FRESH_DAYS) / DECAY_DIVISOR)
}

interface Entry {
  ageDays: number
  v: number
  imtId: number | null
}

// Считает rating + count + sumWeights для группы entries (per nmId или per imtId).
// 15 самых свежих → w=1. Остальные → wbDecayWeight(ageDays).
function computeWeightedRating(
  entries: Entry[]
): { rating: number | null; count: number; sumWeights: number } {
  if (entries.length === 0) return { rating: null, count: 0, sumWeights: 0 }

  // Sort by ageDays asc = свежие сначала.
  const sorted = [...entries].sort((a, b) => a.ageDays - b.ageDays)

  let sumWeighted = 0
  let sumWeights = 0
  for (let i = 0; i < sorted.length; i++) {
    const w =
      i < WB_RATING_FORMULA.RECENT_FULL_WEIGHT ? 1 : wbDecayWeight(sorted[i].ageDays)
    sumWeighted += sorted[i].v * w
    sumWeights += w
  }

  const round2 = (n: number) => Math.round(n * 100) / 100
  return {
    rating: sumWeights > 0 ? round2(sumWeighted / sumWeights) : null,
    count: sorted.length,
    sumWeights: round2(sumWeights),
  }
}

// Pure aggregator — выделено для unit-теста БЕЗ I/O.
// opts.now необязателен — для детерминированных тестов передаём timestamp.
export function aggregateFeedbacks(
  feedbacks: Feedback[],
  opts: { now?: number } = {}
): ProductRatingsResult {
  const now = opts.now ?? Date.now()
  const cutoff = now - WINDOW_MS

  const byNmId = new Map<number, Entry[]>()
  const byImtId = new Map<number, Entry[]>()

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

    // 1. State filter — только опубликованные на WB.ru.
    if (state !== PUBLIC_STATE) {
      diag.excludedByState += 1
      continue
    }

    // 2. Valuation guard.
    const v = Number(fb.productValuation)
    if (!Number.isFinite(v) || v <= 0) {
      diag.excludedByValuation += 1
      continue
    }

    // 3. Age filter — окно 2 года (730 дней) per WB-документация.
    const created = Date.parse(fb.createdDate)
    if (Number.isFinite(created) && created < cutoff) {
      diag.excludedByAge += 1
      continue
    }

    const nmId = fb.productDetails?.nmId
    const imtId = fb.productDetails?.imtId ?? null
    if (!nmId) {
      diag.excludedNoNmId += 1
      continue
    }

    diag.includedInAggregate += 1

    // ageDays для weighted formula. NaN createdDate (~ malformed) → ageDays=0
    // → попадает в FRESH, что безопасно (полный вес).
    const ageDays = Number.isFinite(created)
      ? (now - created) / MS_PER_DAY
      : 0

    const entry: Entry = { ageDays, v, imtId }

    const nmList = byNmId.get(nmId) ?? []
    nmList.push(entry)
    byNmId.set(nmId, nmList)

    if (imtId && imtId > 0) {
      const imtList = byImtId.get(imtId) ?? []
      imtList.push(entry)
      byImtId.set(imtId, imtList)
    }
  }

  // Сборка perNmId.
  const perNmId = new Map<number, RatingAggregate & { imtId: number | null }>()
  for (const [nmId, entries] of byNmId) {
    const { rating, count, sumWeights } = computeWeightedRating(entries)
    // imtId берём из первого entry (все entries одного nmId имеют один imtId).
    const imtId = entries[0]?.imtId ?? null
    perNmId.set(nmId, { rating, count, sumWeights, imtId })
  }

  // Сборка perImtId.
  const perImtId = new Map<number, RatingAggregate>()
  for (const [imtId, entries] of byImtId) {
    perImtId.set(imtId, computeWeightedRating(entries))
  }

  return { perNmId, perImtId, totalProcessed: feedbacks.length, diagnostics: diag }
}

// ── Sweep parameters ───────────────────────────────────────────

const TAKE = 5000 // WB max per docs
const SLEEP_MS = 1100 // 1 req/sec + 100ms буфер
const MAX_SUB_PAGES = 5 // на slice — cap (5×5000 = 25k feedbacks за 90 дней — не достижимо)

// 8 slices × 91 день ≈ 728 дней (близко к 730 = 2 года).
const SLICE_COUNT = 8
const SLICE_DAYS = Math.ceil(WB_RATING_FORMULA.WINDOW_DAYS / SLICE_COUNT)

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// 2026-05-15: переход с глобального skip/dateTo cursor на **time-slice sweep**.
//
// Bug: WB Feedbacks API имеет скрытый GLOBAL cap (~10000 total returned)
// независимо от pagination метода. Для seller'а с 30k+ feedback'ами sweep
// застревал на newest 10k, теряя остальные. Диагностика: для одного nmId
// 45360121 нативно WB returns 950 feedback'ов, у нас в БД — 430.
//
// Решение: разрезать 2-летнее окно на N slice'ов по dateFrom/dateTo. Внутри
// каждого slice — sub-pagination через cursor. Каждый slice независим — cap
// не накопляется. 8 slice'ов × 91 день ≈ 730 дней покрывают всю формулу WB.
//
// 8 slices × 2 buckets × max 5 sub-pages = 80 max requests × 1.1с = ~90 сек.
// На практике большинство slice'ов = 1 sub-page → 16 запросов = ~20 сек.
async function sweepFeedbacks(): Promise<Feedback[]> {
  const all: Feedback[] = []
  const seen = new Set<string>()
  const nowSec = Math.floor(Date.now() / 1000)
  const sliceDaysSec = SLICE_DAYS * 86_400

  for (const isAnswered of [false, true]) {
    for (let slice = 0; slice < SLICE_COUNT; slice++) {
      const sliceDateTo = nowSec - slice * sliceDaysSec
      const sliceDateFrom = nowSec - (slice + 1) * sliceDaysSec

      // Sub-pagination внутри slice через cursor dateTo. Если в slice <5000 —
      // один запрос. Если больше — продолжаем.
      let cursorDateTo = sliceDateTo
      let stuckPages = 0

      for (let p = 0; p < MAX_SUB_PAGES; p++) {
        if (all.length > 0 || p > 0) await sleep(SLEEP_MS)

        const batch = await listFeedbacks({
          isAnswered,
          take: TAKE,
          skip: 0,
          dateFrom: sliceDateFrom,
          dateTo: cursorDateTo,
        })

        if (batch.length === 0) break

        let added = 0
        let oldestSec = Infinity
        for (const fb of batch) {
          if (seen.has(fb.id)) continue
          seen.add(fb.id)
          all.push(fb)
          added += 1
          const createdSec = Math.floor(Date.parse(fb.createdDate) / 1000)
          if (Number.isFinite(createdSec)) {
            oldestSec = Math.min(oldestSec, createdSec)
          }
        }

        if (added === 0) {
          stuckPages += 1
          if (stuckPages >= 2) break // всё дубликаты — выход
        } else {
          stuckPages = 0
        }

        if (batch.length < TAKE) break // последняя страница slice
        if (oldestSec === Infinity) break
        if (oldestSec <= sliceDateFrom) break // дошли до начала slice

        cursorDateTo = oldestSec - 1
      }
    }
  }

  return all
}

/**
 * Собрать все feedback'и продавца (active + archive) и агрегировать рейтинги
 * per nmId и per imtId через WB-документированную формулу.
 *
 * Кидает WbRateLimitError если WB заблокировал bucket=feedbacks (>60s retry).
 */
export async function fetchProductRatings(): Promise<ProductRatingsResult> {
  const feedbacks = await sweepFeedbacks()
  return aggregateFeedbacks(feedbacks)
}
