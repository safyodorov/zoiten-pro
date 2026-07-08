import { describe, it, expect } from "vitest"
import {
  calculatePricing,
  calculatePricingStandard,
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

// ──────────────────────────────────────────────────────────────────
// calculatePricingStandard — std-golden test v2 (Фаза B v2, 2026-07-08)
// ──────────────────────────────────────────────────────────────────
//
// Source: docs/superpowers/specs/2026-07-07-wb-planned-prices-standard-finres-design.md §4 (v2).
// Использует goldenInputs (nmId 800750522) + std-параметры v2 ниже (реальные
// per-склад эфф-ставки acceptance/coefficients вместо v1 флэт-box; коэффициент
// склада УЖЕ вшит в ставку → НЕ умножается повторно; хранение теперь база+доп-литр).
// Точный пересчёт вручную из формул §4 v2:
//   Л_туда = (94.3 + 28.7×max(0,5−1)) × 1.0 = 94.3 + 114.8 = 209.1 ₽
//   Л_эфф  = [209.1 + (1−0.9)×50] / 0.9 = 214.1/0.9 = 237.888888… ₽
//   Хранение = (0.16 + 0.16×max(0,5−1)) × 60 = 0.8 × 60 = 48 ₽
//   Возврат-продавцу = 250 × (2/100) = 5 ₽
//   base.profit (commFbwPct=25 std, deliveryCostRub=Л_эфф) ≈ 947.236811 ₽
//   profitStd = base.profit − 48 − 5 ≈ 894.236811 ₽
//   roiPctStd = profitStd / 2204 × 100 ≈ 40.5734 %
//   returnOnSalesPctStd = profitStd / 7749.9 × 100 ≈ 11.5387 %

const stdParams = {
  commStdPct: 25,
  volumeLiters: 5,
  buyoutPct: 90,
  delivBaseLiter: 94.3,
  delivAddLiter: 28.7,
  storageBaseLiter: 0.16,
  storageAddLiter: 0.16,
  localizationIndex: 1.0,
  returnLogisticsRub: 50,
  returnToSellerRub: 250,
  daysInStock: 60,
}

describe("calculatePricingStandard — std-golden test v2 nmId 800750522", () => {
  const out = calculatePricingStandard({ ...goldenInputs, ...stdParams })

  it("logisticsToAmount (Л_туда) = 209.1 ₽", () => {
    expect(out.logisticsToAmount).toBeCloseTo(209.1, 2)
  })

  it("logisticsEffAmount (Л_эфф) ≈ 237.8889 ₽", () => {
    expect(out.logisticsEffAmount).toBeCloseTo(237.8889, 3)
  })

  it("storageAmount (Хранение) = 48 ₽", () => {
    expect(out.storageAmount).toBeCloseTo(48, 2)
  })

  it("returnToSellerAmount (Возврат продавцу) = 5 ₽", () => {
    expect(out.returnToSellerAmount).toBeCloseTo(5, 2)
  })

  it("profitStd ≈ 894.24 ₽ (std-golden v2)", () => {
    expect(out.profitStd).toBeCloseTo(894.2368, 2)
  })

  it("roiPctStd ≈ 40.57 %", () => {
    expect(out.roiPctStd).toBeCloseTo(40.5734, 1)
  })

  it("returnOnSalesPctStd ≈ 11.54 %", () => {
    expect(out.returnOnSalesPctStd).toBeCloseTo(11.5387, 1)
  })

  it("возвращает конечный base.profit (не золотой — комиссия/доставка переопределены на std)", () => {
    // out.profit здесь — ЭТО profit std-ядра (commFbwPct=25, deliveryCostRub=Л_эфф),
    // а НЕ golden 567.683 (тот считается отдельно через calculatePricing(goldenInputs)
    // без std-переопределений — см. следующий describe).
    expect(Number.isFinite(out.profit)).toBe(true)
    expect(out.profit).toBeCloseTo(947.2368, 2)
  })
})

describe("calculatePricing — golden первого блока НЕ сломан std-функцией", () => {
  it("calculatePricing(goldenInputs) без std-полей — profit/roiPct/returnOnSalesPct как раньше", () => {
    const out = calculatePricing(goldenInputs)
    expect(out.profit).toBeCloseTo(567.683, 1)
    expect(out.roiPct).toBeCloseTo(25.76, 1)
    expect(out.returnOnSalesPct).toBeCloseTo(7.33, 1)
    // Опциональные std-поля отсутствуют в PricingOutputs первого блока
    expect(out.profitStd).toBeUndefined()
  })
})

describe("calculatePricingStandard — zero guards", () => {
  it("buyoutPct=0 → logisticsEffAmount = logisticsToAmount (guard, без NaN/Infinity)", () => {
    const out = calculatePricingStandard({
      ...goldenInputs,
      ...stdParams,
      buyoutPct: 0,
    })
    expect(out.logisticsEffAmount).toBe(out.logisticsToAmount)
    expect(Number.isFinite(out.logisticsEffAmount)).toBe(true)
    expect(Number.isFinite(out.profitStd)).toBe(true)
    expect(Number.isNaN(out.profitStd)).toBe(false)
  })

  it("costPrice=0 → roiPctStd=0 (без NaN)", () => {
    const out = calculatePricingStandard({
      ...goldenInputs,
      ...stdParams,
      costPrice: 0,
    })
    expect(out.roiPctStd).toBe(0)
    expect(Number.isFinite(out.roiPctStd)).toBe(true)
  })

  it("priceBeforeDiscount=0 → sellerPrice=0 → returnOnSalesPctStd=0 (без Infinity)", () => {
    const out = calculatePricingStandard({
      ...goldenInputs,
      ...stdParams,
      priceBeforeDiscount: 0,
    })
    expect(out.sellerPrice).toBe(0)
    expect(out.returnOnSalesPctStd).toBe(0)
    expect(Number.isFinite(out.returnOnSalesPctStd)).toBe(true)
  })

  it("без std-входов (volumeLiters/delivBaseLiter и т.п. отсутствуют) — дефолты не дают NaN", () => {
    const out = calculatePricingStandard(goldenInputs)
    expect(Number.isFinite(out.profitStd)).toBe(true)
    expect(Number.isFinite(out.storageAmount)).toBe(true)
    expect(out.storageAmount).toBe(0) // storageBaseLiter default 0 → без габаритов хранение = 0
    // returnToSellerRub default 0 → возврат-продавцу конечен и равен 0
    expect(Number.isFinite(out.returnToSellerAmount)).toBe(true)
    expect(out.returnToSellerAmount).toBe(0)
  })
})
