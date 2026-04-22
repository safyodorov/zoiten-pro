import { describe, it, expect } from "vitest"
import { calculateStockMetrics, deficitThreshold } from "@/lib/stock-math"

describe("calculateStockMetrics", () => {
  it("happy path: О=100, З=5, norm=37 → Об=20, Д=85 (жёлтый — меньше нормы)", () => {
    const result = calculateStockMetrics({ stock: 100, ordersPerDay: 5, turnoverNormDays: 37 })
    // Об = 100 / 5 = 20
    // Д = 37 * 5 - 100 = 185 - 100 = 85 (без буфера 0.3)
    expect(result.turnoverDays).toBeCloseTo(20, 5)
    expect(result.deficit).toBeCloseTo(85, 5)
  })

  it("О=null → {null, null}", () => {
    const result = calculateStockMetrics({ stock: null, ordersPerDay: 5, turnoverNormDays: 37 })
    expect(result.turnoverDays).toBeNull()
    expect(result.deficit).toBeNull()
  })

  it("З=0 → Об=null, Д=-100 (зелёный — нет продаж, есть запас)", () => {
    const result = calculateStockMetrics({ stock: 100, ordersPerDay: 0, turnoverNormDays: 37 })
    // Об = null (нет продаж — бесконечная оборачиваемость)
    // Д = 37 * 0 - 100 = -100
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

  it("О=0, З=5, norm=37 → Об=0, Д=185 (красный — полный дефицит)", () => {
    const result = calculateStockMetrics({ stock: 0, ordersPerDay: 5, turnoverNormDays: 37 })
    // Об = 0 / 5 = 0
    // Д = 37 * 5 - 0 = 185
    expect(result.turnoverDays).toBeCloseTo(0, 5)
    expect(result.deficit).toBeCloseTo(185, 5)
  })

  it("О=185, З=5, norm=37 → Об=37, Д=0 (ровно на норме)", () => {
    const result = calculateStockMetrics({ stock: 185, ordersPerDay: 5, turnoverNormDays: 37 })
    // Об = 185 / 5 = 37
    // Д = 37 * 5 - 185 = 185 - 185 = 0
    expect(result.turnoverDays).toBeCloseTo(37, 5)
    expect(result.deficit).toBeCloseTo(0, 5)
  })

  it("О=200, З=5, norm=37 → Д=-15 (зелёный — больше нормы)", () => {
    const result = calculateStockMetrics({ stock: 200, ordersPerDay: 5, turnoverNormDays: 37 })
    // Д = 37 * 5 - 200 = -15
    expect(result.deficit).toBeCloseTo(-15, 5)
  })

  it("normDays=-1 → {null, null} (отрицательная норма недопустима)", () => {
    const result = calculateStockMetrics({ stock: 100, ordersPerDay: 5, turnoverNormDays: -1 })
    expect(result.turnoverDays).toBeNull()
    expect(result.deficit).toBeNull()
  })
})

describe("deficitThreshold", () => {
  it("norm=37, З=5 → 185 (без буфера 0.3)", () => {
    expect(deficitThreshold(37, 5)).toBeCloseTo(185, 5)
  })

  it("З=null → null", () => {
    expect(deficitThreshold(37, null)).toBeNull()
  })

  it("З=0 → null (нет порога при нулевых продажах)", () => {
    expect(deficitThreshold(37, 0)).toBeNull()
  })

  it("norm=100, З=10 → 1000", () => {
    expect(deficitThreshold(100, 10)).toBeCloseTo(1000, 5)
  })
})
