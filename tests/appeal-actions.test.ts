// Unit тесты server actions обжалований (Plan 11-04).
// Phase 9 pattern: dual-mode $transaction mock (callback + array).
// RBAC через vi.mock requireSection, auth через vi.mock.

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/rbac", () => ({ requireSection: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue({ user: { id: "user-1" } }) }))

const prismaMock = {
  supportTicket: { findUnique: vi.fn(), update: vi.fn() },
  appealRecord: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

// Dual-mode $transaction mock (Phase 9 pattern): callback или array
beforeEach(() => {
  vi.resetAllMocks()
  // Переставить auth() mock обратно после resetAllMocks
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { auth } = require("@/lib/auth")
  auth.mockResolvedValue({ user: { id: "user-1" } })
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { requireSection } = require("@/lib/rbac")
  requireSection.mockResolvedValue(undefined)
  prismaMock.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") return (arg as (tx: unknown) => Promise<unknown>)(prismaMock)
    if (Array.isArray(arg)) return Promise.all(arg)
    return undefined
  })
})

const VALID_CUID = "ckxyz00000000000000000001"

describe("createAppeal", () => {
  it("happy path: FEEDBACK без обжалования → AppealRecord + ticket.status=APPEALED + appealId=record.id", async () => {
    const { createAppeal } = await import("@/app/actions/appeals")
    prismaMock.supportTicket.findUnique.mockResolvedValueOnce({
      id: "tk1",
      channel: "FEEDBACK",
      status: "NEW",
      appealRecord: null,
    })
    prismaMock.appealRecord.create.mockResolvedValueOnce({ id: "ap1" })
    prismaMock.supportTicket.update.mockResolvedValueOnce({})

    const res = await createAppeal({
      ticketId: VALID_CUID,
      reason: "Оскорбительные выражения, нецензурная лексика",
      text: "Отзыв содержит нецензурные выражения в адрес продавца",
    })
    expect(res).toEqual({ ok: true, id: "ap1" })
    expect(prismaMock.appealRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING",
          createdById: "user-1",
        }),
      })
    )
    expect(prismaMock.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "APPEALED",
          appealStatus: "PENDING",
          appealId: "ap1",
        }),
      })
    )
    // appealedAt должно быть выставлено
    const updateCall = prismaMock.supportTicket.update.mock.calls[0][0] as {
      data: { appealedAt: Date }
    }
    expect(updateCall.data.appealedAt).toBeInstanceOf(Date)
  })

  it("отклоняет reason не из APPEAL_REASONS", async () => {
    const { createAppeal } = await import("@/app/actions/appeals")
    const res = await createAppeal({
      ticketId: VALID_CUID,
      reason: "Произвольная причина" as never,
      text: "достаточно длинный текст для прохождения валидации",
    })
    expect(res.ok).toBe(false)
  })

  it("отклоняет text < 10 символов", async () => {
    const { createAppeal } = await import("@/app/actions/appeals")
    const res = await createAppeal({
      ticketId: VALID_CUID,
      reason: "Другое",
      text: "короткий",
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/10/)
  })

  it("отклоняет text > 1000 символов", async () => {
    const { createAppeal } = await import("@/app/actions/appeals")
    const res = await createAppeal({
      ticketId: VALID_CUID,
      reason: "Другое",
      text: "x".repeat(1001),
    })
    expect(res.ok).toBe(false)
  })

  it("отклоняет не-FEEDBACK канал (QUESTION)", async () => {
    const { createAppeal } = await import("@/app/actions/appeals")
    prismaMock.supportTicket.findUnique.mockResolvedValueOnce({
      id: "tk1",
      channel: "QUESTION",
      status: "NEW",
      appealRecord: null,
    })
    const res = await createAppeal({
      ticketId: VALID_CUID,
      reason: "Другое",
      text: "валидный текст обжалования длиннее десяти",
    })
    expect(res).toEqual({
      ok: false,
      error: "Обжаловать можно только отзывы",
    })
  })

  it("отклоняет duplicate — AppealRecord уже существует для тикета", async () => {
    const { createAppeal } = await import("@/app/actions/appeals")
    prismaMock.supportTicket.findUnique.mockResolvedValueOnce({
      id: "tk1",
      channel: "FEEDBACK",
      status: "APPEALED",
      appealRecord: { id: "existing" },
    })
    const res = await createAppeal({
      ticketId: VALID_CUID,
      reason: "Другое",
      text: "валидный текст обжалования длиннее десяти",
    })
    expect(res).toEqual({ ok: false, error: "Обжалование уже создано" })
  })

  it("возвращает ошибку если тикет не найден", async () => {
    const { createAppeal } = await import("@/app/actions/appeals")
    prismaMock.supportTicket.findUnique.mockResolvedValueOnce(null)
    const res = await createAppeal({
      ticketId: VALID_CUID,
      reason: "Другое",
      text: "валидный текст обжалования длиннее десяти",
    })
    expect(res).toEqual({ ok: false, error: "Тикет не найден" })
  })
})

describe("updateAppealStatus", () => {
  it("PENDING → APPROVED обновляет record + ticket с appealResolvedAt + resolvedById", async () => {
    const { updateAppealStatus } = await import("@/app/actions/appeals")
    prismaMock.appealRecord.findUnique.mockResolvedValueOnce({
      id: "ap1",
      ticketId: "tk1",
    })
    prismaMock.appealRecord.update.mockResolvedValueOnce({})
    prismaMock.supportTicket.update.mockResolvedValueOnce({})

    const res = await updateAppealStatus({
      appealId: VALID_CUID,
      status: "APPROVED",
    })
    expect(res).toEqual({ ok: true })
    const appealUpdate = prismaMock.appealRecord.update.mock.calls[0][0] as {
      data: {
        status: string
        resolvedById: string | null
        appealResolvedAt: Date | null
      }
    }
    expect(appealUpdate.data.status).toBe("APPROVED")
    expect(appealUpdate.data.resolvedById).toBe("user-1")
    expect(appealUpdate.data.appealResolvedAt).toBeInstanceOf(Date)

    const ticketUpdate = prismaMock.supportTicket.update.mock.calls[0][0] as {
      data: { appealStatus: string; appealResolvedAt: Date | null }
    }
    expect(ticketUpdate.data.appealStatus).toBe("APPROVED")
    expect(ticketUpdate.data.appealResolvedAt).toBeInstanceOf(Date)
  })

  it("APPROVED → PENDING сбрасывает appealResolvedAt и resolvedById в null", async () => {
    const { updateAppealStatus } = await import("@/app/actions/appeals")
    prismaMock.appealRecord.findUnique.mockResolvedValueOnce({
      id: "ap1",
      ticketId: "tk1",
    })
    prismaMock.appealRecord.update.mockResolvedValueOnce({})
    prismaMock.supportTicket.update.mockResolvedValueOnce({})

    const res = await updateAppealStatus({
      appealId: VALID_CUID,
      status: "PENDING",
    })
    expect(res).toEqual({ ok: true })
    const appealUpdate = prismaMock.appealRecord.update.mock.calls[0][0] as {
      data: {
        appealResolvedAt: Date | null
        resolvedById: string | null
      }
    }
    expect(appealUpdate.data.appealResolvedAt).toBeNull()
    expect(appealUpdate.data.resolvedById).toBeNull()
  })

  it("PENDING → REJECTED обновляет status и выставляет resolvedAt", async () => {
    const { updateAppealStatus } = await import("@/app/actions/appeals")
    prismaMock.appealRecord.findUnique.mockResolvedValueOnce({
      id: "ap1",
      ticketId: "tk1",
    })
    prismaMock.appealRecord.update.mockResolvedValueOnce({})
    prismaMock.supportTicket.update.mockResolvedValueOnce({})

    const res = await updateAppealStatus({
      appealId: VALID_CUID,
      status: "REJECTED",
    })
    expect(res).toEqual({ ok: true })
    const appealUpdate = prismaMock.appealRecord.update.mock.calls[0][0] as {
      data: { status: string; appealResolvedAt: Date | null }
    }
    expect(appealUpdate.data.status).toBe("REJECTED")
    expect(appealUpdate.data.appealResolvedAt).toBeInstanceOf(Date)
  })

  it("возвращает ошибку если AppealRecord не найден", async () => {
    const { updateAppealStatus } = await import("@/app/actions/appeals")
    prismaMock.appealRecord.findUnique.mockResolvedValueOnce(null)
    const res = await updateAppealStatus({
      appealId: VALID_CUID,
      status: "APPROVED",
    })
    expect(res).toEqual({
      ok: false,
      error: "Запись обжалования не найдена",
    })
  })

  it("отклоняет некорректный status (например NONE)", async () => {
    const { updateAppealStatus } = await import("@/app/actions/appeals")
    const res = await updateAppealStatus({
      appealId: VALID_CUID,
      status: "NONE" as never,
    })
    expect(res.ok).toBe(false)
  })
})
