// tests/sales-plan-order-gate.test.ts
//
// Phase 27: тесты гейта «заказываем» — helper computeEffectiveOrderEnabled
// и поведение suggestVirtualPurchases при effectiveOrderEnabled=false.
//

import { describe, it, expect } from "vitest"
import { suggestVirtualPurchases, computeEffectiveOrderEnabled } from "@/lib/sales-plan/virtual-purchases"

// ── Параметры по умолчанию (те же, что в sales-plan-virtual.test.ts) ──────────
const DEFAULT_PARAMS = {
  safetyStockDays: 14,
  vpCoverDays: 60,
  defaultLeadTimeDays: 45,
  minQty: 10,
  maxIterationsPerProduct: 6,
  today: "2026-07-01",
  horizonTo: "2026-12-31",
}

// ── Фикстура: товар с быстрым пробоем (сток=30, rate=5) ─────────────────────
function makeProductInput(overrides: Record<string, unknown> = {}) {
  return {
    productId: "prod-1",
    sku: "УКТ-000001",
    name: "Тестовый товар",
    stockNow: 30, // stockNow=30, rate=5 → пробой сразу (14 × 5 = 70 > 30)
    baselineOrdersPerDay: 5,
    leadTimeDays: 45,
    monthLevels: [
      { month: "2026-07-01", targetOrdersPerDay: 5, priceRub: 5000, buyoutPct: 0.8 },
    ],
    dayOverrides: {},
    arrivals: [],
    existingVirtualPurchases: [],
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Блок 1: Прямой unit-тест helper'а computeEffectiveOrderEnabled
// ─────────────────────────────────────────────────────────────────────────────

describe("computeEffectiveOrderEnabled — source of truth формулы гейта", () => {
  it("C + orderEnabled=true → false (статус C форсирует off)", () => {
    expect(computeEffectiveOrderEnabled("C", true)).toBe(false)
  })

  it("C + orderEnabled=false → false (C форсирует off, не важно что orderEnabled=false)", () => {
    expect(computeEffectiveOrderEnabled("C", false)).toBe(false)
  })

  it("A + orderEnabled=true → true (заказываем)", () => {
    expect(computeEffectiveOrderEnabled("A", true)).toBe(true)
  })

  it("B + orderEnabled=false → false (ручной флаг «не заказываем» при B)", () => {
    expect(computeEffectiveOrderEnabled("B", false)).toBe(false)
  })

  it("null-abc + orderEnabled=true → true (нет статуса, флаг включён)", () => {
    expect(computeEffectiveOrderEnabled(null, true)).toBe(true)
  })

  it("null-abc + orderEnabled=false → false (нет статуса, флаг выключен)", () => {
    expect(computeEffectiveOrderEnabled(null, false)).toBe(false)
  })

  it("null-abc + orderEnabled=undefined → true (совместимость до миграции — default=true)", () => {
    expect(computeEffectiveOrderEnabled(null, undefined)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Блок 2: Гейт в suggestVirtualPurchases
// ─────────────────────────────────────────────────────────────────────────────

describe("suggestVirtualPurchases — гейт effectiveOrderEnabled", () => {
  it("effectiveOrderEnabled=false → 0 предложений (сток мал, пробой есть)", () => {
    const input = {
      params: DEFAULT_PARAMS,
      products: [
        makeProductInput({ effectiveOrderEnabled: false }),
      ],
    }
    const suggestions = suggestVirtualPurchases(input)
    expect(suggestions).toHaveLength(0)
  })

  it("effectiveOrderEnabled=true → предложения как раньше (length > 0)", () => {
    const input = {
      params: DEFAULT_PARAMS,
      products: [
        makeProductInput({ effectiveOrderEnabled: true }),
      ],
    }
    const suggestions = suggestVirtualPurchases(input)
    expect(suggestions.length).toBeGreaterThan(0)
  })

  it("effectiveOrderEnabled=undefined → предложения как раньше (обратная совместимость)", () => {
    const input = {
      params: DEFAULT_PARAMS,
      products: [
        makeProductInput(), // нет поля effectiveOrderEnabled → undefined
      ],
    }
    const suggestions = suggestVirtualPurchases(input)
    expect(suggestions.length).toBeGreaterThan(0)
  })

  it("изоляция: «заказываем» получает предложения, «не заказываем» — 0 в одном прогоне", () => {
    const input = {
      params: DEFAULT_PARAMS,
      products: [
        makeProductInput({ productId: "prod-order", effectiveOrderEnabled: true }),
        makeProductInput({ productId: "prod-skip", effectiveOrderEnabled: false }),
      ],
    }
    const suggestions = suggestVirtualPurchases(input)
    const orderSuggestions = suggestions.filter((s) => s.productId === "prod-order")
    const skipSuggestions = suggestions.filter((s) => s.productId === "prod-skip")
    expect(orderSuggestions.length).toBeGreaterThan(0) // заказываем — получает VP
    expect(skipSuggestions).toHaveLength(0)            // не заказываем — 0 VP
  })
})
