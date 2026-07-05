// tests/sales-plan-distribute-forward.test.ts
// Phase 26-01 (SP-15): Unit-тесты для чистой функции distributeMonthLevelForward.
// Ключевой тест: «протяжка не перезаписывает ручные».
//
// Паттерн vi.hoisted по эталону tests/stock-actions.test.ts:
//   моки создаются ДО hoisting vi.mock, статический импорт — ПОСЛЕ.

import { describe, it, expect, vi } from "vitest"

// vi.hoisted — моки создаются ДО hoisting vi.mock
const { prismaMock, requireSectionMock } = vi.hoisted(() => {
  const prismaMock = {
    salesPlanMonthLevel: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    salesPlanDayOverride: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    appSetting: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  }
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === "function" ? cb(prismaMock) : Promise.all(cb as Promise<unknown>[])
  )
  const requireSectionMock = vi.fn().mockResolvedValue(undefined)
  return { prismaMock, requireSectionMock }
})

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/rbac", () => ({ requireSection: requireSectionMock }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))

// Статический импорт — ПОСЛЕ регистрации моков
import { distributeMonthLevelForward } from "@/app/actions/sales-plan"

// ── Тесты ────────────────────────────────────────────────────────────────────

const HORIZON = ["2026-07-01", "2026-08-01", "2026-09-01"]

describe("distributeMonthLevelForward", () => {
  it("не перезаписывает ручные: средний месяц ручной → в результате только авто-месяц после target", () => {
    // Дано: горизонт 3 месяца, авг — ручной уровень
    // Вызов от Jul → ожидаем только Сен (авто), не Авг (ручной) и не сам Jul (target)
    const result = distributeMonthLevelForward({
      targetMonth: "2026-07-01",
      horizonMonths: HORIZON,
      manualMonths: ["2026-08-01"],
    })
    expect(result).toEqual(["2026-09-01"])
    expect(result).not.toContain("2026-08-01")
    expect(result).not.toContain("2026-07-01")
  })

  it("все последующие авто-месяцы попадают в результат если manualMonths пуст", () => {
    // targetMonth = Jul, manualMonths = [] → Авг и Сен оба авто
    const result = distributeMonthLevelForward({
      targetMonth: "2026-07-01",
      horizonMonths: HORIZON,
      manualMonths: [],
    })
    expect(result).toEqual(["2026-08-01", "2026-09-01"])
    // target сам НЕ включается
    expect(result).not.toContain("2026-07-01")
  })

  it("возвращает [] если target — последний месяц горизонта", () => {
    // targetMonth = последний → после него ничего нет → []
    const result = distributeMonthLevelForward({
      targetMonth: "2026-09-01",
      horizonMonths: HORIZON,
      manualMonths: [],
    })
    expect(result).toEqual([])
  })
})
