import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { TicketStatus } from "@prisma/client"

// Mock RBAC
vi.mock("@/lib/rbac", () => ({
  requireSection: vi.fn().mockResolvedValue(undefined),
}))

// Mock auth (для getSessionUserId)
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "U1", name: "Test" } }),
}))

// Mock next/cache
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

// Mock WB API
const replyFeedbackMock = vi.fn()
const replyQuestionMock = vi.fn()
vi.mock("@/lib/wb-support-api", () => ({
  replyFeedback: replyFeedbackMock,
  replyQuestion: replyQuestionMock,
}))

// Mock Prisma
const findUniqueMock = vi.fn()
const updateMock = vi.fn()
const createMessageMock = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    supportTicket: { findUnique: findUniqueMock, update: updateMock },
    supportMessage: { create: createMessageMock },
    $transaction: async (ops: any[]) => Promise.all(ops.map((op) => op)),
  },
}))

beforeEach(() => {
  findUniqueMock.mockReset()
  updateMock.mockReset().mockResolvedValue({})
  createMessageMock.mockReset().mockResolvedValue({})
  replyFeedbackMock.mockReset().mockResolvedValue({ ok: true })
  replyQuestionMock.mockReset().mockResolvedValue({ ok: true })
})

afterEach(() => vi.clearAllMocks())

describe("replyToTicket", () => {
  it("FEEDBACK: вызывает replyFeedback и создаёт OUTBOUND + status=ANSWERED", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "T1",
      channel: "FEEDBACK",
      wbExternalId: "WB1",
    })
    const { replyToTicket } = await import("@/app/actions/support")
    const res = await replyToTicket("T1", "Спасибо за отзыв!")
    expect(res).toEqual({ ok: true })
    expect(replyFeedbackMock).toHaveBeenCalledWith("WB1", "Спасибо за отзыв!")
    expect(createMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticketId: "T1",
          direction: "OUTBOUND",
          text: "Спасибо за отзыв!",
          authorId: "U1",
        }),
      })
    )
  })

  it("QUESTION: вызывает replyQuestion", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "T2",
      channel: "QUESTION",
      wbExternalId: "WB2",
    })
    const { replyToTicket } = await import("@/app/actions/support")
    const res = await replyToTicket("T2", "Будет на следующей неделе")
    expect(res).toEqual({ ok: true })
    expect(replyQuestionMock).toHaveBeenCalledWith(
      "WB2",
      "Будет на следующей неделе"
    )
  })

  it("возвращает ошибку при пустом тексте", async () => {
    const { replyToTicket } = await import("@/app/actions/support")
    const res = await replyToTicket("T1", "   ")
    expect(res).toEqual({ ok: false, error: "Пустой ответ" })
    expect(replyFeedbackMock).not.toHaveBeenCalled()
  })

  it("возвращает ошибку если тикет не найден", async () => {
    findUniqueMock.mockResolvedValueOnce(null)
    const { replyToTicket } = await import("@/app/actions/support")
    const res = await replyToTicket("missing", "text")
    expect(res).toEqual({ ok: false, error: "Тикет не найден" })
  })

  it("при ошибке WB API не создаёт OUTBOUND message", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "T1",
      channel: "FEEDBACK",
      wbExternalId: "WB1",
    })
    replyFeedbackMock.mockRejectedValueOnce(new Error("WB API 500"))
    const { replyToTicket } = await import("@/app/actions/support")
    const res = await replyToTicket("T1", "text")
    expect(res.ok).toBe(false)
    expect(createMessageMock).not.toHaveBeenCalled()
  })

  it("не поддерживает CHAT/RETURN/MESSENGER в Phase 8", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "T1",
      channel: "CHAT",
      wbExternalId: "WB1",
    })
    const { replyToTicket } = await import("@/app/actions/support")
    const res = await replyToTicket("T1", "text")
    expect(res).toEqual({
      ok: false,
      error: "Канал не поддерживает ответ в Phase 8",
    })
  })
})

describe("assignTicket", () => {
  it("обновляет assignedToId и status=IN_PROGRESS при назначении", async () => {
    const { assignTicket } = await import("@/app/actions/support")
    const res = await assignTicket("T1", "U2")
    expect(res).toEqual({ ok: true })
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "T1" },
        data: expect.objectContaining({
          assignedToId: "U2",
          status: "IN_PROGRESS",
        }),
      })
    )
  })

  it("null снимает назначение без изменения статуса", async () => {
    const { assignTicket } = await import("@/app/actions/support")
    const res = await assignTicket("T1", null)
    expect(res).toEqual({ ok: true })
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assignedToId: null,
          status: undefined,
        }),
      })
    )
  })
})

describe("updateTicketStatus", () => {
  it("переводит статус NEW → IN_PROGRESS", async () => {
    const { updateTicketStatus } = await import("@/app/actions/support")
    const res = await updateTicketStatus("T1", "IN_PROGRESS")
    expect(res).toEqual({ ok: true })
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "IN_PROGRESS",
          resolvedAt: null,
        }),
      })
    )
  })

  it("ANSWERED выставляет resolvedAt", async () => {
    const { updateTicketStatus } = await import("@/app/actions/support")
    await updateTicketStatus("T1", "ANSWERED")
    const call = updateMock.mock.calls[0][0]
    expect(call.data.status).toBe("ANSWERED")
    expect(call.data.resolvedAt).toBeInstanceOf(Date)
  })

  it("отклоняет APPEALED как manual-статус (резерв Phase 11)", async () => {
    const { updateTicketStatus } = await import("@/app/actions/support")
    const res = await updateTicketStatus("T1", "APPEALED" as TicketStatus)
    expect(res).toEqual({
      ok: false,
      error: "Этот статус нельзя установить вручную",
    })
  })
})
