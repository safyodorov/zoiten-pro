import { describe, it, expect } from "vitest"
import { computeSalesPlan, type SalesPlanInputs } from "@/lib/sales-plan/engine"

// ──────────────────────────────────────────────────────────────────
// Golden test — 1 товар, 2 месяца, 2 партии прихода
//
// Контракт движка: computeSalesPlan(inputs) → SalesPlanResult
// Реализуется в Wave 1; этот стаб фиксирует интерфейс ДО реализации (RED).
// ──────────────────────────────────────────────────────────────────

const goldenInputs: SalesPlanInputs = {
  today: "2026-07-01",
  horizonFrom: "2026-07-01",
  horizonTo: "2026-08-31",
  deliveryDays: 3,
  returnDays: 3,
  wbInboundLagDays: 0,
  products: [
    {
      productId: "test-1",
      sku: "УКТ-000001",
      name: "Тестовый товар",
      nmIds: [12345678],
      stockNow: 100,
      baselineOrdersPerDay: 10,
      buyoutPct: 0.8,
      buyoutSource: "own",
      avgPriceRub: 5000,
      monthLevels: [
        { month: "2026-07-01", targetOrdersPerDay: 12, priceRub: 5000, buyoutPct: 0.8 },
        { month: "2026-08-01", targetOrdersPerDay: 15, priceRub: 5500, buyoutPct: 0.8 },
      ],
      dayOverrides: { "2026-07-15": 20 },
      arrivals: [
        { date: "2026-07-20", qty: 500, source: "purchase", refId: "p1", dateSource: "manual" },
        { date: "2026-08-10", qty: 300, source: "virtual", refId: "vp1", dateSource: "manual" },
      ],
      seedOrders: { "2026-06-28": 10, "2026-06-29": 12, "2026-06-30": 11 },
    },
  ],
}

describe("computeSalesPlan — индекс сезонности (множитель ставки)", () => {
  it("indexByMonth авг=200 → rateRequested(08-01) = 15 × 2 = 30; июль без индекса не тронут", () => {
    const withSeason: SalesPlanInputs = {
      ...goldenInputs,
      products: [{ ...goldenInputs.products[0], indexByMonth: { "2026-08-01": 200 } }],
    }
    const r = computeSalesPlan(withSeason)
    const aug = r.products[0].days.find((d) => d.date === "2026-08-01")
    expect(aug?.rateRequested).toBeCloseTo(30, 6) // 15 × 200/100
    // Июль без индекса — dayOverride 07-15 = 20, monthLevel 07-01 = 12 не изменились
    const jul15 = r.products[0].days.find((d) => d.date === "2026-07-15")
    expect(jul15?.rateRequested).toBe(20)
    const jul01 = r.products[0].days.find((d) => d.date === "2026-07-01")
    expect(jul01?.rateRequested).toBe(12)
  })

  it("отсутствие indexByMonth не меняет golden (обратная совместимость)", () => {
    const r = computeSalesPlan(goldenInputs)
    const aug = r.products[0].days.find((d) => d.date === "2026-08-01")
    expect(aug?.rateRequested).toBe(15)
  })
})

describe("computeSalesPlan — golden test", () => {
  const result = computeSalesPlan(goldenInputs)

  it("T+3 выкупы: заказ 2026-07-01 → выкуп 2026-07-04 ≈ 9.6", () => {
    const day = result.products[0].days.find((d) => d.date === "2026-07-04")
    expect(day?.buyoutsUnits).toBeCloseTo(12 * 0.8, 2)
  })

  it("day override 2026-07-15: rateRequested === 20", () => {
    const day = result.products[0].days.find((d) => d.date === "2026-07-15")
    expect(day?.rateRequested).toBe(20)
  })

  it("ступенька: 2026-08-01 rateRequested === 15 (не 12)", () => {
    const day = result.products[0].days.find((d) => d.date === "2026-08-01")
    expect(day?.rateRequested).toBe(15)
  })

  it("сток-лимит: orders[d] ≤ stockEnd предыдущего дня для всех дней", () => {
    const days = result.products[0].days
    for (let i = 1; i < days.length; i++) {
      expect(days[i].ordersUnits).toBeLessThanOrEqual(days[i - 1].stockEnd + 0.001)
    }
  })

  it("zero-guard: stockNow = 0 → ordersUnits = 0 до первого прихода", () => {
    const zeroInputs: SalesPlanInputs = {
      ...goldenInputs,
      products: [
        {
          ...goldenInputs.products[0],
          stockNow: 0,
          arrivals: [
            {
              date: "2026-07-10",
              qty: 200,
              source: "purchase",
              refId: "p2",
              dateSource: "manual",
            },
          ],
        },
      ],
    }
    const zeroResult = computeSalesPlan(zeroInputs)
    const daysBeforeArrival = zeroResult.products[0].days.filter((d) => d.date < "2026-07-10")
    for (const day of daysBeforeArrival) {
      expect(day.ordersUnits).toBe(0)
    }
  })
})

// ──────────────────────────────────────────────────────────────────
// Структурные инварианты
// ──────────────────────────────────────────────────────────────────

describe("computeSalesPlan — структура результата", () => {
  it("result.products[0] содержит поля days, monthTotals, firstStockoutDate, lostUnitsToStockout, lostRubToStockout", () => {
    const result = computeSalesPlan(goldenInputs)
    const p = result.products[0]
    expect(p).toHaveProperty("days")
    expect(p).toHaveProperty("monthTotals")
    expect(p).toHaveProperty("firstStockoutDate")
    expect(p).toHaveProperty("lostUnitsToStockout")
    expect(p).toHaveProperty("lostRubToStockout")
  })

  it("days покрывает весь горизонт horizonFrom…horizonTo", () => {
    const result = computeSalesPlan(goldenInputs)
    const days = result.products[0].days
    expect(days[0].date).toBe("2026-07-01")
    expect(days[days.length - 1].date).toBe("2026-08-31")
  })

  it("result содержит companyDaily и companyMonthly", () => {
    const result = computeSalesPlan(goldenInputs)
    expect(result).toHaveProperty("companyDaily")
    expect(result).toHaveProperty("companyMonthly")
  })
})
