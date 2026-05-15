import { describe, it, expect } from "vitest"
import { aggregateFeedbacks, wbDecayWeight, WB_RATING_FORMULA } from "@/lib/wb-ratings"
import type { Feedback } from "@/lib/wb-support-api"

// 2026-05-15 (260515 follow-up): Тесты для WB-документированной формулы.
// 15-recent rule: первые 15 свежих → w=1 ВСЕГДА → decay не виден.
// Чтобы тестировать decay — нужно > 15 feedback'ов в одном nmId.

const NOW = Date.parse("2026-05-15T00:00:00Z")
const RECENT = "2026-05-14"
const OLD = "2023-01-01" // > 2 years before NOW
const MS_PER_DAY = 86_400_000

function dateNDaysAgo(days: number): string {
  return new Date(NOW - days * MS_PER_DAY).toISOString().slice(0, 10)
}

function fb(
  nmId: number,
  imtId: number,
  valuation: number,
  opts: { state?: string; createdDate?: string } = {}
): Feedback {
  return {
    id: `${nmId}-${valuation}-${Math.random()}`,
    text: "",
    productValuation: valuation,
    createdDate: opts.createdDate ?? RECENT,
    state: opts.state ?? "wbRu",
    answer: null,
    productDetails: {
      imtId,
      nmId,
      productName: "x",
      supplierArticle: "y",
      brandName: "Z",
    },
    photoLinks: [],
    video: null,
  }
}

describe("wbDecayWeight", () => {
  it("d ≤ 182 → 1 (свежий период полного веса)", () => {
    expect(wbDecayWeight(0)).toBe(1)
    expect(wbDecayWeight(100)).toBe(1)
    expect(wbDecayWeight(182)).toBe(1)
  })

  it("d > 182 → exp decay (verified WB constants)", () => {
    expect(wbDecayWeight(200)).toBeCloseTo(0.9271, 3)
    expect(wbDecayWeight(365)).toBeCloseTo(0.4632, 3)
    expect(wbDecayWeight(730)).toBeCloseTo(0.0998, 3)
    expect(wbDecayWeight(1095)).toBeCloseTo(0.0215, 3)
  })

  it("константы экспортированы для тюнинга без правок кода", () => {
    expect(WB_RATING_FORMULA.FRESH_DAYS).toBe(182)
    expect(WB_RATING_FORMULA.DECAY_DIVISOR).toBe(1095)
    expect(WB_RATING_FORMULA.RECENT_FULL_WEIGHT).toBe(15)
    expect(WB_RATING_FORMULA.WINDOW_DAYS).toBe(730)
  })
})

describe("aggregateFeedbacks", () => {
  it("агрегирует per nmId и per imtId (recent wbRu — все w=1 через 15-rule)", () => {
    const r = aggregateFeedbacks(
      [fb(1, 10, 5), fb(1, 10, 4), fb(1, 10, 3), fb(1, 10, 2), fb(2, 10, 5)],
      { now: NOW }
    )
    expect(r.perNmId.get(1)).toEqual({
      rating: 3.5,
      count: 4,
      sumWeights: 4,
      imtId: 10,
    })
    expect(r.perNmId.get(2)).toEqual({
      rating: 5,
      count: 1,
      sumWeights: 1,
      imtId: 10,
    })
    expect(r.perImtId.get(10)).toEqual({ rating: 3.8, count: 5, sumWeights: 5 })
    expect(r.diagnostics.includedInAggregate).toBe(5)
  })

  it("игнорирует productValuation=0 и null", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bad = { ...fb(1, 10, 5), productValuation: null as any }
    const r = aggregateFeedbacks([bad, fb(1, 10, 0), fb(1, 10, 5)], { now: NOW })
    expect(r.perNmId.get(1)?.rating).toBe(5)
    expect(r.perNmId.get(1)?.count).toBe(1)
    expect(r.diagnostics.excludedByValuation).toBe(2)
  })

  it("imtId=0 → попадает в perNmId но не в perImtId", () => {
    const r = aggregateFeedbacks([fb(1, 0, 5), fb(2, 0, 4)], { now: NOW })
    expect(r.perNmId.size).toBe(2)
    expect(r.perImtId.size).toBe(0)
  })

  it("округление до 2 знаков", () => {
    const r = aggregateFeedbacks([fb(1, 10, 5), fb(1, 10, 5), fb(1, 10, 4)], { now: NOW })
    expect(r.perNmId.get(1)?.rating).toBe(4.67)
  })

  it("пустой массив → пустые Maps + totalProcessed=0", () => {
    const r = aggregateFeedbacks([], { now: NOW })
    expect(r.perNmId.size).toBe(0)
    expect(r.perImtId.size).toBe(0)
    expect(r.totalProcessed).toBe(0)
  })

  it("исключает state != wbRu (обнулённые/модерированные)", () => {
    const r = aggregateFeedbacks(
      [
        fb(1, 10, 5, { state: "wbRu" }),
        fb(1, 10, 5, { state: "wbRu" }),
        fb(1, 10, 4, { state: "wbRu" }),
        fb(1, 10, 4, { state: "wbRu" }),
        fb(1, 10, 1, { state: "none" }),
        fb(1, 10, 2, { state: "none" }),
        fb(1, 10, 2, { state: "wbBy" }),
      ],
      { now: NOW }
    )
    expect(r.perNmId.get(1)?.count).toBe(4)
    expect(r.perNmId.get(1)?.rating).toBe(4.5)
    expect(r.diagnostics.excludedByState).toBe(3)
    expect(r.diagnostics.states).toEqual({ wbRu: 4, none: 2, wbBy: 1 })
  })

  it("исключает старше 2 лет (730 дней) по createdDate", () => {
    const r = aggregateFeedbacks(
      [
        fb(1, 10, 5, { createdDate: RECENT }),
        fb(1, 10, 5, { createdDate: RECENT }),
        fb(1, 10, 2, { createdDate: OLD }),
        fb(1, 10, 2, { createdDate: OLD }),
      ],
      { now: NOW }
    )
    expect(r.perNmId.get(1)?.count).toBe(2)
    expect(r.perNmId.get(1)?.rating).toBe(5)
    expect(r.diagnostics.excludedByAge).toBe(2)
  })

  it("диагностика: state distribution + counters", () => {
    const r = aggregateFeedbacks(
      [
        fb(1, 10, 5, { state: "wbRu" }),
        fb(1, 10, 5, { state: "wbRu" }),
        fb(1, 10, 1, { state: "none" }),
        fb(1, 10, 3, { state: "wbRu", createdDate: OLD }),
      ],
      { now: NOW }
    )
    expect(r.diagnostics.totalFeedbacks).toBe(4)
    expect(r.diagnostics.excludedByState).toBe(1)
    expect(r.diagnostics.excludedByAge).toBe(1)
    expect(r.diagnostics.includedInAggregate).toBe(2)
    expect(r.diagnostics.states).toEqual({ wbRu: 3, none: 1 })
  })

  // ── WB-документированная формула: time-decay weighting ──────────

  it("первые 15 отзывов всегда w=1 (cold-start защита)", () => {
    // 15 свежих 5★ + 5 старых 5★ (730 дней) — 15-rule даёт всем w=1.
    // Rating = 5 (тривиально).
    const recent15 = Array.from({ length: 15 }, () =>
      fb(1, 10, 5, { createdDate: RECENT })
    )
    const old5 = Array.from({ length: 5 }, () =>
      fb(1, 10, 5, { createdDate: dateNDaysAgo(729) })
    )
    const r = aggregateFeedbacks([...recent15, ...old5], { now: NOW })
    expect(r.perNmId.get(1)?.rating).toBe(5)
    expect(r.perNmId.get(1)?.count).toBe(20)
    // первые 15 w=1, остальные 5 при ageDays=729 → w≈wbDecayWeight(729)
    // sumWeights = 15 + 5 × w(729) ≈ 15 + 5 × 0.1004 ≈ 15.50
    const expectedSumW = 15 + 5 * wbDecayWeight(729)
    expect(r.perNmId.get(1)?.sumWeights).toBeCloseTo(expectedSumW, 2)
  })

  it("15-rule: 15 свежих 5★ + 1 старый 1★ → почти не двигает рейтинг", () => {
    // 15 свежих 5★ (w=1) + 1 старый 1★ d=729 (w≈0.1)
    // (5×15 + 1×0.1004) / (15+0.1004) = 75.1004/15.1004 ≈ 4.974
    const recent = Array.from({ length: 15 }, () =>
      fb(1, 10, 5, { createdDate: RECENT })
    )
    const old1 = fb(1, 10, 1, { createdDate: dateNDaysAgo(729) })
    const r = aggregateFeedbacks([...recent, old1], { now: NOW })
    expect(r.perNmId.get(1)?.rating).toBeCloseTo(4.97, 1)
    expect(r.perNmId.get(1)?.count).toBe(16) // count не взвешен
  })

  it("decay виден на >15 entries (5 свежих 5★ + 12 старых 1★ → рейтинг падает)", () => {
    // 5 свежих 5★ (w=1) + 12 старых 1★ (w<1).
    // Сначала отсортируем по age asc: 5 свежих (ageDays≈1) + 12 старых (ageDays=729).
    // Top-15 → w=1: 5 свежих + 10 старых (т.к. сортировка свежие → старые, индексы 5..14
    // тоже получают w=1 несмотря на возраст 729).
    // Остаются 2 старых (индексы 15,16) → w=wbDecayWeight(729)≈0.1004.
    // sumWeighted = 5×5 + 10×1 + 2×1×0.1004 = 25 + 10 + 0.2008 = 35.2
    // sumWeights = 5 + 10 + 0.2008 = 15.2
    // rating ≈ 35.2 / 15.2 ≈ 2.316
    const recent5 = Array.from({ length: 5 }, () =>
      fb(1, 10, 5, { createdDate: RECENT })
    )
    const old12 = Array.from({ length: 12 }, () =>
      fb(1, 10, 1, { createdDate: dateNDaysAgo(729) })
    )
    const r = aggregateFeedbacks([...recent5, ...old12], { now: NOW })
    expect(r.perNmId.get(1)?.rating).toBeCloseTo(2.32, 1)
    expect(r.perNmId.get(1)?.count).toBe(17)
  })

  it("граница d=182 → w=1 (последний день свежего окна)", () => {
    // 1 отзыв на границе свежего окна.
    const r = aggregateFeedbacks([fb(1, 10, 4, { createdDate: dateNDaysAgo(182) })], {
      now: NOW,
    })
    expect(r.perNmId.get(1)?.rating).toBe(4)
    expect(r.perNmId.get(1)?.sumWeights).toBe(1)
  })

  it("граница d=183 → w<1 (но 15-rule всё ещё применяется)", () => {
    // 1 отзыв сразу за границей. 15-rule → w=1 (т.к. <15 отзывов).
    // Чтобы реально получить w<1 — нужно >15 отзывов с этим возрастом.
    const single = aggregateFeedbacks(
      [fb(1, 10, 4, { createdDate: dateNDaysAgo(183) })],
      { now: NOW }
    )
    // Из-за 15-rule single отзыв ВСЁ РАВНО w=1.
    expect(single.perNmId.get(1)?.sumWeights).toBe(1)

    // А вот при 16 отзывах за пределами 15-rule decay включается:
    const many = Array.from({ length: 16 }, () =>
      fb(1, 10, 5, { createdDate: dateNDaysAgo(183) })
    )
    const r = aggregateFeedbacks(many, { now: NOW })
    // 15 → w=1, 1 → w=wbDecayWeight(183). sumWeights округлено до 2 знаков → tolerance 0.05.
    const expectedSumW = 15 + wbDecayWeight(183)
    expect(r.perNmId.get(1)?.sumWeights).toBeCloseTo(expectedSumW, 1)
    // rating всё равно 5 (все 5★)
    expect(r.perNmId.get(1)?.rating).toBe(5)
  })

  it("сортировка по дате: 15 САМЫХ СВЕЖИХ получают w=1 (а не первые 15 в массиве)", () => {
    // Подаём в массиве сначала 10 старых 1★, потом 10 свежих 5★.
    // Если сортировка работает — top-15 = 10 свежих + 5 старых.
    // Свежие 5★ × w=1 (10×5×1 = 50)
    // 5 старых 1★ × w=1 через 15-rule (5×1×1 = 5)
    // 5 старых 1★ × w=wbDecayWeight(729)≈0.1004 (5×1×0.1004 = 0.502)
    // sumWeighted = 50 + 5 + 0.502 = 55.5
    // sumWeights = 10 + 5 + 0.502 = 15.5
    // rating ≈ 55.5 / 15.5 ≈ 3.58
    const old = Array.from({ length: 10 }, () =>
      fb(1, 10, 1, { createdDate: dateNDaysAgo(729) })
    )
    const fresh = Array.from({ length: 10 }, () =>
      fb(1, 10, 5, { createdDate: RECENT })
    )
    const r = aggregateFeedbacks([...old, ...fresh], { now: NOW })
    expect(r.perNmId.get(1)?.rating).toBeCloseTo(3.58, 1)
  })
})
