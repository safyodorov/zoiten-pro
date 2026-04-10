import { describe, it, expect } from "vitest"
import {
  resolveDrrPct,
  resolveDefectRatePct,
  resolveDeliveryCostRub,
  HARDCODED_DRR_PCT,
  HARDCODED_DEFECT_RATE_PCT,
  HARDCODED_DELIVERY_COST_RUB,
} from "@/lib/pricing-math"

// ──────────────────────────────────────────────────────────────────
// D-01: Fallback chain
//   override (Product) → default (Subcategory/Category) → hardcoded
// ──────────────────────────────────────────────────────────────────

describe("resolveDrrPct — fallback chain", () => {
  it("возвращает Product override если задан", () => {
    expect(
      resolveDrrPct({ productOverride: 15, subcategoryDefault: 12 })
    ).toBe(15)
  })

  it("возвращает Subcategory default если нет override", () => {
    expect(
      resolveDrrPct({ productOverride: null, subcategoryDefault: 12 })
    ).toBe(12)
  })

  it("возвращает hardcoded 10% если нет ни override, ни default", () => {
    expect(
      resolveDrrPct({ productOverride: null, subcategoryDefault: null })
    ).toBe(HARDCODED_DRR_PCT)
    expect(HARDCODED_DRR_PCT).toBe(10)
  })

  it("override=0 — валидное значение (не проваливается в default)", () => {
    expect(
      resolveDrrPct({ productOverride: 0, subcategoryDefault: 12 })
    ).toBe(0)
  })
})

describe("resolveDefectRatePct — fallback chain", () => {
  it("возвращает Product override если задан", () => {
    expect(
      resolveDefectRatePct({ productOverride: 5, categoryDefault: 3 })
    ).toBe(5)
  })

  it("возвращает Category default если нет override", () => {
    expect(
      resolveDefectRatePct({ productOverride: null, categoryDefault: 3 })
    ).toBe(3)
  })

  it("возвращает hardcoded 2% если нет ни override, ни default", () => {
    expect(
      resolveDefectRatePct({ productOverride: null, categoryDefault: null })
    ).toBe(HARDCODED_DEFECT_RATE_PCT)
    expect(HARDCODED_DEFECT_RATE_PCT).toBe(2)
  })

  it("override=0 — валидное значение", () => {
    expect(
      resolveDefectRatePct({ productOverride: 0, categoryDefault: 3 })
    ).toBe(0)
  })
})

describe("resolveDeliveryCostRub", () => {
  it("возвращает Product value если задан", () => {
    expect(resolveDeliveryCostRub(50)).toBe(50)
  })

  it("возвращает hardcoded 30 ₽ если null", () => {
    expect(resolveDeliveryCostRub(null)).toBe(HARDCODED_DELIVERY_COST_RUB)
    expect(HARDCODED_DELIVERY_COST_RUB).toBe(30)
  })

  it("значение 0 — валидное (бесплатная доставка)", () => {
    expect(resolveDeliveryCostRub(0)).toBe(0)
  })
})
