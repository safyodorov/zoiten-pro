// tests/sales-plan-distribute-forward.test.ts
// Phase 26-01 (SP-15): Unit-тесты для чистой функции distributeMonthLevelForward.
// Ключевой тест: «протяжка не перезаписывает ручные».
//
// Debug fix sales-plan-recalc-no-forward (2026-07-06): + тесты saveMonthLevels
// с маркером autoDistributed — повторная протяжка перезаписывает ранее авто-протянутые
// месяцы, но защищает реально-ручные.
//
// Паттерн vi.hoisted по эталону tests/stock-actions.test.ts:
//   моки создаются ДО hoisting vi.mock, статический импорт — ПОСЛЕ.

import { describe, it, expect, vi, beforeEach } from "vitest"

// vi.hoisted — моки создаются ДО hoisting vi.mock
const { prismaMock, requireSectionMock } = vi.hoisted(() => {
  const prismaMock = {
    salesPlanMonthLevel: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    salesPlanDayOverride: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    virtualPurchase: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(), update: vi.fn() },
    supplierProductLink: { findMany: vi.fn() },
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
// Инертный движок/загрузчик — regenerateVirtualPurchasesInternal не должен трогать реальную БД.
vi.mock("@/lib/sales-plan/data", () => ({
  loadSalesPlanInputs: vi.fn().mockResolvedValue({ products: [] }),
  loadFactDaily: vi.fn(),
}))
vi.mock("@/lib/sales-plan/engine", () => ({
  computeSalesPlan: vi.fn().mockReturnValue({ products: [] }),
}))

// Статический импорт — ПОСЛЕ регистрации моков.
// distributeMonthLevelForward живёт в чистом lib-модуле (без "use server"),
// но моки выше нужны чтобы vitest мог загрузить @/app/actions/sales-plan без краша.
import { distributeMonthLevelForward } from "@/lib/sales-plan/distribute-forward"
import { saveMonthLevels } from "@/app/actions/sales-plan"

// ── Тесты чистой функции ───────────────────────────────────────────────────────

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

// ── Тесты saveMonthLevels: маркер autoDistributed (баг sales-plan-recalc-no-forward) ──

const FULL_HORIZON = [
  "2026-07-01", "2026-08-01", "2026-09-01",
  "2026-10-01", "2026-11-01", "2026-12-01",
]

/** Хелпер: месяц из вызова upsert (ISO) → чтобы искать конкретную ячейку. */
function upsertMonthIso(call: unknown): string {
  const arg = (call as { where: { productId_month: { month: Date } } })
  return arg.where.productId_month.month.toISOString().slice(0, 10)
}

describe("saveMonthLevels — повторная протяжка с маркером autoDistributed", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.$transaction.mockImplementation((cb: unknown) =>
      typeof cb === "function" ? cb(prismaMock) : Promise.all(cb as Promise<unknown>[])
    )
    prismaMock.salesPlanMonthLevel.upsert.mockResolvedValue({})
    prismaMock.salesPlanMonthLevel.deleteMany.mockResolvedValue({ count: 0 })
    prismaMock.virtualPurchase.findMany.mockResolvedValue([])
    prismaMock.virtualPurchase.deleteMany.mockResolvedValue({ count: 0 })
    prismaMock.virtualPurchase.createMany.mockResolvedValue({ count: 0 })
    prismaMock.supplierProductLink.findMany.mockResolvedValue([])
    prismaMock.appSetting.findUnique.mockResolvedValue(null)
  })

  it("перезаписывает ранее авто-протянутые месяцы (Jul 50→40 протягивается на Aug–Dec)", async () => {
    // Дано: Aug–Dec ранее протянуты (autoDistributed=true, значение 50), Jul — новая правка 40
    prismaMock.salesPlanMonthLevel.findMany.mockResolvedValue(
      ["2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01", "2026-12-01"].map((m) => ({
        productId: "p1",
        month: new Date(m + "T00:00:00Z"),
        autoDistributed: true,
      })),
    )

    const r = await saveMonthLevels(
      [{ productId: "p1", month: "2026-07-01", targetOrdersPerDay: 40, priceRub: null, buyoutPct: null }],
      { distributeForward: true, horizonMonths: FULL_HORIZON },
    )
    expect(r.ok).toBe(true)

    const calls = prismaMock.salesPlanMonthLevel.upsert.mock.calls.map((c) => c[0])
    const months = calls.map(upsertMonthIso)
    // Протяжка коснулась всех будущих месяцев
    for (const m of ["2026-08-01", "2026-12-01"]) expect(months).toContain(m)

    // Aug перезаписан значением 40 и остаётся авто-протянутым
    const aug = calls.find((c) => upsertMonthIso(c) === "2026-08-01")!
    expect(aug.create.targetOrdersPerDay).toBe(40)
    expect(aug.update.targetOrdersPerDay).toBe(40)
    expect(aug.create.autoDistributed).toBe(true)
    expect(aug.update.autoDistributed).toBe(true)

    // Jul (ручной ввод) → autoDistributed=false
    const jul = calls.find((c) => upsertMonthIso(c) === "2026-07-01")!
    expect(jul.create.autoDistributed).toBe(false)
    expect(jul.update.autoDistributed).toBe(false)
  })

  it("реально-ручной будущий месяц (autoDistributed=false) НЕ перезаписывается", async () => {
    // Sept — реально-ручной (autoDistributed=false, «пик»), остальные авто
    prismaMock.salesPlanMonthLevel.findMany.mockResolvedValue([
      { productId: "p1", month: new Date("2026-08-01T00:00:00Z"), autoDistributed: true },
      { productId: "p1", month: new Date("2026-09-01T00:00:00Z"), autoDistributed: false },
      { productId: "p1", month: new Date("2026-10-01T00:00:00Z"), autoDistributed: true },
    ])

    await saveMonthLevels(
      [{ productId: "p1", month: "2026-07-01", targetOrdersPerDay: 40, priceRub: null, buyoutPct: null }],
      { distributeForward: true, horizonMonths: FULL_HORIZON },
    )

    const months = prismaMock.salesPlanMonthLevel.upsert.mock.calls.map((c) => upsertMonthIso(c[0]))
    expect(months).not.toContain("2026-09-01") // ручной пик защищён (D-2)
    expect(months).toContain("2026-08-01")     // авто перезаписан
    expect(months).toContain("2026-10-01")     // авто перезаписан
  })
})
