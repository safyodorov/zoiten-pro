import { describe, it, expect } from "vitest"
import {
  calculatePricing,
  COLUMN_ORDER,
  type PricingInputs,
} from "@/lib/pricing-math"

// ──────────────────────────────────────────────────────────────────
// Golden test — nmId 800750522
// ──────────────────────────────────────────────────────────────────
//
// Source of truth: C:/Users/User/Desktop/Форма управления ценами.xlsx
// Строка 11 (row index 11) содержит реальный пример расчёта для одной
// текущей цены товара. Все формулы в calculatePricing выведены ровно
// из формул этого Excel-файла.
//
// ВАЖНО: creditPct здесь 3, а не 7. Excel использует 3% кредит для этой
// строки; план 07-02 ошибочно указывал 7%. Tolerance для profit: 0.01 ₽.

const goldenInputs: PricingInputs = {
  priceBeforeDiscount: 25833,
  sellerDiscountPct: 70,
  wbDiscountPct: 25,
  clubDiscountPct: 0,
  commFbwPct: 32.58,
  drrPct: 10,
  walletPct: 2,
  acquiringPct: 2.7,
  jemPct: 1,
  costPrice: 2204,
  defectRatePct: 2,
  deliveryCostRub: 30,
  creditPct: 3,
  overheadPct: 6,
  taxPct: 8,
  buyoutPct: 100,
}

describe("calculatePricing — golden test nmId 800750522", () => {
  const out = calculatePricing(goldenInputs)

  it("sellerPrice = 7749.9 ₽", () => {
    expect(out.sellerPrice).toBeCloseTo(7749.9, 2)
  })

  it("priceAfterWbDiscount = 5812.425 ₽", () => {
    expect(out.priceAfterWbDiscount).toBeCloseTo(5812.425, 2)
  })

  it("priceAfterWallet = 5696.1765 ₽", () => {
    expect(out.priceAfterWallet).toBeCloseTo(5696.1765, 2)
  })

  it("acquiringAmount = 209.2473 ₽", () => {
    expect(out.acquiringAmount).toBeCloseTo(209.2473, 2)
  })

  it("commissionAmount = 2524.917 ₽", () => {
    expect(out.commissionAmount).toBeCloseTo(2524.917, 1)
  })

  it("drrAmount (Реклама) = 774.99 ₽", () => {
    expect(out.drrAmount).toBeCloseTo(774.99, 2)
  })

  it("jemAmount = 77.499 ₽", () => {
    expect(out.jemAmount).toBeCloseTo(77.499, 2)
  })

  it("transferAmount (К перечислению) = 4163.246 ₽", () => {
    expect(out.transferAmount).toBeCloseTo(4163.246, 1)
  })

  it("defectAmount = 44.08 ₽", () => {
    expect(out.defectAmount).toBeCloseTo(44.08, 2)
  })

  it("creditAmount = 232.497 ₽", () => {
    expect(out.creditAmount).toBeCloseTo(232.497, 2)
  })

  it("overheadAmount = 464.994 ₽", () => {
    expect(out.overheadAmount).toBeCloseTo(464.994, 2)
  })

  it("taxAmount = 619.992 ₽", () => {
    expect(out.taxAmount).toBeCloseTo(619.992, 2)
  })

  it("profit ≈ 567.68 ₽ (золотой тест)", () => {
    expect(out.profit).toBeCloseTo(567.683, 1)
  })

  it("returnOnSalesPct ≈ 7.33 %", () => {
    expect(out.returnOnSalesPct).toBeCloseTo(7.33, 1)
  })

  it("roiPct ≈ 25.76 %", () => {
    expect(out.roiPct).toBeCloseTo(25.76, 1)
  })
})

// ──────────────────────────────────────────────────────────────────
// Zero-guard tests
// ──────────────────────────────────────────────────────────────────

describe("calculatePricing — zero guards", () => {
  it("sellerPrice=0 не даёт Infinity в returnOnSalesPct", () => {
    const out = calculatePricing({
      ...goldenInputs,
      priceBeforeDiscount: 0,
    })
    expect(out.sellerPrice).toBe(0)
    expect(Number.isFinite(out.returnOnSalesPct)).toBe(true)
    expect(Number.isNaN(out.returnOnSalesPct)).toBe(false)
    expect(out.returnOnSalesPct).toBe(0)
  })

  it("costPrice=0 не даёт NaN в roiPct", () => {
    const out = calculatePricing({
      ...goldenInputs,
      costPrice: 0,
    })
    expect(out.defectAmount).toBe(0)
    expect(Number.isFinite(out.roiPct)).toBe(true)
    expect(Number.isNaN(out.roiPct)).toBe(false)
    expect(out.roiPct).toBe(0)
  })

  it("отрицательная priceBeforeDiscount обрабатывается как 0", () => {
    const out = calculatePricing({
      ...goldenInputs,
      priceBeforeDiscount: -100,
    })
    expect(out.sellerPrice).toBe(0)
    expect(Number.isFinite(out.profit)).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────────────
// Club discount > 0 — убеждаемся, что transferAmount корректно
// учитывает скидку клуба (ненулевой clubDiscount не ломает формулу)
// ──────────────────────────────────────────────────────────────────

describe("calculatePricing — club discount > 0", () => {
  it("при clubDiscountPct=5 priceAfterClubDiscount пересчитывается, transferAmount остаётся конечным", () => {
    const out = calculatePricing({ ...goldenInputs, clubDiscountPct: 5 })
    // priceAfterWbDiscount = 5812.425
    // priceAfterClubDiscount = 5812.425 × 0.95 = 5521.80375
    expect(out.priceAfterClubDiscount).toBeCloseTo(5521.80375, 2)
    // clubDiscountAmount = 5812.425 × 0.05 = 290.62125
    expect(out.clubDiscountAmount).toBeCloseTo(290.62125, 2)
    // Прибыль должна быть меньше golden (из-за вычета клубной скидки)
    expect(out.profit).toBeLessThan(567.683)
    expect(Number.isFinite(out.profit)).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────────────
// COLUMN_ORDER — структурная проверка
// ──────────────────────────────────────────────────────────────────

describe("COLUMN_ORDER", () => {
  it("содержит ровно 30 колонок (без Фото — rowSpan-группировка)", () => {
    expect(COLUMN_ORDER).toHaveLength(30)
  })

  it("первая колонка — Сводка, последняя — ROI, %", () => {
    expect(COLUMN_ORDER[0]).toBe("Сводка")
    expect(COLUMN_ORDER[COLUMN_ORDER.length - 1]).toBe("ROI, %")
  })

  it("не содержит колонку Фото (она обрабатывается rowSpan)", () => {
    expect(COLUMN_ORDER).not.toContain("Фото")
  })

  it("содержит все ключевые колонки формул", () => {
    expect(COLUMN_ORDER).toContain("Цена для установки")
    expect(COLUMN_ORDER).toContain("Цена продавца")
    expect(COLUMN_ORDER).toContain("К перечислению")
    expect(COLUMN_ORDER).toContain("Прибыль, руб.")
    expect(COLUMN_ORDER).toContain("Re продаж, %")
  })
})
