import { describe, it, expect } from "vitest"
import { aggregateFeedbacks } from "@/lib/wb-ratings"
import type { Feedback } from "@/lib/wb-support-api"

// 2026-05-15 (260515 follow-up): Тесты обновлены под state="wbRu" filter
// и 2-year cutoff. NOW для детерминизма передаётся через opts.

const NOW = Date.parse("2026-05-15T00:00:00Z")
const RECENT = "2026-05-14"
const OLD = "2023-01-01" // > 2 years before NOW

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

describe("aggregateFeedbacks", () => {
  it("агрегирует per nmId и per imtId (recent wbRu)", () => {
    const r = aggregateFeedbacks(
      [fb(1, 10, 5), fb(1, 10, 4), fb(1, 10, 3), fb(1, 10, 2), fb(2, 10, 5)],
      { now: NOW }
    )
    expect(r.perNmId.get(1)).toEqual({ rating: 3.5, count: 4, imtId: 10 })
    expect(r.perNmId.get(2)).toEqual({ rating: 5, count: 1, imtId: 10 })
    expect(r.perImtId.get(10)).toEqual({ rating: 3.8, count: 5 })
    expect(r.diagnostics.includedInAggregate).toBe(5)
  })

  it("игнорирует productValuation=0 и null", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bad = { ...fb(1, 10, 5), productValuation: null as any }
    const r = aggregateFeedbacks([bad, fb(1, 10, 0), fb(1, 10, 5)], { now: NOW })
    expect(r.perNmId.get(1)).toEqual({ rating: 5, count: 1, imtId: 10 })
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
    // 4 публичных + 3 обнулённых. В агрегат идут только публичные.
    // Без фильтра avg был бы 23/7 = 3.29; с фильтром 18/4 = 4.5.
    const r = aggregateFeedbacks(
      [
        fb(1, 10, 5, { state: "wbRu" }),
        fb(1, 10, 5, { state: "wbRu" }),
        fb(1, 10, 4, { state: "wbRu" }),
        fb(1, 10, 4, { state: "wbRu" }),
        fb(1, 10, 1, { state: "none" }),
        fb(1, 10, 2, { state: "none" }),
        fb(1, 10, 2, { state: "wbBy" }), // другой регион — пока тоже исключаем
      ],
      { now: NOW }
    )
    expect(r.perNmId.get(1)?.count).toBe(4)
    expect(r.perNmId.get(1)?.rating).toBe(4.5)
    expect(r.perImtId.get(10)?.count).toBe(4)
    expect(r.diagnostics.excludedByState).toBe(3)
    expect(r.diagnostics.states).toEqual({ wbRu: 4, none: 2, wbBy: 1 })
  })

  it("исключает старше 2 лет по createdDate", () => {
    // 2 свежих + 2 старых (одинаковые валюэйшены) — без фильтра agg = 3.5;
    // с фильтром только свежие 5,5 → avg 5.
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
})
