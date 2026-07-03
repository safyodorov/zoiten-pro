// tests/finance-balance-actions.test.ts
// Phase 24 Plan 24-08 — unit-тесты server actions управляющего слоя «Финансы → Баланс».
// Паттерн vi.hoisted + dual-mode $transaction: tests/return-actions.test.ts, tests/stock-actions.test.ts.

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── vi.hoisted — создаём моки ДО hoisting vi.mock ─────────────────

const { prismaMock, requireSectionMock, authMock } = vi.hoisted(() => {
  const prismaMock = {
    financeStockSnapshot: { findMany: vi.fn(), update: vi.fn() },
    productCost: { findMany: vi.fn() },
    financeManualAdjustment: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    appSetting: { upsert: vi.fn() },
    financeTaxPeriodActual: { upsert: vi.fn() },
    $transaction: vi.fn(),
  }

  prismaMock.$transaction.mockImplementation((arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg as unknown[])
    if (typeof arg === "function") return (arg as (tx: unknown) => unknown)(prismaMock)
    return arg
  })

  const requireSectionMock = vi.fn().mockResolvedValue(undefined)
  const authMock = vi.fn().mockResolvedValue({ user: { id: "user-1" } })

  return { prismaMock, requireSectionMock, authMock }
})

vi.mock("@/lib/rbac", () => ({
  requireSection: requireSectionMock,
}))

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

// Статический импорт — после регистрации моков
import {
  recalcBalanceDate,
  saveFinanceAdjustment,
  deleteFinanceAdjustment,
  saveTaxRates,
  saveTaxPeriodActual,
} from "@/app/actions/finance-balance"

// ── Setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
  requireSectionMock.mockResolvedValue(undefined)
  authMock.mockResolvedValue({ user: { id: "user-1" } })
  prismaMock.$transaction.mockImplementation((arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg as unknown[])
    if (typeof arg === "function") return (arg as (tx: unknown) => unknown)(prismaMock)
    return arg
  })
})

// ── recalcBalanceDate (D-04) ──────────────────────────────────────

describe("recalcBalanceDate", () => {
  it("переоценивает costPriceAtDate/valueRub по текущей ProductCost; qty НЕ передаётся в update", async () => {
    prismaMock.financeStockSnapshot.findMany.mockResolvedValueOnce([
      { id: "s1", productId: "p1", qty: 10 },
      { id: "s2", productId: "p2", qty: 5 },
    ])
    prismaMock.productCost.findMany.mockResolvedValueOnce([
      { productId: "p1", costPrice: 100 },
      // p2 без ProductCost — «без оценки» (D-11)
    ])
    prismaMock.financeStockSnapshot.update.mockResolvedValue({})

    const result = await recalcBalanceDate("2026-07-01")

    expect(result).toEqual({ ok: true })
    expect(prismaMock.$transaction).toHaveBeenCalledOnce()

    expect(prismaMock.financeStockSnapshot.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { costPriceAtDate: 100, valueRub: 1000 },
    })
    expect(prismaMock.financeStockSnapshot.update).toHaveBeenCalledWith({
      where: { id: "s2" },
      data: { costPriceAtDate: null, valueRub: null },
    })

    // qty неизменяемо — не должно фигурировать ни в одном data update (D-04)
    for (const call of prismaMock.financeStockSnapshot.update.mock.calls) {
      expect(call[0].data).not.toHaveProperty("qty")
    }
  })

  it("нет снапшота на дату → ok:false", async () => {
    prismaMock.financeStockSnapshot.findMany.mockResolvedValueOnce([])
    const result = await recalcBalanceDate("2026-07-01")
    expect(result.ok).toBe(false)
  })

  it("некорректная дата → ok:false", async () => {
    const result = await recalcBalanceDate("not-a-date")
    expect(result.ok).toBe(false)
  })

  it("без MANAGE → ok:false (FORBIDDEN)", async () => {
    requireSectionMock.mockRejectedValueOnce(new Error("FORBIDDEN"))
    const result = await recalcBalanceDate("2026-07-01")
    expect(result.ok).toBe(false)
  })
})

// ── saveFinanceAdjustment / deleteFinanceAdjustment (D-08, m8) ────

describe("saveFinanceAdjustment", () => {
  it("без MANAGE → ok:false (requireSection throws FORBIDDEN)", async () => {
    requireSectionMock.mockRejectedValueOnce(new Error("FORBIDDEN"))
    const result = await saveFinanceAdjustment({
      label: "Займы выданные",
      type: "ASSET",
      amountRub: 5000,
      effectiveFrom: "2026-07-01",
    })
    expect(result.ok).toBe(false)
  })

  it("без id → create", async () => {
    prismaMock.financeManualAdjustment.create.mockResolvedValueOnce({ id: "a1" })

    const result = await saveFinanceAdjustment({
      label: "Займы выданные",
      type: "ASSET",
      amountRub: 5000,
      effectiveFrom: "2026-07-01",
    })

    expect(result).toEqual({ ok: true })
    expect(prismaMock.financeManualAdjustment.create).toHaveBeenCalledOnce()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("m8: правка amountRub версионирует — старая версия закрыта deletedAt=новый effectiveFrom, создана новая", async () => {
    prismaMock.financeManualAdjustment.findUnique.mockResolvedValueOnce({
      id: "a1",
      label: "Займы выданные",
      type: "ASSET",
      amountRub: 5000,
      effectiveFrom: new Date("2026-07-01"),
      comment: null,
      deletedAt: null,
    })
    prismaMock.financeManualAdjustment.update.mockResolvedValue({})
    prismaMock.financeManualAdjustment.create.mockResolvedValue({ id: "a2" })

    const result = await saveFinanceAdjustment({
      id: "a1",
      label: "Займы выданные",
      type: "ASSET",
      amountRub: 7000, // сумма изменена
      effectiveFrom: "2026-07-15",
    })

    expect(result).toEqual({ ok: true })
    expect(prismaMock.$transaction).toHaveBeenCalledOnce()

    // Старая версия закрыта на новый effectiveFrom — прошлые балансы (< 07-15) не переписаны
    expect(prismaMock.financeManualAdjustment.update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { deletedAt: new Date("2026-07-15") },
    })
    // Новая версия создана с новыми значениями
    expect(prismaMock.financeManualAdjustment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amountRub: 7000,
          effectiveFrom: new Date("2026-07-15"),
        }),
      })
    )
  })

  it("m8: правка ТОЛЬКО label/comment → in-place update, без версии", async () => {
    prismaMock.financeManualAdjustment.findUnique.mockResolvedValueOnce({
      id: "a1",
      label: "Старое имя",
      type: "ASSET",
      amountRub: 5000,
      effectiveFrom: new Date("2026-07-01"),
      comment: null,
      deletedAt: null,
    })
    prismaMock.financeManualAdjustment.update.mockResolvedValue({})

    const result = await saveFinanceAdjustment({
      id: "a1",
      label: "Новое имя",
      type: "ASSET",
      amountRub: 5000,
      effectiveFrom: "2026-07-01",
      comment: "уточнение",
    })

    expect(result).toEqual({ ok: true })
    expect(prismaMock.financeManualAdjustment.update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { label: "Новое имя", comment: "уточнение" },
    })
    expect(prismaMock.financeManualAdjustment.create).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("новый effectiveFrom раньше старого → ok:false (нельзя версионировать раньше начала)", async () => {
    prismaMock.financeManualAdjustment.findUnique.mockResolvedValueOnce({
      id: "a1",
      label: "Займы выданные",
      type: "ASSET",
      amountRub: 5000,
      effectiveFrom: new Date("2026-07-10"),
      comment: null,
      deletedAt: null,
    })

    const result = await saveFinanceAdjustment({
      id: "a1",
      label: "Займы выданные",
      type: "ASSET",
      amountRub: 7000,
      effectiveFrom: "2026-07-01", // раньше старого 07-10
    })

    expect(result.ok).toBe(false)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("статья не найдена → ok:false", async () => {
    prismaMock.financeManualAdjustment.findUnique.mockResolvedValueOnce(null)
    const result = await saveFinanceAdjustment({
      id: "missing",
      label: "X",
      type: "ASSET",
      amountRub: 100,
      effectiveFrom: "2026-07-01",
    })
    expect(result.ok).toBe(false)
  })
})

describe("deleteFinanceAdjustment", () => {
  it("soft delete — update deletedAt", async () => {
    prismaMock.financeManualAdjustment.update.mockResolvedValueOnce({})
    const result = await deleteFinanceAdjustment("a1")
    expect(result).toEqual({ ok: true })
    expect(prismaMock.financeManualAdjustment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "a1" },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      })
    )
  })

  it("без MANAGE → ok:false", async () => {
    requireSectionMock.mockRejectedValueOnce(new Error("FORBIDDEN"))
    const result = await deleteFinanceAdjustment("a1")
    expect(result.ok).toBe(false)
  })
})

// ── saveTaxRates (D-15) ────────────────────────────────────────────

describe("saveTaxRates", () => {
  it("пишет AppSetting finance.vatPct/finance.incomeTaxPct", async () => {
    prismaMock.appSetting.upsert.mockResolvedValue({})

    const result = await saveTaxRates({ vatPct: 7, incomeTaxPct: 1 })

    expect(result).toEqual({ ok: true })
    expect(prismaMock.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: "finance.vatPct" } })
    )
    expect(prismaMock.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: "finance.incomeTaxPct" } })
    )
  })

  it("отрицательная ставка → ok:false", async () => {
    const result = await saveTaxRates({ vatPct: -1, incomeTaxPct: 1 })
    expect(result.ok).toBe(false)
    expect(prismaMock.appSetting.upsert).not.toHaveBeenCalled()
  })

  it("без MANAGE → ok:false", async () => {
    requireSectionMock.mockRejectedValueOnce(new Error("FORBIDDEN"))
    const result = await saveTaxRates({ vatPct: 7, incomeTaxPct: 1 })
    expect(result.ok).toBe(false)
  })
})

// ── saveTaxPeriodActual (D-17) ─────────────────────────────────────

describe("saveTaxPeriodActual", () => {
  it("upsert по (year, quarter)", async () => {
    prismaMock.financeTaxPeriodActual.upsert.mockResolvedValueOnce({})

    const result = await saveTaxPeriodActual({
      year: 2026,
      quarter: 2,
      vatActualRub: 150000,
      incomeTaxActualRub: 20000,
    })

    expect(result).toEqual({ ok: true })
    expect(prismaMock.financeTaxPeriodActual.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { year_quarter: { year: 2026, quarter: 2 } },
      })
    )
  })

  it("quarter вне 1..4 → ok:false", async () => {
    const result = await saveTaxPeriodActual({
      year: 2026,
      quarter: 5,
      vatActualRub: null,
      incomeTaxActualRub: null,
    })
    expect(result.ok).toBe(false)
    expect(prismaMock.financeTaxPeriodActual.upsert).not.toHaveBeenCalled()
  })

  it("без MANAGE → ok:false", async () => {
    requireSectionMock.mockRejectedValueOnce(new Error("FORBIDDEN"))
    const result = await saveTaxPeriodActual({
      year: 2026,
      quarter: 2,
      vatActualRub: null,
      incomeTaxActualRub: null,
    })
    expect(result.ok).toBe(false)
  })
})
