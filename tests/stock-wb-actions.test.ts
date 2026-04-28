// tests/stock-wb-actions.test.ts
// Phase 16 Plan 04 (STOCK-35): Unit-тесты server action saveStockWbShowSizes.
// Паттерн vi.hoisted: из stock-actions.test.ts Phase 14.

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── vi.hoisted — создаём моки ДО hoisting vi.mock ─────────────────

const { prismaMock, requireSectionMock, authMock, revalidatePathMock } = vi.hoisted(() => {
  const prismaMock = {
    user: { update: vi.fn() },
  }

  const requireSectionMock = vi.fn().mockResolvedValue(undefined)
  const authMock = vi.fn()
  const revalidatePathMock = vi.fn()

  return { prismaMock, requireSectionMock, authMock, revalidatePathMock }
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
  revalidatePath: revalidatePathMock,
}))

// Статический импорт — после регистрации моков
import { saveStockWbShowSizes } from "@/app/actions/stock-wb"

// ── Setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
  requireSectionMock.mockResolvedValue(undefined)
  authMock.mockResolvedValue({ user: { id: "user-1" } })
  prismaMock.user.update.mockResolvedValue({ id: "user-1" })
})

// ── saveStockWbShowSizes ──────────────────────────────────────────

describe("saveStockWbShowSizes (STOCK-35)", () => {
  it("happy path: value=true → ok + prisma.user.update + revalidatePath", async () => {
    const result = await saveStockWbShowSizes(true)

    expect(result).toEqual({ ok: true })
    expect(requireSectionMock).toHaveBeenCalledWith("STOCK")
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { stockWbShowSizes: true },
    })
    expect(revalidatePathMock).toHaveBeenCalledWith("/stock/wb")
  })

  it("happy path: value=false → ok + prisma.user.update", async () => {
    const result = await saveStockWbShowSizes(false)

    expect(result).toEqual({ ok: true })
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { stockWbShowSizes: false },
    })
  })

  it("unauthenticated → возвращает error без update", async () => {
    authMock.mockResolvedValue(null)

    const result = await saveStockWbShowSizes(true)

    expect(result).toEqual({ ok: false, error: "Не авторизован" })
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it("invalid input (not boolean) → Zod fails, error без update", async () => {
    // Cast as any для bypass TypeScript check — тестируем runtime защиту
    const result = await saveStockWbShowSizes("yes" as unknown as boolean)

    expect(result).toEqual({ ok: false, error: "Некорректные данные" })
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it("DB error → catch block, error message", async () => {
    prismaMock.user.update.mockRejectedValueOnce(new Error("Connection refused"))

    const result = await saveStockWbShowSizes(true)

    expect(result).toEqual({ ok: false, error: "Connection refused" })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})
