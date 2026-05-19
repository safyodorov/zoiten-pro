// tests/wb-tokens-actions.test.ts
// Quick 260512-jxh: Unit-тесты для app/actions/wb-tokens.ts
// 5 тестов: FORBIDDEN gate, scope mismatch block, probe fail block, success upsert+invalidate, listWbTokens masking.

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── vi.hoisted — создаём моки ДО hoisting vi.mock ─────────────────

const { prismaMock, requireSuperadminMock, validateWbTokenMock, invalidateCacheMock, revalidatePathMock } =
  vi.hoisted(() => {
    const prismaMock = {
      wbApiToken: {
        findMany: vi.fn(),
        upsert: vi.fn(),
      },
    }
    const requireSuperadminMock = vi.fn().mockResolvedValue(undefined)
    const validateWbTokenMock = vi.fn()
    const invalidateCacheMock = vi.fn()
    const revalidatePathMock = vi.fn()
    return {
      prismaMock,
      requireSuperadminMock,
      validateWbTokenMock,
      invalidateCacheMock,
      revalidatePathMock,
    }
  })

// ── Моки ─────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

vi.mock("@/lib/rbac", () => ({
  requireSuperadmin: requireSuperadminMock,
}))

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "superadmin-1" } }),
}))

vi.mock("@/lib/wb-token-validate", () => ({
  validateWbToken: validateWbTokenMock,
}))

vi.mock("@/lib/wb-token", () => ({
  invalidateWbTokenCache: invalidateCacheMock,
  // Phase 19: добавлен WB_ADS_TOKEN
  WB_TOKEN_NAMES: [
    "WB_API_TOKEN",
    "WB_RETURNS_TOKEN",
    "WB_CHAT_TOKEN",
    "WB_ADS_TOKEN",
  ],
  getWbToken: vi.fn(),
}))

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}))

// ── Импорты после регистрации моков ──────────────────────────────

import { listWbTokens, replaceWbToken } from "@/app/actions/wb-tokens"

// ── Helper: синтетический decoded payload ─────────────────────────

const mockDecoded = {
  scopeBits: [1, 2, 3, 5, 6, 7],
  scopeBitmask: 238,
  issuedAt: new Date("2024-01-01"),
  expiresAt: new Date("2025-01-01"),
  sellerId: "seller-1",
  organizationId: "org-1",
}

// ── Setup ─────────────────────────────────────────────────────────

beforeEach(async () => {
  vi.resetAllMocks()
  requireSuperadminMock.mockResolvedValue(undefined)
  prismaMock.wbApiToken.findMany.mockResolvedValue([])
  prismaMock.wbApiToken.upsert.mockResolvedValue({})
  invalidateCacheMock.mockImplementation(() => undefined)
  revalidatePathMock.mockImplementation(() => undefined)
  // Restore auth mock (vi.resetAllMocks очищает реализацию)
  const authMod = await import("@/lib/auth")
  ;(authMod.auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id: "superadmin-1" },
  })
})

// ── Tests ─────────────────────────────────────────────────────────

describe("replaceWbToken", () => {
  it("Test 1: не-superadmin (requireSuperadmin throws 'FORBIDDEN') → throws", async () => {
    requireSuperadminMock.mockRejectedValueOnce(new Error("FORBIDDEN"))
    await expect(
      replaceWbToken({ name: "WB_API_TOKEN", value: "any-token" })
    ).rejects.toThrow("FORBIDDEN")
    expect(prismaMock.wbApiToken.upsert).not.toHaveBeenCalled()
  })

  it("Test 2: validateWbToken returns ok:false (scope mismatch) → {ok:false, error}, upsert НЕ вызван", async () => {
    validateWbTokenMock.mockResolvedValueOnce({
      ok: false,
      error: "Не хватает scope-битов: Отзывы, Статистика, Тарифы",
    })
    const result = await replaceWbToken({
      name: "WB_API_TOKEN",
      value: "header.payload.sig",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("Отзывы")
    }
    expect(prismaMock.wbApiToken.upsert).not.toHaveBeenCalled()
  })

  it("Test 3: success → upsert вызван с правильными полями + invalidateWbTokenCache + revalidatePath", async () => {
    validateWbTokenMock.mockResolvedValueOnce({ ok: true, decoded: mockDecoded })
    const result = await replaceWbToken({
      name: "WB_API_TOKEN",
      value: "  valid-token-value  ",
    })
    expect(result.ok).toBe(true)
    expect(prismaMock.wbApiToken.upsert).toHaveBeenCalledOnce()
    const call = prismaMock.wbApiToken.upsert.mock.calls[0][0]
    expect(call.where).toEqual({ name: "WB_API_TOKEN" })
    // Проверяем trimmed value
    expect(call.create.value).toBe("valid-token-value")
    expect(call.create.scopeBitmask).toBe(238)
    expect(call.create.updatedById).toBe("superadmin-1")
    // invalidate + revalidate
    expect(invalidateCacheMock).toHaveBeenCalledWith("WB_API_TOKEN")
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/settings")
  })
})

describe("listWbTokens", () => {
  it("Test 4: возвращает массив длины 4 — для отсутствующих в БД токенов hasValue=false", async () => {
    prismaMock.wbApiToken.findMany.mockResolvedValueOnce([])
    const result = await listWbTokens()
    // Phase 19: 4 токена включая WB_ADS_TOKEN
    expect(result).toHaveLength(4)
    expect(result.every((r) => !r.hasValue)).toBe(true)
    expect(result.map((r) => r.name)).toEqual([
      "WB_API_TOKEN",
      "WB_RETURNS_TOKEN",
      "WB_CHAT_TOKEN",
      "WB_ADS_TOKEN",
    ])
  })

  it("Test 5: НЕ возвращает value полностью — только last 4 chars в maskedTail", async () => {
    prismaMock.wbApiToken.findMany.mockResolvedValueOnce([
      {
        name: "WB_API_TOKEN",
        value: "long-secret-jwt-token-ending-ab12",
        scopeBitmask: 238,
        issuedAt: new Date("2024-01-01"),
        expiresAt: new Date("2025-01-01"),
        sellerId: "seller-1",
        organizationId: "org-1",
        updatedAt: new Date("2024-06-01"),
        updatedBy: { id: "u1", name: "Сергей" },
      },
    ])
    const result = await listWbTokens()
    const apiToken = result.find((r) => r.name === "WB_API_TOKEN")
    expect(apiToken).toBeDefined()
    expect(apiToken!.hasValue).toBe(true)
    expect(apiToken!.maskedTail).toBe("...ab12") // last 4 chars of "long-secret-jwt-token-ending-ab12"
    // Проверяем что полное value НЕ сериализовано
    expect(JSON.stringify(apiToken)).not.toContain("long-secret-jwt-token")
    expect(apiToken!.updatedBy).toEqual({ id: "u1", name: "Сергей" })
  })
})
