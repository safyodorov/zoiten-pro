// tests/production-sync.test.ts
// Quick 260702-j52: unit-тесты чистого агрегатора computeProductionTotals.
// Без моков БД, без Prisma — только вычисление Map<productId, ordered>.

import { describe, it, expect } from "vitest"
import { computeProductionTotals } from "@/lib/production-sync"

describe("computeProductionTotals", () => {
  it("простой случай — quantity:100, warehouseQty:0 → a=100", () => {
    const totals = computeProductionTotals([
      { productId: "a", quantity: 100, warehouseQty: 0 },
    ])
    expect(totals.get("a")).toBe(100)
  })

  it("частичная приёмка — quantity:100, warehouseQty:30 → a=70", () => {
    const totals = computeProductionTotals([
      { productId: "a", quantity: 100, warehouseQty: 30 },
    ])
    expect(totals.get("a")).toBe(70)
  })

  it("clamp — quantity:100, warehouseQty:120 (кривые данные) → a=0, не -20", () => {
    const totals = computeProductionTotals([
      { productId: "a", quantity: 100, warehouseQty: 120 },
    ])
    expect(totals.get("a")).toBe(0)
  })

  it("сумма по товару — два item на 'a' (100,0)+(50,10) → a=140", () => {
    const totals = computeProductionTotals([
      { productId: "a", quantity: 100, warehouseQty: 0 },
      { productId: "a", quantity: 50, warehouseQty: 10 },
    ])
    expect(totals.get("a")).toBe(140)
  })

  it("несколько товаров — 'a' и 'b' раздельно", () => {
    const totals = computeProductionTotals([
      { productId: "a", quantity: 100, warehouseQty: 0 },
      { productId: "b", quantity: 50, warehouseQty: 10 },
    ])
    expect(totals.get("a")).toBe(100)
    expect(totals.get("b")).toBe(40)
  })

  it("пустой массив → пустая Map", () => {
    const totals = computeProductionTotals([])
    expect(totals.size).toBe(0)
  })
})
