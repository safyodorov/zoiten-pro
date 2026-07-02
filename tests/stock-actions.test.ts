// tests/stock-actions.test.ts
// Phase 14-05 (STOCK-14): Unit-тесты server action updateTurnoverNorm.
// updateProductionStock удалён (quick 260702-j52): количество Производства
// machine-managed из закупок через lib/production-sync.ts.
// Паттерн vi.hoisted: из return-actions.test.ts Phase 9.

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── vi.hoisted — создаём моки ДО hoisting vi.mock ─────────────────

const { prismaMock, requireSectionMock } = vi.hoisted(() => {
  const prismaMock = {
    product: { update: vi.fn() },
    appSetting: { upsert: vi.fn() },
    $transaction: vi.fn(),
  }

  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === "function" ? cb(prismaMock) : Promise.all(cb as Promise<unknown>[])
  )

  const requireSectionMock = vi.fn().mockResolvedValue(undefined)

  return { prismaMock, requireSectionMock }
})

vi.mock("@/lib/rbac", () => ({
  requireSection: requireSectionMock,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

// Статический импорт — после регистрации моков
import { updateTurnoverNorm } from "@/app/actions/stock"

// ── Константы ─────────────────────────────────────────────────────

const TURNOVER_NORM_KEY = "stock.turnoverNormDays"

// ── Setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
  requireSectionMock.mockResolvedValue(undefined)
  prismaMock.product.update.mockResolvedValue({ id: "p1" })
  prismaMock.appSetting.upsert.mockResolvedValue({ key: TURNOVER_NORM_KEY, value: "37" })
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === "function" ? cb(prismaMock) : Promise.all(cb as Promise<unknown>[])
  )
})

// ── updateTurnoverNorm ────────────────────────────────────────────

describe("updateTurnoverNorm", () => {
  it("valid 37 → upsert success с правильным ключом", async () => {
    const result = await updateTurnoverNorm(37)
    expect(result).toEqual({ ok: true })
    expect(prismaMock.appSetting.upsert).toHaveBeenCalledOnce()
    expect(prismaMock.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: TURNOVER_NORM_KEY },
        create: { key: TURNOVER_NORM_KEY, value: "37" },
        update: { value: "37" },
      })
    )
  })

  it("invalid 0 → ok:false", async () => {
    const result = await updateTurnoverNorm(0)
    expect(result.ok).toBe(false)
  })

  it("invalid 101 → ok:false", async () => {
    const result = await updateTurnoverNorm(101)
    expect(result.ok).toBe(false)
  })

  it("valid boundary 1 → ok:true", async () => {
    const result = await updateTurnoverNorm(1)
    expect(result.ok).toBe(true)
  })

  it("valid boundary 100 → ok:true", async () => {
    const result = await updateTurnoverNorm(100)
    expect(result.ok).toBe(true)
  })

  it("invalid negative → ok:false", async () => {
    const result = await updateTurnoverNorm(-1)
    expect(result.ok).toBe(false)
  })
})
