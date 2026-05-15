import { describe, it, expect } from "vitest"
import { aggregateFeedbacks } from "@/lib/wb-ratings"
import type { Feedback } from "@/lib/wb-support-api"

function fb(nmId: number, imtId: number, valuation: number): Feedback {
  return {
    id: `${nmId}-${valuation}-${Math.random()}`,
    text: "",
    productValuation: valuation,
    createdDate: "2026-05-14",
    state: "wbRu",
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
  it("агрегирует per nmId и per imtId", () => {
    const r = aggregateFeedbacks([
      fb(1, 10, 5),
      fb(1, 10, 4),
      fb(1, 10, 3),
      fb(1, 10, 2),
      fb(2, 10, 5),
    ])
    expect(r.perNmId.get(1)).toEqual({ rating: 3.5, count: 4, imtId: 10 })
    expect(r.perNmId.get(2)).toEqual({ rating: 5, count: 1, imtId: 10 })
    expect(r.perImtId.get(10)).toEqual({ rating: 3.8, count: 5 })
  })

  it("игнорирует productValuation=0 и null", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bad = { ...fb(1, 10, 5), productValuation: null as any }
    const r = aggregateFeedbacks([bad, fb(1, 10, 0), fb(1, 10, 5)])
    expect(r.perNmId.get(1)).toEqual({ rating: 5, count: 1, imtId: 10 })
  })

  it("imtId=0 → попадает в perNmId но не в perImtId", () => {
    const r = aggregateFeedbacks([fb(1, 0, 5), fb(2, 0, 4)])
    expect(r.perNmId.size).toBe(2)
    expect(r.perImtId.size).toBe(0)
  })

  it("округление до 2 знаков", () => {
    const r = aggregateFeedbacks([fb(1, 10, 5), fb(1, 10, 5), fb(1, 10, 4)])
    expect(r.perNmId.get(1)?.rating).toBe(4.67)
  })

  it("пустой массив → пустые Maps + totalProcessed=0", () => {
    const r = aggregateFeedbacks([])
    expect(r.perNmId.size).toBe(0)
    expect(r.perImtId.size).toBe(0)
    expect(r.totalProcessed).toBe(0)
  })
})
