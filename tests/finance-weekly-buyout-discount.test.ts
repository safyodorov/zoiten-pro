// tests/finance-weekly-buyout-discount.test.ts
// Quick 260714-maz: unit-тесты pure-функции discountAppliancesByBuyout —
// дисконт базиса бытовой техники (заказы × % выкупа) в понедельном фин-отчёте
// /finance/weekly.
//
// Тест-файл pure: ноль импортов Prisma/React.

import { describe, it, expect } from "vitest"

import { discountAppliancesByBuyout } from "@/lib/finance-weekly/buyout-discount"

describe("discountAppliancesByBuyout", () => {
  it("K-инвариант: (100, 50000, 87) → {qty:87, rub:43500}; rub/qty === 500 === 50000/100", () => {
    const result = discountAppliancesByBuyout(100, 50000, 87)
    expect(result).toEqual({ qty: 87, rub: 43500 })
    expect(result.rub / result.qty).toBeCloseTo(500, 10)
    expect(50000 / 100).toBe(500)
  })

  it("no-op при 100% выкупа: (10, 5000, 100) → {qty:10, rub:5000}", () => {
    expect(discountAppliancesByBuyout(10, 5000, 100)).toEqual({ qty: 10, rub: 5000 })
  })

  it("дробное без округления: (4, 2000, 87.5) → qty 3.5, rub 1750; rub/qty === 500", () => {
    const result = discountAppliancesByBuyout(4, 2000, 87.5)
    expect(result.qty).toBeCloseTo(3.5, 10)
    expect(result.rub).toBeCloseTo(1750, 10)
    expect(result.rub / result.qty).toBeCloseTo(500, 10)
  })

  it("zero-guard: (0, 0, 87) → {qty:0, rub:0}", () => {
    expect(discountAppliancesByBuyout(0, 0, 87)).toEqual({ qty: 0, rub: 0 })
  })
})
