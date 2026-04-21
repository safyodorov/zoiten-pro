import { describe, it, expect } from "vitest"
import { calculateStockMetrics, deficitThreshold } from "@/lib/stock-math"

describe("calculateStockMetrics", () => {
  it("happy path: О=100, З=5, norm=37 → Об=20, Д=-44.5 (зелёный)", () => {
    const result = calculateStockMetrics({ stock: 100, ordersPerDay: 5, turnoverNormDays: 37 })
    // Об = 100 / 5 = 20
    // Д = 37 * 0.3 * 5 - 100 = 55.5 - 100 = -44.5
    expect(result.turnoverDays).toBeCloseTo(20, 5)
    expect(result.deficit).toBeCloseTo(-44.5, 5)
  })

  it("О=null → {null, null}", () => {
    const result = calculateStockMetrics({ stock: null, ordersPerDay: 5, turnoverNormDays: 37 })
    expect(result.turnoverDays).toBeNull()
    expect(result.deficit).toBeNull()
  })

  it("З=0 → Об=null, Д=-100 (зелёный — нет продаж, есть запас)", () => {
    const result = calculateStockMetrics({ stock: 100, ordersPerDay: 0, turnoverNormDays: 37 })
    // Об = null (нет продаж — бесконечная оборачиваемость)
    // Д = 37 * 0.3 * 0 - 100 = 0 - 100 = -100
    expect(result.turnoverDays).toBeNull()
    expect(result.deficit).toBeCloseTo(-100, 5)
  })

  it("З=null → {null, null}", () => {
    const result = calculateStockMetrics({ stock: 100, ordersPerDay: null, turnoverNormDays: 37 })
    expect(result.turnoverDays).toBeNull()
    expect(result.deficit).toBeNull()
  })

  it("normDays=0 → {null, null}", () => {
    const result = calculateStockMetrics({ stock: 100, ordersPerDay: 5, turnoverNormDays: 0 })
    expect(result.turnoverDays).toBeNull()
    expect(result.deficit).toBeNull()
  })

  it("О=0, З=5, norm=37 → Об=0, Д=55.5 (красный — дефицит)", () => {
    const result = calculateStockMetrics({ stock: 0, ordersPerDay: 5, turnoverNormDays: 37 })
    // Об = 0 / 5 = 0
    // Д = 37 * 0.3 * 5 - 0 = 55.5
    expect(result.turnoverDays).toBeCloseTo(0, 5)
    expect(result.deficit).toBeCloseTo(55.5, 5)
  })

  it("О=185, З=5, norm=37 → Об=37, Д=0 (ровно на норме)", () => {
    const result = calculateStockMetrics({ stock: 185, ordersPerDay: 5, turnoverNormDays: 37 })
    // Об = 185 / 5 = 37
    // Д = 37 * 0.3 * 5 - 185 = 55.5 - 185 = -129.5
    expect(result.turnoverDays).toBeCloseTo(37, 5)
    expect(result.deficit).toBeCloseTo(-129.5, 5)
  })

  it("normDays=-1 → {null, null} (отрицательная норма недопустима)", () => {
    const result = calculateStockMetrics({ stock: 100, ordersPerDay: 5, turnoverNormDays: -1 })
    expect(result.turnoverDays).toBeNull()
    expect(result.deficit).toBeNull()
  })
})

describe("deficitThreshold", () => {
  it("norm=37, З=5 → 55.5", () => {
    expect(deficitThreshold(37, 5)).toBeCloseTo(55.5, 5)
  })

  it("З=null → null", () => {
    expect(deficitThreshold(37, null)).toBeNull()
  })

  it("З=0 → null (нет порога при нулевых продажах)", () => {
    expect(deficitThreshold(37, 0)).toBeNull()
  })

  it("norm=100, З=10 → 300", () => {
    expect(deficitThreshold(100, 10)).toBeCloseTo(300, 5)
  })
})
