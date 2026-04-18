import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Integration tests for sendChatMessageAction (Plan 10-03 Task 1).
// In-memory Prisma + mocks: @/lib/wb-support-api, @/lib/rbac, @/lib/auth, next/cache, node:fs

interface TicketRow {
  id: string
  channel: string
  chatReplySign: string | null
  wbExternalId: string | null
  status?: string
  lastMessageAt?: Date
}
interface MessageRow {
  id: string
  ticketId: string
  direction: string
  text: string | null
  authorId: string | null
  isAutoReply: boolean
  wbSentAt?: Date
  sentAt?: Date
}
interface MediaRow {
  id: string
  messageId: string
  type: string
  wbUrl: string
  localPath: string | null
  sizeBytes: number
  expiresAt: Date
}

const state: {
  tickets: TicketRow[]
  messages: MessageRow[]
  media: MediaRow[]
} = {
  tickets: [],
  messages: [],
  media: [],
}

const sendChatMessageMock = vi.fn()
const revalidateMock = vi.fn()
const requireSectionMock = vi.fn()
const authMock = vi.fn()
const mkdirMock = vi.fn()
const writeFileMock = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    supportTicket: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.tickets.find((t) => t.id === where.id) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string }
        data: Partial<TicketRow>
      }) => {
        const t = state.tickets.find((x) => x.id === where.id)
        if (!t) throw new Error("ticket not found")
        Object.assign(t, data)
        return t
      },
    },
    supportMessage: {
      create: async ({ data }: { data: Omit<MessageRow, "id"> }) => {
        const m: MessageRow = { id: `M${state.messages.length + 1}`, ...data }
        state.messages.push(m)
        return m
      },
    },
    supportMedia: {
      create: async ({ data }: { data: Omit<MediaRow, "id"> }) => {
        const md: MediaRow = { id: `MD${state.media.length + 1}`, ...data }
        state.media.push(md)
        return md
      },
    },
  },
}))

vi.mock("@/lib/wb-support-api", () => ({
  sendChatMessage: sendChatMessageMock,
  replyFeedback: vi.fn(),
  replyQuestion: vi.fn(),
  approveReturn: vi.fn(),
  rejectReturn: vi.fn(),
  reconsiderReturn: vi.fn(),
}))

vi.mock("@/lib/rbac", () => ({
  requireSection: requireSectionMock,
}))

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}))

vi.mock("next/cache", () => ({
  revalidatePath: revalidateMock,
}))

vi.mock("node:fs", () => ({
  promises: {
    mkdir: mkdirMock,
    writeFile: writeFileMock,
  },
}))

function makeFile(content: Uint8Array, name: string, type: string): File {
  return new File([content], name, { type })
}

beforeEach(() => {
  state.tickets = [
    {
      id: "T1",
      channel: "CHAT",
      chatReplySign: "sig1",
      wbExternalId: "C1",
      status: "NEW",
    },
  ]
  state.messages = []
  state.media = []
  sendChatMessageMock.mockReset()
  sendChatMessageMock.mockResolvedValue({ ok: true })
  revalidateMock.mockReset()
  requireSectionMock.mockReset()
  requireSectionMock.mockResolvedValue(undefined)
  authMock.mockReset()
  authMock.mockResolvedValue({ user: { id: "U1" } })
  mkdirMock.mockReset()
  mkdirMock.mockResolvedValue(undefined)
  writeFileMock.mockReset()
  writeFileMock.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.resetModules()
})

describe("sendChatMessageAction — happy path", () => {
  it("создаёт OUTBOUND + вызывает sendChatMessage + revalidatePath", async () => {
    const { sendChatMessageAction } = await import("@/app/actions/support")
    const fd = new FormData()
    fd.set("ticketId", "T1")
    fd.set("text", "Здравствуйте, ответ менеджера")
    const res = await sendChatMessageAction(fd)
    expect(res).toEqual({ ok: true })
    expect(sendChatMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        replySign: "sig1",
        message: "Здравствуйте, ответ менеджера",
      })
    )
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0].direction).toBe("OUTBOUND")
    expect(state.messages[0].isAutoReply).toBe(false)
    expect(state.messages[0].authorId).toBe("U1")
    expect(revalidateMock).toHaveBeenCalledWith("/support")
    expect(revalidateMock).toHaveBeenCalledWith("/support/T1")
  })

  it("создаёт SupportMedia IMAGE для JPEG и DOCUMENT для PDF", async () => {
    const { sendChatMessageAction } = await import("@/app/actions/support")
    const fd = new FormData()
    fd.set("ticketId", "T1")
    fd.set("text", "с файлами")
    fd.append("files", makeFile(new Uint8Array([1, 2, 3]), "photo.jpg", "image/jpeg"))
    fd.append("files", makeFile(new Uint8Array([4, 5, 6]), "doc.pdf", "application/pdf"))
    const res = await sendChatMessageAction(fd)
    expect(res.ok).toBe(true)
    expect(state.media).toHaveLength(2)
    expect(state.media.find((m) => m.type === "IMAGE")).toBeDefined()
    expect(state.media.find((m) => m.type === "DOCUMENT")).toBeDefined()
    expect(writeFileMock).toHaveBeenCalledTimes(2)
    expect(mkdirMock).toHaveBeenCalled()
  })

  it("обновляет ticket.status на ANSWERED + lastMessageAt", async () => {
    const { sendChatMessageAction } = await import("@/app/actions/support")
    const fd = new FormData()
    fd.set("ticketId", "T1")
    fd.set("text", "ответ")
    await sendChatMessageAction(fd)
    expect(state.tickets[0].status).toBe("ANSWERED")
    expect(state.tickets[0].lastMessageAt).toBeInstanceOf(Date)
  })
})

describe("sendChatMessageAction — validation", () => {
  it("reject: пустое сообщение (нет text и files)", async () => {
    const { sendChatMessageAction } = await import("@/app/actions/support")
    const fd = new FormData()
    fd.set("ticketId", "T1")
    fd.set("text", "")
    const res = await sendChatMessageAction(fd)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("Пустое")
  })

  it("reject: text > 1000 символов", async () => {
    const { sendChatMessageAction } = await import("@/app/actions/support")
    const fd = new FormData()
    fd.set("ticketId", "T1")
    fd.set("text", "x".repeat(1001))
    const res = await sendChatMessageAction(fd)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("1000")
  })

  it("reject: недопустимый MIME (text/plain)", async () => {
    const { sendChatMessageAction } = await import("@/app/actions/support")
    const fd = new FormData()
    fd.set("ticketId", "T1")
    fd.set("text", "text")
    fd.append("files", makeFile(new Uint8Array([1]), "script.txt", "text/plain"))
    const res = await sendChatMessageAction(fd)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("формат")
  })

  it("reject: файл > 5 МБ", async () => {
    const { sendChatMessageAction } = await import("@/app/actions/support")
    const fd = new FormData()
    fd.set("ticketId", "T1")
    const big = new Uint8Array(5 * 1024 * 1024 + 1)
    fd.append("files", makeFile(big, "big.jpg", "image/jpeg"))
    const res = await sendChatMessageAction(fd)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("5 МБ")
  })
})

describe("sendChatMessageAction — guards", () => {
  it("reject: тикет не CHAT", async () => {
    state.tickets[0].channel = "FEEDBACK"
    const { sendChatMessageAction } = await import("@/app/actions/support")
    const fd = new FormData()
    fd.set("ticketId", "T1")
    fd.set("text", "ответ")
    const res = await sendChatMessageAction(fd)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("CHAT")
  })

  it("reject: chatReplySign отсутствует", async () => {
    state.tickets[0].chatReplySign = null
    const { sendChatMessageAction } = await import("@/app/actions/support")
    const fd = new FormData()
    fd.set("ticketId", "T1")
    fd.set("text", "ответ")
    const res = await sendChatMessageAction(fd)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("replySign")
  })

  it("reject: VIEWER (requireSection throws)", async () => {
    requireSectionMock.mockRejectedValueOnce(new Error("Недостаточно прав"))
    const { sendChatMessageAction } = await import("@/app/actions/support")
    const fd = new FormData()
    fd.set("ticketId", "T1")
    fd.set("text", "ответ")
    const res = await sendChatMessageAction(fd)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("Недостаточно")
  })

  it("WB-first: если WB throws — OUTBOUND message НЕ создаётся", async () => {
    sendChatMessageMock.mockRejectedValueOnce(new Error("WB 503"))
    const { sendChatMessageAction } = await import("@/app/actions/support")
    const fd = new FormData()
    fd.set("ticketId", "T1")
    fd.set("text", "ответ")
    const res = await sendChatMessageAction(fd)
    expect(res.ok).toBe(false)
    expect(state.messages).toHaveLength(0)
    expect(state.tickets[0].status).toBe("NEW")
  })

  it("reject: ticket не найден", async () => {
    const { sendChatMessageAction } = await import("@/app/actions/support")
    const fd = new FormData()
    fd.set("ticketId", "TNotExist")
    fd.set("text", "ответ")
    const res = await sendChatMessageAction(fd)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("не найден")
  })
})
