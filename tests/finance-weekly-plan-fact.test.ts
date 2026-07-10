// tests/finance-weekly-plan-fact.test.ts
// Quick 260710-gem (W2c): unit-тесты pure-функции distributePlanAcrossNmIds —
// распределение месячного/недельного плана товара по его nmId в фин-отчёте.
//
// Тест-файл pure: импортируется ТОЛЬКО distributePlanAcrossNmIds (без Prisma/React),
// паттерн groupTemplatesForPicker (Phase 11-03). @/lib/prisma мокается инертно,
// т.к. plan-fact.ts импортирует prisma на уровне модуля для loadWeeklyPlanFact.

import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { distributePlanAcrossNmIds } from "@/lib/finance-weekly/plan-fact"

describe("distributePlanAcrossNmIds", () => {
  it("один nmId → весь план ему, независимо от факта", () => {
    const result = distributePlanAcrossNmIds(1000, [111], new Map([[111, 12345]]))
    expect(result.size).toBe(1)
    expect(result.get(111)).toBe(1000)

    // И при нулевом/отсутствующем факте — тоже весь план
    const noFact = distributePlanAcrossNmIds(1000, [111], new Map())
    expect(noFact.get(111)).toBe(1000)
  })

  it("несколько nmId → пропорционально фактам", () => {
    const facts = new Map<number, number>([
      [1, 300],
      [2, 100],
    ])
    const result = distributePlanAcrossNmIds(1000, [1, 2], facts)
    expect(result.get(1)).toBe(750)
    expect(result.get(2)).toBe(250)
  })

  it("нулевой факт (пустая Map или все нули) → equal split", () => {
    // Пустая Map — фактов нет вообще
    const empty = distributePlanAcrossNmIds(900, [1, 2, 3], new Map())
    expect(empty.get(1)).toBe(300)
    expect(empty.get(2)).toBe(300)
    expect(empty.get(3)).toBe(300)

    // Все факты нулевые
    const zeros = distributePlanAcrossNmIds(
      900,
      [1, 2, 3],
      new Map([
        [1, 0],
        [2, 0],
        [3, 0],
      ]),
    )
    expect(zeros.get(1)).toBe(300)
    expect(zeros.get(2)).toBe(300)
    expect(zeros.get(3)).toBe(300)
  })

  it("инвариант суммы при дробных долях: Σ значений === planTotal (без дрейфа)", () => {
    // 1000 / 3 — доли нецелые; внутри НЕТ округления → сумма float-долей
    // обязана сходиться к плану с высокой точностью.
    const facts = new Map<number, number>([
      [1, 1],
      [2, 1],
      [3, 1],
    ])
    const result = distributePlanAcrossNmIds(1000, [1, 2, 3], facts)
    const sum = Array.from(result.values()).reduce((acc, v) => acc + v, 0)
    expect(sum).toBeCloseTo(1000, 9)

    // Отсутствующий в factByNmId nmId = факт 0 (не ломает пропорцию)
    const partial = distributePlanAcrossNmIds(
      1000,
      [1, 2, 3],
      new Map([
        [1, 200],
        [2, 600],
      ]),
    )
    expect(partial.get(1)).toBe(250)
    expect(partial.get(2)).toBe(750)
    expect(partial.get(3)).toBe(0)
    const partialSum = Array.from(partial.values()).reduce((acc, v) => acc + v, 0)
    expect(partialSum).toBeCloseTo(1000, 9)
  })
})
