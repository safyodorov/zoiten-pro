// 2026-05-15 (quick 260515-o4o): Golden + edge tests для computeBuyerPriceRetro.
// Формула: sellerPrice × (1 − discountWb/100), Math.round.
import { describe, it, expect } from "vitest"
import { computeBuyerPriceRetro } from "@/lib/wb-cron-schedule"

describe("computeBuyerPriceRetro", () => {
  it("golden: sellerPrice=5310, discountWb=28.12 → 3817", () => {
    const result = computeBuyerPriceRetro({
      sellerPrice: 5310,
      discountWb: 28.12,
    })
    expect(result).toBe(3817)
  })

  it("rounding boundary (W-4): sellerPrice=5310, discountWb=28.123 → 3817", () => {
    // 5310 × (1 − 28.123/100) = 5310 × 0.71877 = 3816.6687 → Math.round = 3817
    const result = computeBuyerPriceRetro({
      sellerPrice: 5310,
      discountWb: 28.123,
    })
    expect(result).toBe(3817)
  })

  it("edge: discountWb=null → buyerPrice = sellerPrice (no discount)", () => {
    const result = computeBuyerPriceRetro({
      sellerPrice: 1000,
      discountWb: null,
    })
    expect(result).toBe(1000)
  })

  it("edge: discountWb=undefined → buyerPrice = sellerPrice", () => {
    const result = computeBuyerPriceRetro({
      sellerPrice: 1000,
      discountWb: undefined,
    })
    expect(result).toBe(1000)
  })

  it("edge: sellerPrice=0 → null", () => {
    const result = computeBuyerPriceRetro({
      sellerPrice: 0,
      discountWb: 25,
    })
    expect(result).toBeNull()
  })

  it("edge: sellerPrice=null → null", () => {
    const result = computeBuyerPriceRetro({
      sellerPrice: null,
      discountWb: 25,
    })
    expect(result).toBeNull()
  })

  it("edge: sellerPrice=undefined → null", () => {
    const result = computeBuyerPriceRetro({
      sellerPrice: undefined,
      discountWb: 25,
    })
    expect(result).toBeNull()
  })

  it("regular case: sellerPrice=1000, discountWb=10 → 900", () => {
    const result = computeBuyerPriceRetro({
      sellerPrice: 1000,
      discountWb: 10,
    })
    expect(result).toBe(900)
  })
})
