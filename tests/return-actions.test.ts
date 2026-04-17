import { describe, it, expect, vi, beforeEach } from "vitest"

// Phase 9 Plan 04 — integration тесты 3 server actions для возвратов.
// Контракты моков:
//   - requireSection → Promise<void> (бросает при FORBIDDEN, НЕ возвращает session)
//   - auth() → session с user.id (используется внутри getSessionUserId helper)
//   - $transaction: dual-mode — Array.isArray(arg) ? Promise.all(arg) : arg(prismaMock)
// Паттерн единого mock Prisma унаследован из Plan 09-02 (support-sync-returns.test.ts).

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

vi.mock("@/lib/rbac", () => ({
  requireSection: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}))

vi.mock("@/lib/wb-support-api", () => ({
  approveReturn: vi.fn(),
  rejectReturn: vi.fn(),
  reconsiderReturn: vi.fn(),
  replyFeedback: vi.fn(),
  replyQuestion: vi.fn(),
}))

type AnyFn = (...args: unknown[]) => unknown

const prismaMock = {
  supportTicket: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  supportMessage: { findFirst: vi.fn(), create: vi.fn() },
  supportMedia: { create: vi.fn() },
  returnDecision: { create: vi.fn() },
  $transaction: vi.fn(async (arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg as unknown[])
    if (typeof arg === "function") return (arg as (tx: unknown) => unknown)(prismaMock)
    return arg
  }),
}
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

beforeEach(async () => {
  // resetAllMocks — очищает .mockResolvedValueOnce() queue (clearAllMocks только results, не реализацию)
  vi.resetAllMocks()

  // Восстанавливаем дефолты, которые vi.resetAllMocks очистил
  prismaMock.returnDecision.create.mockResolvedValue({ id: "d-1" })
  prismaMock.supportTicket.update.mockResolvedValue({ id: "t-1" })
  prismaMock.$transaction.mockImplementation(async (arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg as unknown[])
    if (typeof arg === "function")
      return (arg as (tx: unknown) => unknown)(prismaMock)
    return arg
  })
})

async function setupMocks(
  options: {
    sectionOk?: boolean
    userId?: string | null
    ticket?: unknown
    wbOk?: boolean
  } = {}
) {
  const rbac = await import("@/lib/rbac")
  const authMod = await import("@/lib/auth")
  const wbApi = await import("@/lib/wb-support-api")

  if (options.sectionOk === false) {
    ;(rbac.requireSection as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("FORBIDDEN")
    )
  } else {
    ;(rbac.requireSection as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      undefined
    )
  }

  ;(authMod.auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
    options.userId === null ? null : { user: { id: options.userId ?? "user-1" } }
  )

  prismaMock.supportTicket.findUnique.mockResolvedValueOnce(options.ticket ?? null)

  if (options.wbOk === false) {
    ;(wbApi.approveReturn as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("WB 500")
    )
    ;(wbApi.rejectReturn as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("WB 500")
    )
    ;(wbApi.reconsiderReturn as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("WB 500")
    )
  } else {
    ;(wbApi.approveReturn as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
    })
    ;(wbApi.rejectReturn as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
    })
    ;(wbApi.reconsiderReturn as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
    })
  }

  return { rbac, authMod, wbApi, prismaMock }
}

const PENDING_TICKET = {
  id: "t-1",
  channel: "RETURN",
  wbExternalId: "uuid-1",
  returnState: "PENDING",
  wbActions: ["approve1", "autorefund1", "rejectcustom"],
}
const REJECTED_TICKET = {
  ...PENDING_TICKET,
  returnState: "REJECTED",
  wbActions: ["approve1"],
}
const APPROVED_TICKET = { ...PENDING_TICKET, returnState: "APPROVED" }

describe("approveReturn", () => {
  it("happy path PENDING → APPROVED: создаёт ReturnDecision APPROVE + обновляет ticket", async () => {
    const mocks = await setupMocks({ ticket: PENDING_TICKET })
    const { approveReturn } = await import("@/app/actions/support")
    const res = await approveReturn("t-1")
    expect(res).toEqual({ ok: true })
    expect(mocks.wbApi.approveReturn).toHaveBeenCalledWith("uuid-1", "approve1")
    expect(prismaMock.returnDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticketId: "t-1",
        action: "APPROVE",
        wbAction: "approve1",
        decidedById: "user-1",
        reconsidered: false,
      }),
    })
    expect(prismaMock.supportTicket.update).toHaveBeenCalledWith({
      where: { id: "t-1" },
      data: expect.objectContaining({
        returnState: "APPROVED",
        status: "ANSWERED",
      }),
    })
  })

  it("reject если channel !== RETURN", async () => {
    await setupMocks({
      ticket: { ...PENDING_TICKET, channel: "FEEDBACK" },
    })
    const { approveReturn } = await import("@/app/actions/support")
    const res = await approveReturn("t-1")
    expect(res).toEqual({ ok: false, error: "Не RETURN-тикет" })
  })

  it("reject если returnState === APPROVED (финал)", async () => {
    await setupMocks({ ticket: APPROVED_TICKET })
    const { approveReturn } = await import("@/app/actions/support")
    const res = await approveReturn("t-1")
    expect(res).toEqual({ ok: false, error: "Возврат уже одобрен (финал)" })
  })

  it("reject если returnState === REJECTED → направляет на reconsiderReturn", async () => {
    await setupMocks({ ticket: REJECTED_TICKET })
    const { approveReturn } = await import("@/app/actions/support")
    const res = await approveReturn("t-1")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("reconsiderReturn")
  })

  it("НЕ создаёт Decision если WB API вернул ошибку", async () => {
    await setupMocks({ ticket: PENDING_TICKET, wbOk: false })
    const { approveReturn } = await import("@/app/actions/support")
    const res = await approveReturn("t-1")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("WB")
    expect(prismaMock.returnDecision.create).not.toHaveBeenCalled()
    expect(prismaMock.supportTicket.update).not.toHaveBeenCalled()
  })

  it("reject если ни approve1/autorefund1/approvecc1 нет в wbActions", async () => {
    await setupMocks({
      ticket: { ...PENDING_TICKET, wbActions: ["rejectcustom"] },
    })
    const { approveReturn } = await import("@/app/actions/support")
    const res = await approveReturn("t-1")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("action-ов для одобрения")
  })
})

describe("rejectReturn", () => {
  it("happy path PENDING → REJECTED: создаёт Decision REJECT с reason", async () => {
    const mocks = await setupMocks({ ticket: PENDING_TICKET })
    const { rejectReturn } = await import("@/app/actions/support")
    const res = await rejectReturn("t-1", "Фото не соответствует товару из заявки")
    expect(res.ok).toBe(true)
    expect(mocks.wbApi.rejectReturn).toHaveBeenCalledWith(
      "uuid-1",
      "Фото не соответствует товару из заявки"
    )
    expect(prismaMock.returnDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "REJECT",
        wbAction: "rejectcustom",
        reason: "Фото не соответствует товару из заявки",
      }),
    })
    expect(prismaMock.supportTicket.update).toHaveBeenCalledWith({
      where: { id: "t-1" },
      data: expect.objectContaining({ returnState: "REJECTED" }),
    })
  })

  it("validation: reason < 10 символов", async () => {
    await setupMocks({ ticket: PENDING_TICKET })
    const { rejectReturn } = await import("@/app/actions/support")
    const res = await rejectReturn("t-1", "Коротко")
    expect(res).toEqual({
      ok: false,
      error: "Причина должна быть от 10 до 1000 символов",
    })
  })

  it("validation: reason > 1000 символов", async () => {
    await setupMocks({ ticket: PENDING_TICKET })
    const { rejectReturn } = await import("@/app/actions/support")
    const res = await rejectReturn("t-1", "x".repeat(1001))
    expect(res).toEqual({
      ok: false,
      error: "Причина должна быть от 10 до 1000 символов",
    })
  })

  it("reject если returnState !== PENDING", async () => {
    await setupMocks({ ticket: REJECTED_TICKET })
    const { rejectReturn } = await import("@/app/actions/support")
    const res = await rejectReturn("t-1", "Валидная причина минимум 10 символов")
    expect(res).toEqual({
      ok: false,
      error: "Отклонить можно только из PENDING",
    })
  })

  it("reject если rejectcustom отсутствует в wbActions", async () => {
    await setupMocks({
      ticket: { ...PENDING_TICKET, wbActions: ["approve1"] },
    })
    const { rejectReturn } = await import("@/app/actions/support")
    const res = await rejectReturn("t-1", "Валидная причина минимум 10 символов")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("rejectcustom")
  })

  it("НЕ создаёт Decision если WB rejectReturn вернул ошибку", async () => {
    await setupMocks({ ticket: PENDING_TICKET, wbOk: false })
    const { rejectReturn } = await import("@/app/actions/support")
    const res = await rejectReturn("t-1", "Валидная причина минимум 10 символов")
    expect(res.ok).toBe(false)
    expect(prismaMock.returnDecision.create).not.toHaveBeenCalled()
    expect(prismaMock.supportTicket.update).not.toHaveBeenCalled()
  })
})

describe("reconsiderReturn", () => {
  it("happy path REJECTED → APPROVED + Decision{reconsidered:true}", async () => {
    const mocks = await setupMocks({ ticket: REJECTED_TICKET })
    const { reconsiderReturn } = await import("@/app/actions/support")
    const res = await reconsiderReturn("t-1")
    expect(res.ok).toBe(true)
    expect(mocks.wbApi.reconsiderReturn).toHaveBeenCalledWith("uuid-1", "approve1")
    expect(prismaMock.returnDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "RECONSIDER",
        wbAction: "approve1",
        reconsidered: true,
      }),
    })
    expect(prismaMock.supportTicket.update).toHaveBeenCalledWith({
      where: { id: "t-1" },
      data: expect.objectContaining({
        returnState: "APPROVED",
        status: "ANSWERED",
      }),
    })
  })

  it("reject если returnState === PENDING", async () => {
    await setupMocks({ ticket: PENDING_TICKET })
    const { reconsiderReturn } = await import("@/app/actions/support")
    const res = await reconsiderReturn("t-1")
    expect(res).toEqual({
      ok: false,
      error: "Пересмотреть можно только отклонённые",
    })
  })

  it("reject если approve1 не в wbActions", async () => {
    await setupMocks({
      ticket: { ...REJECTED_TICKET, wbActions: [] },
    })
    const { reconsiderReturn } = await import("@/app/actions/support")
    const res = await reconsiderReturn("t-1")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("не позволяет пересмотреть")
  })
})

describe("RBAC: все 3 action требуют SUPPORT+MANAGE", () => {
  it("VIEWER получает reject на approveReturn (requireSection throws)", async () => {
    await setupMocks({ sectionOk: false, ticket: PENDING_TICKET })
    const { approveReturn } = await import("@/app/actions/support")
    const res = await approveReturn("t-1")
    expect(res.ok).toBe(false)
  })
})

describe("revalidatePath вызван после успеха", () => {
  it("approveReturn: revalidates /support/returns и /support/[id]", async () => {
    await setupMocks({ ticket: PENDING_TICKET })
    const { revalidatePath } = await import("next/cache")
    const { approveReturn } = await import("@/app/actions/support")
    await approveReturn("t-1")
    expect(revalidatePath).toHaveBeenCalledWith("/support/returns")
    expect(revalidatePath).toHaveBeenCalledWith("/support/t-1")
  })
})
