import { describe, it, expect } from "vitest"
import { suggestVirtualPurchases } from "@/lib/sales-plan/virtual-purchases"

// ──────────────────────────────────────────────────────────────────
// Контракт suggestVirtualPurchases() — итеративный roll-forward pure функция
// Реализуется в Wave 4; этот стаб фиксирует контракт ДО реализации (RED).
//
// Источник: §4.1 RESEARCH.md
// ──────────────────────────────────────────────────────────────────

// Параметры по умолчанию (§2.6 AppSetting дефолты)
const DEFAULT_PARAMS = {
  safetyStockDays: 14,
  vpCoverDays: 60,
  defaultLeadTimeDays: 45,
  minQty: 10,
  maxIterationsPerProduct: 6,
  today: "2026-07-01",
  horizonTo: "2026-12-31",
}

// Минимальный фикстура-товар с 1 поставщиком и быстрым пробоем
function makeProductInput(overrides: Record<string, unknown> = {}) {
  return {
    productId: "prod-1",
    sku: "УКТ-000001",
    name: "Тестовый товар",
    stockNow: 50, // быстро иссякнет
    baselineOrdersPerDay: 5,
    leadTimeDays: 45,
    monthLevels: [
      { month: "2026-07-01", targetOrdersPerDay: 5, priceRub: 5000, buyoutPct: 0.8 },
    ],
    dayOverrides: {},
    arrivals: [], // нет реальных приходов → триггер должен сработать
    existingVirtualPurchases: [], // ACCEPTED/DISMISSED/manual — не трогаются
    ...overrides,
  }
}

describe("suggestVirtualPurchases — триггер пробоя страхового запаса", () => {
  it("пробой страхового запаса (projectedStock < safetyDays × rate) создаёт предложение", () => {
    const input = {
      params: DEFAULT_PARAMS,
      products: [
        makeProductInput({
          stockNow: 30, // хватит на 6 дней при rate=5 + safetyStock=14 → пробой сразу
        }),
      ],
    }
    const suggestions = suggestVirtualPurchases(input)
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions[0].productId).toBe("prod-1")
  })

  it("нет пробоя при достаточном стоке → нет предложений", () => {
    const input = {
      params: DEFAULT_PARAMS,
      products: [
        makeProductInput({
          stockNow: 5000, // хватит на весь горизонт
        }),
      ],
    }
    const suggestions = suggestVirtualPurchases(input)
    const prod1Suggestions = suggestions.filter(
      (s: { productId: string }) => s.productId === "prod-1",
    )
    expect(prod1Suggestions).toHaveLength(0)
  })
})

describe("suggestVirtualPurchases — qty покрытия", () => {
  it("qty виртуальной закупки покрывает vpCoverDays (60 дней) продаж", () => {
    const input = {
      params: DEFAULT_PARAMS,
      products: [
        makeProductInput({
          stockNow: 10, // почти пусто
        }),
      ],
    }
    const suggestions = suggestVirtualPurchases(input)
    if (suggestions.length > 0) {
      const suggestion = suggestions[0]
      // qty должен быть достаточным для ~60 дней × rate (5/д) = ~300
      // + страховой запас 14 × 5 = 70 → ~370
      expect(suggestion.qty).toBeGreaterThan(200)
    }
  })

  it("qty < minQty(10) → предложение не создаётся", () => {
    // Если нужно только несколько штук — не генерируем
    const input = {
      params: { ...DEFAULT_PARAMS, minQty: 1000 }, // поднять порог
      products: [
        makeProductInput({
          stockNow: 10,
          baselineOrdersPerDay: 1, // очень медленный товар
          monthLevels: [{ month: "2026-07-01", targetOrdersPerDay: 1, priceRub: 5000, buyoutPct: 0.8 }],
        }),
      ],
    }
    const suggestions = suggestVirtualPurchases(input)
    // При высоком minQty и низкой скорости — qty < minQty → нет предложений
    const prod1Suggestions = suggestions.filter(
      (s: { productId: string }) => s.productId === "prod-1",
    )
    expect(prod1Suggestions).toHaveLength(0)
  })
})

describe("suggestVirtualPurchases — orderDate clamp", () => {
  it("orderDate = max(today, breach − leadTime) — не раньше today", () => {
    const input = {
      params: DEFAULT_PARAMS,
      products: [
        makeProductInput({
          stockNow: 5, // пробой очень скоро — breach < today + leadTime
        }),
      ],
    }
    const suggestions = suggestVirtualPurchases(input)
    if (suggestions.length > 0) {
      const orderDate = suggestions[0].orderDate
      // orderDate не может быть раньше today
      expect(orderDate >= DEFAULT_PARAMS.today).toBe(true)
    }
  })

  it("«поздний заказ» — когда clamp сдвинул orderDate вправо от optimum", () => {
    const input = {
      params: { ...DEFAULT_PARAMS, today: "2026-09-01" }, // сентябрь — уже поздно
      products: [
        makeProductInput({
          stockNow: 0,
          arrivals: [], // нет реальных приходов
        }),
      ],
    }
    const suggestions = suggestVirtualPurchases(input)
    // Если есть предложение с orderDate === today (clamp сработал) → флаг isLate
    const lateSuggestions = suggestions.filter(
      (s: { isLate?: boolean }) => s.isLate === true,
    )
    // Проверяем только то, что isLate — известное поле (поведение late — реализация Wave 4)
    // Тест фиксирует структуру объекта
    if (suggestions.length > 0) {
      expect("isLate" in suggestions[0]).toBe(true)
    }
  })
})

describe("suggestVirtualPurchases — итеративный roll-forward", () => {
  it("товару может понадобиться 2-3 предложения за один проход", () => {
    // Быстрый товар с большим горизонтом — несколько итераций
    const input = {
      params: { ...DEFAULT_PARAMS, vpCoverDays: 30 }, // покрытие 30 дней → чаще
      products: [
        makeProductInput({
          stockNow: 20,
          baselineOrdersPerDay: 10,
          monthLevels: [
            { month: "2026-07-01", targetOrdersPerDay: 10, priceRub: 5000, buyoutPct: 0.8 },
          ],
        }),
      ],
    }
    const suggestions = suggestVirtualPurchases(input)
    const prod1Suggestions = suggestions.filter(
      (s: { productId: string }) => s.productId === "prod-1",
    )
    // При rate=10, stockNow=20, vpCover=30 → нужно много закупок
    expect(prod1Suggestions.length).toBeGreaterThan(1)
  })

  it("не превышает maxIterationsPerProduct (6)", () => {
    const input = {
      params: { ...DEFAULT_PARAMS, vpCoverDays: 1, maxIterationsPerProduct: 6 }, // минимальное покрытие
      products: [
        makeProductInput({
          stockNow: 0,
          baselineOrdersPerDay: 100,
        }),
      ],
    }
    const suggestions = suggestVirtualPurchases(input)
    const prod1Suggestions = suggestions.filter(
      (s: { productId: string }) => s.productId === "prod-1",
    )
    expect(prod1Suggestions.length).toBeLessThanOrEqual(6)
  })

  it("товар уже в дефиците сегодня → даты приходов СТРОГО возрастают (без дублей одной датой)", () => {
    // Регрессия инцидента 2026-07-05: пробой ДО today+leadTime не лечится приходом
    // (clamp «не прошлым числом») → каждая итерация предлагала одинаковую партию
    // на ту же дату (несколько заказов с приходом 19.08 на один товар).
    const input = {
      params: DEFAULT_PARAMS,
      products: [
        makeProductInput({
          stockNow: 0, // дефицит прямо сейчас
          baselineOrdersPerDay: 5,
        }),
      ],
    }
    const suggestions = suggestVirtualPurchases(input)
    const prod1 = suggestions.filter((s: { productId: string }) => s.productId === "prod-1")

    expect(prod1.length).toBeGreaterThanOrEqual(1)
    // Первый приход = today + leadTime (раньше стандартного цикла не приедет)
    expect(prod1[0].expectedArrivalDate).toBe("2026-08-15") // 2026-07-01 + 45
    // Даты приходов строго возрастают — никаких двух партий одной датой
    for (let i = 1; i < prod1.length; i++) {
      expect(prod1[i].expectedArrivalDate > prod1[i - 1].expectedArrivalDate).toBe(true)
    }
    // И следующая партия — только после исчерпания покрытия предыдущей (> arrival)
    const uniqueDates = new Set(prod1.map((s) => s.expectedArrivalDate))
    expect(uniqueDates.size).toBe(prod1.length)
  })
})

describe("suggestVirtualPurchases — DISMISSED подавляет повторение", () => {
  it("существующая DISMISSED VirtualPurchase с совпадающим orderDate ± 14 дней → не регенерируется", () => {
    const dismissedDate = "2026-07-20"
    const input = {
      params: DEFAULT_PARAMS,
      products: [
        makeProductInput({
          stockNow: 5,
          existingVirtualPurchases: [
            {
              id: "vp-dismissed-1",
              status: "DISMISSED",
              orderDate: dismissedDate,
              expectedArrivalDate: "2026-09-03",
              qty: 300,
              source: "auto",
            },
          ],
        }),
      ],
    }
    const suggestions = suggestVirtualPurchases(input)
    // Ни одно авто-предложение не должно иметь orderDate близко к dismissedDate
    for (const s of suggestions) {
      if (s.productId === "prod-1") {
        const diff = Math.abs(
          new Date(s.orderDate).getTime() - new Date(dismissedDate).getTime(),
        )
        const days = diff / (1000 * 60 * 60 * 24)
        expect(days).toBeGreaterThan(14)
      }
    }
  })
})

describe("suggestVirtualPurchases — структура VpSuggestion", () => {
  it("VpSuggestion содержит обязательные поля", () => {
    const input = {
      params: DEFAULT_PARAMS,
      products: [makeProductInput({ stockNow: 0 })],
    }
    const suggestions = suggestVirtualPurchases(input)
    if (suggestions.length > 0) {
      const s = suggestions[0]
      expect(s).toHaveProperty("productId")
      expect(s).toHaveProperty("qty")
      expect(s).toHaveProperty("orderDate")
      expect(s).toHaveProperty("expectedArrivalDate")
      expect(s).toHaveProperty("isLate")
      expect(s).toHaveProperty("leadTimeDaysUsed")
    }
  })
})
