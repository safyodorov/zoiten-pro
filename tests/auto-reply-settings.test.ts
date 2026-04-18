import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Phase 10 Plan 04 — Integration тесты saveAutoReplyConfig.
// Mock @/lib/prisma (in-memory upsert) + @/lib/rbac + @/lib/auth + next/cache.

interface MockConfig {
  id: string
  isEnabled: boolean
  workdayStart: string
  workdayEnd: string
  workDays: number[]
  messageText: string
  timezone: string
  updatedById: string | null
}

const state = {
  configs: [] as MockConfig[],
}

const upsertMock = vi.fn(
  async ({
    where,
    create,
    update,
  }: {
    where: { id: string }
    create: Omit<MockConfig, "id"> & { id: string }
    update: Partial<MockConfig>
  }) => {
    const existing = state.configs.find((c) => c.id === where.id)
    if (existing) {
      Object.assign(existing, update)
      return existing
    }
    const c: MockConfig = {
      id: create.id,
      isEnabled: create.isEnabled,
      workdayStart: create.workdayStart,
      workdayEnd: create.workdayEnd,
      workDays: create.workDays,
      messageText: create.messageText,
      timezone: create.timezone,
      updatedById: create.updatedById ?? null,
    }
    state.configs.push(c)
    return c
  }
)

const requireSectionMock = vi.fn()
const authMock = vi.fn()
const revalidateMock = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    autoReplyConfig: { upsert: upsertMock },
  },
}))

vi.mock("@/lib/rbac", () => ({
  requireSection: requireSectionMock,
  requireSuperadmin: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}))

vi.mock("next/cache", () => ({
  revalidatePath: revalidateMock,
}))

// sendChatMessage не вызывается в saveAutoReplyConfig, но support.ts импортирует
// весь @/lib/wb-support-api — mock-им чтобы избежать fetch в top-level.
vi.mock("@/lib/wb-support-api", () => ({
  replyFeedback: vi.fn(),
  replyQuestion: vi.fn(),
  approveReturn: vi.fn(),
  rejectReturn: vi.fn(),
  reconsiderReturn: vi.fn(),
  sendChatMessage: vi.fn(),
}))

beforeEach(() => {
  state.configs = []
  upsertMock.mockClear()
  requireSectionMock.mockReset()
  requireSectionMock.mockResolvedValue(undefined)
  authMock.mockReset()
  authMock.mockResolvedValue({ user: { id: "U1" } })
  revalidateMock.mockReset()
})
afterEach(() => vi.resetAllMocks())

function validFormData(
  overrides: Partial<{
    isEnabled: string
    workdayStart: string
    workdayEnd: string
    workDays: number[]
    messageText: string
    timezone: string
  }> = {}
): FormData {
  const fd = new FormData()
  fd.set("isEnabled", overrides.isEnabled ?? "true")
  fd.set("workdayStart", overrides.workdayStart ?? "09:00")
  fd.set("workdayEnd", overrides.workdayEnd ?? "18:00")
  const days = overrides.workDays ?? [1, 2, 3, 4, 5]
  for (const d of days) fd.append("workDays", String(d))
  fd.set("messageText", overrides.messageText ?? "Привет!")
  fd.set("timezone", overrides.timezone ?? "Europe/Moscow")
  return fd
}

describe("saveAutoReplyConfig — happy path", () => {
  it("upsert AutoReplyConfig с id='default' + updatedById", async () => {
    const { saveAutoReplyConfig } = await import("@/app/actions/support")
    const res = await saveAutoReplyConfig(validFormData())
    expect(res).toEqual({ ok: true })
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "default" },
        create: expect.objectContaining({
          id: "default",
          updatedById: "U1",
          isEnabled: true,
          workdayStart: "09:00",
          workdayEnd: "18:00",
          messageText: "Привет!",
          timezone: "Europe/Moscow",
        }),
        update: expect.objectContaining({ updatedById: "U1" }),
      })
    )
    expect(revalidateMock).toHaveBeenCalledWith("/support/auto-reply")
    expect(revalidateMock).toHaveBeenCalledWith("/support")
  })

  it("сохраняет workDays как массив number[]", async () => {
    const { saveAutoReplyConfig } = await import("@/app/actions/support")
    await saveAutoReplyConfig(validFormData({ workDays: [2, 4, 6] }))
    const call = upsertMock.mock.calls[0]?.[0]
    expect(call?.create.workDays).toEqual([2, 4, 6])
  })

  it("singleton: второй вызов → update, не create дубль", async () => {
    const { saveAutoReplyConfig } = await import("@/app/actions/support")
    await saveAutoReplyConfig(validFormData({ messageText: "Первый" }))
    await saveAutoReplyConfig(validFormData({ messageText: "Второй" }))
    expect(state.configs).toHaveLength(1)
    expect(state.configs[0].messageText).toBe("Второй")
  })

  it("isEnabled='on' (native checkbox) тоже парсится как true", async () => {
    const { saveAutoReplyConfig } = await import("@/app/actions/support")
    const res = await saveAutoReplyConfig(validFormData({ isEnabled: "on" }))
    expect(res).toEqual({ ok: true })
    const call = upsertMock.mock.calls[0]?.[0]
    expect(call?.create.isEnabled).toBe(true)
  })
})

describe("saveAutoReplyConfig — Zod validation", () => {
  it("reject: workdayStart не HH:MM", async () => {
    const { saveAutoReplyConfig } = await import("@/app/actions/support")
    const res = await saveAutoReplyConfig(validFormData({ workdayStart: "25:99" }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("HH:MM")
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it("reject: workDays вне 1..7", async () => {
    const { saveAutoReplyConfig } = await import("@/app/actions/support")
    const res = await saveAutoReplyConfig(validFormData({ workDays: [0, 8] }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/1\.\.7|ISO/i)
  })

  it("reject: messageText пустой", async () => {
    const { saveAutoReplyConfig } = await import("@/app/actions/support")
    const res = await saveAutoReplyConfig(validFormData({ messageText: "" }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/пуст|empty/i)
  })

  it("reject: messageText > 1000 символов", async () => {
    const { saveAutoReplyConfig } = await import("@/app/actions/support")
    const res = await saveAutoReplyConfig(
      validFormData({ messageText: "x".repeat(1001) })
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("1000")
  })
})

describe("saveAutoReplyConfig — RBAC", () => {
  it("reject: VIEWER без MANAGE (requireSection throws)", async () => {
    requireSectionMock.mockRejectedValueOnce(new Error("Недостаточно прав"))
    const { saveAutoReplyConfig } = await import("@/app/actions/support")
    const res = await saveAutoReplyConfig(validFormData())
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("Недостаточно")
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it("reject: нет user.id в сессии", async () => {
    authMock.mockResolvedValueOnce({ user: null })
    const { saveAutoReplyConfig } = await import("@/app/actions/support")
    const res = await saveAutoReplyConfig(validFormData())
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("user.id")
    expect(upsertMock).not.toHaveBeenCalled()
  })
})
