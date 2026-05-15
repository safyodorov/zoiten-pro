// 2026-05-15: Источник рейтинга = WB storefront (buyer-side API).
//
// WB предоставляет НЕдокументированный CDN endpoint `feedbacks1.wb.ru/feedbacks/v1/{imtRoot}`,
// который СВЕТЛО рендерит карточку покупателю на витрине. Возвращает:
//   - valuation: string — точное число «4.9» как на витрине
//   - valuationDistribution: {1:N, 2:N, 3:N, 4:N, 5:N} — распределение ПОСЛЕ NLP-фильтра
//   - nmValuationDistribution[]: то же per-nmId внутри склейки
//   - feedbacks[]: per-feedback с флагом excludedFromRating.isExcluded + причина
//
// Все NLP-«невалидные» отзывы уже отфильтрованы — мы получаем ровно то что считает WB.
// Реплицировать NLP не нужно.
//
// Verified 2026-05-15:
//   - simple mean из valuationDistribution = displayed valuation ±0.05
//   - 5 параллельных запросов без 429
//   - native fetch() работает (нет TLS-fingerprint блока как у card.wb.ru)
//   - {imtRoot} = WbCard.imtId (verified: products[0].root в v4 = наш imtId)
//
// Source: .planning/quick/260514-mci-cards-wb/260515-rejected-feedbacks-RESEARCH.md

const STOREFRONT_BASE = "https://feedbacks1.wb.ru/feedbacks/v1"
const REQUEST_PAUSE_MS = 100 // вежливость к CDN; rate-limit не наблюдался

interface StorefrontResponseRaw {
  valuation?: string // "4.9"
  feedbackCount?: number // all-time total (incl. excluded)
  valuationDistribution?: Record<string, number> // {1: 27, 2: 10, ...}
  nmValuationDistribution?: Array<{
    nm: number
    valuationDistribution?: Record<string, number>
  }>
  feedbacks?: Array<{
    id: string
    nmId: number
    productValuation: number
    text?: string
    createdDate: string
    updatedDate?: string
    excludedFromRating?: {
      isExcluded: boolean
      reasons?: string[]
    }
    childFeedbackId?: string
  }>
}

export interface StorefrontPerNm {
  rating: number | null
  count: number
}

export interface StorefrontImtRating {
  imtRoot: number
  rating: number | null // = WB displayed valuation
  countIncluded: number // sum of valuationDistribution (= included in rating)
  countTotal: number // all-time feedbackCount (incl. excluded)
  perNmId: Map<number, StorefrontPerNm>
}

function weightedMean(distr: Record<string, number> | undefined): {
  rating: number | null
  count: number
} {
  if (!distr) return { rating: null, count: 0 }
  let sum = 0
  let count = 0
  for (const [stars, n] of Object.entries(distr)) {
    const s = parseInt(stars, 10)
    const c = Number(n)
    if (!Number.isFinite(s) || !Number.isFinite(c)) continue
    sum += s * c
    count += c
  }
  if (count <= 0) return { rating: null, count: 0 }
  return { rating: Math.round((sum / count) * 100) / 100, count }
}

async function fetchOneRoot(root: number): Promise<StorefrontImtRating | null> {
  let res: Response
  try {
    res = await fetch(`${STOREFRONT_BASE}/${root}`, {
      headers: { "User-Agent": "Mozilla/5.0 (zoiten-erp/1.0)" },
    })
  } catch {
    return null
  }

  if (!res.ok) return null

  let data: StorefrontResponseRaw
  try {
    data = (await res.json()) as StorefrontResponseRaw
  } catch {
    return null
  }

  // Пустой root (нет feedback'ов на витрине) — нормальный кейс, возвращаем нули.
  if (!data.valuationDistribution && !data.feedbackCount) {
    return {
      imtRoot: root,
      rating: null,
      countIncluded: 0,
      countTotal: 0,
      perNmId: new Map(),
    }
  }

  // Imt-level rating вычисляем САМИ из valuationDistribution до 2 знаков.
  // WB отдаёт data.valuation как string "4.9" (только 1 знак). Простой mean из
  // distribution математически даёт ту же 1-знаковую цифру, но с большей точностью.
  // Это нужно для UI «4.9 (4.90)» — основа + точное число в скобках.
  const distAgg = weightedMean(data.valuationDistribution)
  let rating: number | null = distAgg.rating
  // Sanity fallback: если distribution пустое, читаем валюацию как float (1 знак).
  if (rating === null && data.valuation) {
    const parsed = parseFloat(data.valuation)
    if (Number.isFinite(parsed) && parsed > 0) rating = parsed
  }

  const countIncluded = data.valuationDistribution
    ? Object.values(data.valuationDistribution).reduce(
        (acc, v) => acc + Number(v),
        0
      )
    : 0
  const countTotal = Number(data.feedbackCount ?? countIncluded)

  const perNmId = new Map<number, StorefrontPerNm>()
  for (const entry of data.nmValuationDistribution ?? []) {
    if (!entry.nm) continue
    perNmId.set(entry.nm, weightedMean(entry.valuationDistribution))
  }

  return { imtRoot: root, rating, countIncluded, countTotal, perNmId }
}

/**
 * Получить storefront-рейтинги для списка imt-root'ов (= WbCard.imtId).
 *
 * Не throw'ит — все ошибки превращаются в `null` для соответствующего root.
 * Caller получает Map только успешных ответов.
 *
 * Budget: ~78 imt-root'ов × ~400ms (fetch + 100ms pause) = ~30 секунд.
 * Без auth, без rate-limit, без curl — native fetch.
 */
export async function fetchStorefrontRatings(
  roots: number[]
): Promise<Map<number, StorefrontImtRating>> {
  const results = new Map<number, StorefrontImtRating>()
  // Уникальные roots — у одного imt может быть много карточек.
  const unique = Array.from(new Set(roots.filter((r) => r > 0)))

  for (const root of unique) {
    const r = await fetchOneRoot(root)
    if (r) results.set(root, r)
    await new Promise((res) => setTimeout(res, REQUEST_PAUSE_MS))
  }

  return results
}
