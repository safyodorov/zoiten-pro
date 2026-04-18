import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Integration-тесты syncChats (Plan 10-02 задача 1).
// Паттерн: in-memory Prisma state + mock @/lib/wb-support-api + node:fs mock.

interface MockTicket {
  id: string
  channel: string
  wbExternalId: string
  chatReplySign?: string | null
  customerNameSnapshot?: string | null
  previewText?: string | null
  nmId?: number | null
  status?: string
  lastMessageAt?: Date | null
}

interface MockMessage {
  id: string
  ticketId: string
  direction: string
  text?: string | null
  wbEventId?: string
  wbSentAt?: Date
  isAutoReply?: boolean
  authorId?: string | null
  sentAt?: Date
}

interface MockMedia {
  id: string
  messageId: string
  type: string
  wbUrl: string
  expiresAt: Date
  localPath?: string
  sizeBytes?: number
}

const state = {
  tickets: [] as MockTicket[],
  messages: [] as MockMessage[],
  media: [] as MockMedia[],
  settings: new Map<string, string>(),
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    supportTicket: {
      findUnique: async ({ where }: { where: { channel_wbExternalId?: { channel: string; wbExternalId: string }; id?: string } }) => {
        const cw = where.channel_wbExternalId
        if (cw) {
          return (
            state.tickets.find(
              (t) => t.channel === cw.channel && t.wbExternalId === cw.wbExternalId
            ) ?? null
          )
        }
        return state.tickets.find((t) => t.id === where.id) ?? null
      },
      create: async ({ data }: { data: Partial<MockTicket> }) => {
        const t: MockTicket = {
          id: `T${state.tickets.length + 1}`,
          channel: data.channel ?? "",
          wbExternalId: data.wbExternalId ?? "",
          ...data,
        }
        state.tickets.push(t)
        return t
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<MockTicket> }) => {
        const t = state.tickets.find((x) => x.id === where.id)
        if (!t) throw new Error("not found")
        Object.assign(t, data)
        return t
      },
    },
    supportMessage: {
      findUnique: async ({ where }: { where: { wbEventId: string } }) =>
        state.messages.find((m) => m.wbEventId === where.wbEventId) ?? null,
      create: async ({ data }: { data: Partial<MockMessage> }) => {
        const m: MockMessage = {
          id: `M${state.messages.length + 1}`,
          ticketId: data.ticketId ?? "",
          direction: data.direction ?? "",
          ...data,
        }
        state.messages.push(m)
        return m
      },
    },
    supportMedia: {
      create: async ({ data }: { data: Partial<MockMedia> }) => {
        const md: MockMedia = {
          id: `MD${state.media.length + 1}`,
          messageId: data.messageId ?? "",
          type: data.type ?? "",
          wbUrl: data.wbUrl ?? "",
          expiresAt: data.expiresAt ?? new Date(),
          ...data,
        }
        state.media.push(md)
        return md
      },
      updateMany: async ({ where, data }: { where: { messageId: string; wbUrl: string }; data: Partial<MockMedia> }) => {
        let count = 0
        for (const md of state.media) {
          if (md.messageId === where.messageId && md.wbUrl === where.wbUrl) {
            Object.assign(md, data)
            count++
          }
        }
        return { count }
      },
    },
    appSetting: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        state.settings.has(where.key)
          ? { key: where.key, value: state.settings.get(where.key) }
          : null,
      upsert: async ({ where, create, update }: { where: { key: string }; create: { key: string; value: string }; update: { value: string } }) => {
        state.settings.set(where.key, update?.value ?? create?.value)
        return { key: where.key, value: state.settings.get(where.key) }
      },
    },
  },
}))

vi.mock("@/lib/wb-support-api", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/wb-support-api")
  return {
    ...actual,
    listChats: vi.fn(),
    getChatEvents: vi.fn(),
    downloadChatAttachment: vi.fn(),
    listFeedbacks: vi.fn(),
    listQuestions: vi.fn(),
    listReturns: vi.fn(),
  }
})

vi.mock("@/lib/support-media", () => ({
  downloadMediaBatch: vi.fn().mockResolvedValue([]),
}))

vi.mock("node:fs", () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}))

beforeEach(() => {
  state.tickets = []
  state.messages = []
  state.media = []
  state.settings.clear()
})
afterEach(() => vi.resetAllMocks())

describe("syncChats — Phase B (chats)", () => {
  it("создаёт новый SupportTicket channel=CHAT с chatReplySign + customerNameSnapshot", async () => {
    const api = (await import("@/lib/wb-support-api")) as unknown as {
      listChats: ReturnType<typeof vi.fn>
      getChatEvents: ReturnType<typeof vi.fn>
    }
    api.listChats.mockResolvedValueOnce([
      {
        chatID: "CHAT-1",
        replySign: "sig1",
        clientName: "Иван",
        goodCard: { nmID: 100 },
        lastMessage: { text: "Hi", addTimestamp: 1713355200 },
      },
    ])
    api.getChatEvents.mockResolvedValueOnce({ events: [], next: 0, totalEvents: 0 })
    const { syncChats } = await import("@/lib/support-sync")
    const res = await syncChats()
    expect(res.newChats).toBe(1)
    expect(state.tickets[0].channel).toBe("CHAT")
    expect(state.tickets[0].wbExternalId).toBe("CHAT-1")
    expect(state.tickets[0].chatReplySign).toBe("sig1")
    expect(state.tickets[0].customerNameSnapshot).toBe("Иван")
    expect(state.tickets[0].nmId).toBe(100)
    expect(state.tickets[0].previewText).toBe("Hi")
  })

  it("при повторном вызове обновляет chatReplySign (ротация signature)", async () => {
    const api = (await import("@/lib/wb-support-api")) as unknown as {
      listChats: ReturnType<typeof vi.fn>
      getChatEvents: ReturnType<typeof vi.fn>
    }
    state.tickets.push({
      id: "T-existing",
      channel: "CHAT",
      wbExternalId: "CHAT-2",
      chatReplySign: "old-sig",
      customerNameSnapshot: "Мария",
    })
    api.listChats.mockResolvedValueOnce([
      {
        chatID: "CHAT-2",
        replySign: "new-sig",
        clientName: "Мария",
        lastMessage: { text: "A", addTimestamp: 1 },
      },
    ])
    api.getChatEvents.mockResolvedValueOnce({ events: [], next: 0, totalEvents: 0 })
    const { syncChats } = await import("@/lib/support-sync")
    await syncChats()
    expect(state.tickets[0].chatReplySign).toBe("new-sig")
  })
})

describe("syncChats — Phase A (events)", () => {
  it("sender=client → INBOUND, sender=seller → OUTBOUND", async () => {
    const api = (await import("@/lib/wb-support-api")) as unknown as {
      listChats: ReturnType<typeof vi.fn>
      getChatEvents: ReturnType<typeof vi.fn>
    }
    state.tickets.push({ id: "T1", channel: "CHAT", wbExternalId: "C1" })
    api.listChats.mockResolvedValueOnce([])
    api.getChatEvents.mockResolvedValueOnce({
      events: [
        {
          chatID: "C1",
          eventID: "E1",
          eventType: "message",
          isNewChat: false,
          sender: "client",
          message: { text: "in" },
          addTimestamp: 1,
        },
        {
          chatID: "C1",
          eventID: "E2",
          eventType: "message",
          isNewChat: false,
          sender: "seller",
          message: { text: "out" },
          addTimestamp: 2,
        },
      ],
      next: 0,
      totalEvents: 2,
    })
    const { syncChats } = await import("@/lib/support-sync")
    const res = await syncChats()
    expect(res.newMessages).toBe(2)
    expect(state.messages.find((m) => m.wbEventId === "E1")?.direction).toBe("INBOUND")
    expect(state.messages.find((m) => m.wbEventId === "E2")?.direction).toBe("OUTBOUND")
  })

  it("идемпотентен: повторный sync с тем же wbEventId не создаёт дубликаты", async () => {
    const api = (await import("@/lib/wb-support-api")) as unknown as {
      listChats: ReturnType<typeof vi.fn>
      getChatEvents: ReturnType<typeof vi.fn>
    }
    state.tickets.push({ id: "T1", channel: "CHAT", wbExternalId: "C1" })
    const events = [
      {
        chatID: "C1",
        eventID: "E-DUP",
        eventType: "message",
        isNewChat: false,
        sender: "client",
        message: { text: "x" },
        addTimestamp: 1,
      },
    ]
    api.listChats.mockResolvedValue([])
    api.getChatEvents
      .mockResolvedValueOnce({ events, next: 0, totalEvents: 1 })
      .mockResolvedValueOnce({ events, next: 0, totalEvents: 1 })
    const { syncChats } = await import("@/lib/support-sync")
    await syncChats()
    await syncChats()
    expect(state.messages).toHaveLength(1)
  })

  it("isNewChat=true + ticket отсутствует → создаёт тикет", async () => {
    const api = (await import("@/lib/wb-support-api")) as unknown as {
      listChats: ReturnType<typeof vi.fn>
      getChatEvents: ReturnType<typeof vi.fn>
    }
    api.listChats.mockResolvedValueOnce([])
    api.getChatEvents.mockResolvedValueOnce({
      events: [
        {
          chatID: "NEW-C",
          eventID: "E-NEW",
          eventType: "message",
          isNewChat: true,
          sender: "client",
          clientName: "Petra",
          message: { text: "first" },
          addTimestamp: 1,
        },
      ],
      next: 0,
      totalEvents: 1,
    })
    const { syncChats } = await import("@/lib/support-sync")
    const res = await syncChats()
    expect(res.newChats).toBe(1)
    expect(state.tickets[0].wbExternalId).toBe("NEW-C")
    expect(res.newMessages).toBe(1)
  })

  it("attachments.images → SupportMedia IMAGE; attachments.files → DOCUMENT", async () => {
    const api = (await import("@/lib/wb-support-api")) as unknown as {
      listChats: ReturnType<typeof vi.fn>
      getChatEvents: ReturnType<typeof vi.fn>
      downloadChatAttachment: ReturnType<typeof vi.fn>
    }
    state.tickets.push({ id: "T1", channel: "CHAT", wbExternalId: "C1" })
    api.listChats.mockResolvedValueOnce([])
    api.getChatEvents.mockResolvedValueOnce({
      events: [
        {
          chatID: "C1",
          eventID: "E-MEDIA",
          eventType: "message",
          isNewChat: false,
          sender: "client",
          addTimestamp: 1,
          message: {
            text: "media",
            attachments: {
              images: [{ downloadID: "img-1", fileName: "photo.jpg" }],
              files: [{ downloadID: "f-1", fileName: "doc.pdf" }],
            },
          },
        },
      ],
      next: 0,
      totalEvents: 1,
    })
    api.downloadChatAttachment.mockResolvedValue(Buffer.from([1, 2, 3]))
    const { syncChats } = await import("@/lib/support-sync")
    await syncChats()
    expect(state.media.filter((m) => m.type === "IMAGE")).toHaveLength(1)
    expect(state.media.filter((m) => m.type === "DOCUMENT")).toHaveLength(1)
  }, 15000)

  it("обновляет AppSetting.support.chat.lastEventNext после tick", async () => {
    const api = (await import("@/lib/wb-support-api")) as unknown as {
      listChats: ReturnType<typeof vi.fn>
      getChatEvents: ReturnType<typeof vi.fn>
    }
    state.tickets.push({ id: "T1", channel: "CHAT", wbExternalId: "C1" })
    api.listChats.mockResolvedValueOnce([])
    api.getChatEvents.mockResolvedValueOnce({
      events: [
        {
          chatID: "C1",
          eventID: "E-N",
          eventType: "message",
          isNewChat: false,
          sender: "client",
          message: { text: "x" },
          addTimestamp: 1,
        },
      ],
      next: 1713999999999,
      totalEvents: 1,
    })
    const { syncChats } = await import("@/lib/support-sync")
    await syncChats()
    expect(state.settings.get("support.chat.lastEventNext")).toBe("1713999999999")
  })
})
