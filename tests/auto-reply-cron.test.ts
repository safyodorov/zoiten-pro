import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Integration-тесты runAutoReplies + cron /api/cron/support-sync-chat.
// Mock @/lib/prisma in-memory + mock sendChatMessage + mock syncChats для cron-части.

interface MockConfig {
  id: string
  isEnabled: boolean
  workDays: number[]
  workdayStart: string
  workdayEnd: string
  messageText: string
  timezone: string
}

interface MockTicket {
  id: string
  channel: string
  chatReplySign: string | null
  customerNameSnapshot: string | null
  nmId: number | null
  lastMessageAt: Date
}

interface MockMessage {
  id: string
  ticketId: string
  direction: string
  text?: string | null
  sentAt: Date
  isAutoReply: boolean
}

const state = {
  config: null as MockConfig | null,
  tickets: [] as MockTicket[],
  messages: [] as MockMessage[],
  wbCards: [] as Array<{ nmId: number; name: string }>,
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    autoReplyConfig: {
      findUnique: async () => state.config,
    },
    supportTicket: {
      findMany: async ({ where }: { where: { channel: string; chatReplySign?: { not: null }; lastMessageAt?: { gte: Date } } }) =>
        state.tickets.filter((t) => {
          if (t.channel !== where.channel) return false
          if (where.chatReplySign?.not === null && t.chatReplySign === null) return false
          if (where.lastMessageAt?.gte && t.lastMessageAt < where.lastMessageAt.gte)
            return false
          return true
        }),
    },
    supportMessage: {
      findMany: async ({ where }: { where: { ticketId: string; sentAt?: { gte: Date } } }) =>
        state.messages
          .filter(
            (m) =>
              m.ticketId === where.ticketId &&
              (!where.sentAt?.gte || m.sentAt >= where.sentAt.gte)
          )
          .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime()),
      create: async ({ data }: { data: Partial<MockMessage> }) => {
        const m: MockMessage = {
          id: `M${state.messages.length + 1}`,
          ticketId: data.ticketId ?? "",
          direction: data.direction ?? "",
          sentAt: data.sentAt ?? new Date(),
          isAutoReply: data.isAutoReply ?? false,
          ...data,
        }
        state.messages.push(m)
        return m
      },
    },
    wbCard: {
      findUnique: async ({ where }: { where: { nmId: number } }) =>
        state.wbCards.find((c) => c.nmId === where.nmId) ?? null,
    },
  },
}))

const sendChatMessageMock = vi.fn()
vi.mock("@/lib/wb-support-api", () => ({
  sendChatMessage: sendChatMessageMock,
}))

beforeEach(() => {
  state.config = null
  state.tickets = []
  state.messages = []
  state.wbCards = []
  sendChatMessageMock.mockReset()
  sendChatMessageMock.mockResolvedValue({ ok: true })
  process.env.CRON_SECRET = "test-cron"
})

afterEach(() => {
  vi.clearAllMocks()
  vi.doUnmock("@/lib/support-sync")
})

describe("runAutoReplies — guards", () => {
  it("isEnabled=false → skipped", async () => {
    state.config = {
      id: "default",
      isEnabled: false,
      workDays: [1, 2, 3, 4, 5],
      workdayStart: "09:00",
      workdayEnd: "18:00",
      messageText: "Hi {имя_покупателя}",
      timezone: "Europe/Moscow",
    }
    const { runAutoReplies } = await import("@/lib/auto-reply")
    const res = await runAutoReplies()
    expect(res.sent).toBe(0)
    expect(res.skipped).toBe(1)
  })

  it("внутри рабочих часов → skipped", async () => {
    state.config = {
      id: "default",
      isEnabled: true,
      workDays: [1, 2, 3, 4, 5, 6, 7],
      workdayStart: "00:00",
      workdayEnd: "23:59",
      messageText: "Hi",
      timezone: "Europe/Moscow",
    }
    const { runAutoReplies } = await import("@/lib/auto-reply")
    const res = await runAutoReplies()
    expect(res.sent).toBe(0)
    expect(res.skipped).toBe(1)
  })

  it("AutoReplyConfig отсутствует → errors + sent=0", async () => {
    state.config = null
    const { runAutoReplies } = await import("@/lib/auto-reply")
    const res = await runAutoReplies()
    expect(res.sent).toBe(0)
    expect(res.errors.length).toBe(1)
  })
})

describe("runAutoReplies — happy path (вне рабочих часов)", () => {
  it("отправляет OUTBOUND isAutoReply=true + подстановка {имя_покупателя}/{название_товара}", async () => {
    state.config = {
      id: "default",
      isEnabled: true,
      workDays: [], // пустой workDays = всегда вне рабочих часов
      workdayStart: "09:00",
      workdayEnd: "18:00",
      messageText: "Привет, {имя_покупателя}! Товар: {название_товара}",
      timezone: "Europe/Moscow",
    }
    state.tickets.push({
      id: "T1",
      channel: "CHAT",
      chatReplySign: "sig1",
      customerNameSnapshot: "Иван",
      nmId: 100,
      lastMessageAt: new Date(),
    })
    state.messages.push({
      id: "M1",
      ticketId: "T1",
      direction: "INBOUND",
      text: "?",
      sentAt: new Date(),
      isAutoReply: false,
    })
    state.wbCards.push({ nmId: 100, name: "Кабель HDMI" })

    const { runAutoReplies } = await import("@/lib/auto-reply")
    const res = await runAutoReplies()
    expect(res.sent).toBe(1)
    expect(sendChatMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        replySign: "sig1",
        message: "Привет, Иван! Товар: Кабель HDMI",
      })
    )
    const outbound = state.messages.find((m) => m.direction === "OUTBOUND")
    expect(outbound?.isAutoReply).toBe(true)
  })

  it("fallback 'покупатель' если customerNameSnapshot=null; 'товар' если nmId=null", async () => {
    state.config = {
      id: "default",
      isEnabled: true,
      workDays: [],
      workdayStart: "09:00",
      workdayEnd: "18:00",
      messageText: "{имя_покупателя}, {название_товара}",
      timezone: "Europe/Moscow",
    }
    state.tickets.push({
      id: "T1",
      channel: "CHAT",
      chatReplySign: "sig",
      customerNameSnapshot: null,
      nmId: null,
      lastMessageAt: new Date(),
    })
    state.messages.push({
      id: "M1",
      ticketId: "T1",
      direction: "INBOUND",
      sentAt: new Date(),
      isAutoReply: false,
    })

    const { runAutoReplies } = await import("@/lib/auto-reply")
    await runAutoReplies()
    expect(sendChatMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "покупатель, товар",
      })
    )
  })

  it("dedup: не отправляет если уже был OUTBOUND isAutoReply=true за 24ч", async () => {
    state.config = {
      id: "default",
      isEnabled: true,
      workDays: [],
      workdayStart: "09:00",
      workdayEnd: "18:00",
      messageText: "auto",
      timezone: "Europe/Moscow",
    }
    state.tickets.push({
      id: "T1",
      channel: "CHAT",
      chatReplySign: "sig",
      customerNameSnapshot: "x",
      nmId: null,
      lastMessageAt: new Date(),
    })
    state.messages.push({
      id: "M1",
      ticketId: "T1",
      direction: "INBOUND",
      sentAt: new Date(Date.now() - 3600_000),
      isAutoReply: false,
    })
    state.messages.push({
      id: "M2",
      ticketId: "T1",
      direction: "OUTBOUND",
      sentAt: new Date(Date.now() - 1000),
      isAutoReply: true,
    })

    const { runAutoReplies } = await import("@/lib/auto-reply")
    const res = await runAutoReplies()
    expect(res.sent).toBe(0)
    expect(sendChatMessageMock).not.toHaveBeenCalled()
  })

  it("skip если OUTBOUND (manual reply) был после INBOUND — менеджер уже ответил", async () => {
    state.config = {
      id: "default",
      isEnabled: true,
      workDays: [],
      workdayStart: "09:00",
      workdayEnd: "18:00",
      messageText: "auto",
      timezone: "Europe/Moscow",
    }
    state.tickets.push({
      id: "T1",
      channel: "CHAT",
      chatReplySign: "sig",
      customerNameSnapshot: "x",
      nmId: null,
      lastMessageAt: new Date(),
    })
    state.messages.push({
      id: "M1",
      ticketId: "T1",
      direction: "INBOUND",
      sentAt: new Date(Date.now() - 3600_000),
      isAutoReply: false,
    })
    state.messages.push({
      id: "M2",
      ticketId: "T1",
      direction: "OUTBOUND",
      sentAt: new Date(Date.now() - 1000),
      isAutoReply: false,
    })

    const { runAutoReplies } = await import("@/lib/auto-reply")
    const res = await runAutoReplies()
    expect(res.sent).toBe(0)
  })
})

describe("cron /api/cron/support-sync-chat", () => {
  function mockReq(headers: Record<string, string> = {}) {
    return {
      headers: {
        get: (k: string) => headers[k.toLowerCase()] ?? null,
      },
    } as unknown as import("next/server").NextRequest
  }

  it("возвращает 401 без x-cron-secret", async () => {
    const { GET } = await import("@/app/api/cron/support-sync-chat/route")
    const res = await GET(mockReq({}))
    expect(res.status).toBe(401)
  })

  it("возвращает 200 с { ok, chat, autoReply } при валидном секрете", async () => {
    vi.doMock("@/lib/support-sync", () => ({
      syncChats: vi.fn().mockResolvedValue({
        newChats: 0,
        newMessages: 0,
        mediaDownloaded: 0,
        errors: [],
      }),
    }))
    state.config = null // runAutoReplies вернёт errors (нет конфига), но не 500
    // Нужно перезагрузить route чтобы подхватить doMock
    vi.resetModules()
    const { GET } = await import("@/app/api/cron/support-sync-chat/route")
    const res = await GET(mockReq({ "x-cron-secret": "test-cron" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.chat).toBeDefined()
    expect(body.autoReply).toBeDefined()
  })
})
