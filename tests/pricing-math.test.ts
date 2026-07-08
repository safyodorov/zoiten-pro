import { describe, it, expect } from "vitest"
import {
  calculatePricing,
  calculatePricingStandard,
  reverseLogisticsForVolume,
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
// reverseLogisticsForVolume — бэнды объёма (Фаза B v3, 2026-07-08)
// ──────────────────────────────────────────────────────────────────
//
// Официальная формула ВБ: бэнды ≤1л фиксированы (23/26/29/30/32 ₽, верхняя
// граница включительно), V>1 = baseRub + perLiterRub×(V−1). baseRub=46, perLiterRub=14.

describe("reverseLogisticsForVolume — бэнды объёма", () => {
  it("V=0 → 0", () => {
    expect(reverseLogisticsForVolume(0, 46, 14)).toBe(0)
  })
  it("V=0.1 → 23", () => {
    expect(reverseLogisticsForVolume(0.1, 46, 14)).toBe(23)
  })
  it("V=0.3 → 26", () => {
    expect(reverseLogisticsForVolume(0.3, 46, 14)).toBe(26)
  })
  it("V=0.5 → 29", () => {
    expect(reverseLogisticsForVolume(0.5, 46, 14)).toBe(29)
  })
  it("V=0.7 → 30", () => {
    expect(reverseLogisticsForVolume(0.7, 46, 14)).toBe(30)
  })
  it("V=0.9 → 32", () => {
    expect(reverseLogisticsForVolume(0.9, 46, 14)).toBe(32)
  })
  it("V=1.0 → 32", () => {
    expect(reverseLogisticsForVolume(1.0, 46, 14)).toBe(32)
  })
  it("V=2 → 60 (46+14)", () => {
    expect(reverseLogisticsForVolume(2, 46, 14)).toBe(60)
  })
  it("V=5 → 102 (46+56)", () => {
    expect(reverseLogisticsForVolume(5, 46, 14)).toBe(102)
  })
})

// ──────────────────────────────────────────────────────────────────
// calculatePricingStandard — std-golden test v3 (Фаза B v3, 2026-07-08)
// ──────────────────────────────────────────────────────────────────
//
// Source: docs/superpowers/specs/2026-07-07-wb-planned-prices-standard-finres-design.md §4 (v3).
// Использует goldenInputs (nmId 800750522) + std-параметры v3 ниже (обратная
// логистика невыкупа — volume-based вместо плоской ставки; ИРП-надбавка на
// Л_туда; статья «Возврат продавцу» убрана из profitStd).
// Точный пересчёт вручную из формул §4 v3:
//   sellerPriceForIrp = 25833 × (1−0.7) = 7749.9 ₽
//   Л_туда = (94.3 + 28.7×max(0,5−1)) × 1.11 + 7749.9×(1.56/100)
//          = 209.1×1.11 + 120.89844 = 232.101 + 120.89844 = 352.99944 ₽
//   Л_обратно = reverseLogisticsForVolume(5, 46, 14) = 46 + 14×4 = 102 ₽
//   Л_эфф  = [352.99944 + (1−0.9)×102] / 0.9 = 363.19944/0.9 ≈ 403.5549 ₽
//   Хранение = (0.16 + 0.16×max(0,5−1)) × 60 = 0.8 × 60 = 48 ₽
//   base.profit (commFbwPct=25 std, deliveryCostRub=Л_эфф) ≈ 781.5708 ₽
//   profitStd = base.profit − 48 ≈ 733.5708 ₽  (БЕЗ вычета возврата-продавцу)
//   roiPctStd = profitStd / 2204 × 100 ≈ 33.2814 %
//   returnOnSalesPctStd = profitStd / 7749.9 × 100 ≈ 9.4654 %

const stdParams = {
  commStdPct: 25,
  volumeLiters: 5,
  buyoutPct: 90,
  delivBaseLiter: 94.3,
  delivAddLiter: 28.7,
  storageBaseLiter: 0.16,
  storageAddLiter: 0.16,
  localizationIndex: 1.11,
  irpPct: 1.56,
  reverseLogBaseRub: 46,
  reverseLogPerLiterRub: 14,
  daysInStock: 60,
}

describe("calculatePricingStandard — std-golden test v3 nmId 800750522", () => {
  const out = calculatePricingStandard({ ...goldenInputs, ...stdParams })

  it("logisticsToAmount (Л_туда) ≈ 352.9994 ₽ (с ИРП-надбавкой)", () => {
    expect(out.logisticsToAmount).toBeCloseTo(352.99944, 3)
  })

  it("reverseLogisticsAmount (Л_обратно) = 102 ₽ (volume-based)", () => {
    expect(out.reverseLogisticsAmount).toBeCloseTo(102, 2)
  })

  it("logisticsEffAmount (Л_эфф) ≈ 403.5549 ₽", () => {
    expect(out.logisticsEffAmount).toBeCloseTo(403.5549, 3)
  })

  it("storageAmount (Хранение) = 48 ₽", () => {
    expect(out.storageAmount).toBeCloseTo(48, 2)
  })

  it("profitStd ≈ 733.57 ₽ (std-golden v3, БЕЗ возврата-продавцу)", () => {
    expect(out.profitStd).toBeCloseTo(733.5708, 2)
  })

  it("roiPctStd ≈ 33.28 %", () => {
    expect(out.roiPctStd).toBeCloseTo(33.2814, 1)
  })

  it("returnOnSalesPctStd ≈ 9.47 %", () => {
    expect(out.returnOnSalesPctStd).toBeCloseTo(9.4654, 1)
  })

  it("возвращает конечный base.profit (не золотой — комиссия/доставка переопределены на std)", () => {
    // out.profit здесь — ЭТО profit std-ядра (commFbwPct=25, deliveryCostRub=Л_эфф),
    // а НЕ golden 567.683 (тот считается отдельно через calculatePricing(goldenInputs)
    // без std-переопределений — см. следующий describe).
    expect(Number.isFinite(out.profit)).toBe(true)
    expect(out.profit).toBeCloseTo(781.5708, 2)
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
    // без volumeLiters → V=0 → reverseLogisticsForVolume(0,...) = 0
    expect(Number.isFinite(out.reverseLogisticsAmount)).toBe(true)
    expect(out.reverseLogisticsAmount).toBe(0)
  })
})
