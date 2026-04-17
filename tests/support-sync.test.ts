import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock in-memory state для Prisma
const prismaState = {
  tickets: [] as any[],
  messages: [] as any[],
  media: [] as any[],
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (cb: any) =>
      cb({
        supportTicket: {
          upsert: async ({ where, create, update }: any) => {
            const key = `${where.channel_wbExternalId.channel}_${where.channel_wbExternalId.wbExternalId}`
            const existing = prismaState.tickets.find(
              (t) => `${t.channel}_${t.wbExternalId}` === key
            )
            if (existing) {
              Object.assign(existing, update)
              return existing
            }
            const t = { id: `T${prismaState.tickets.length + 1}`, ...create }
            prismaState.tickets.push(t)
            return t
          },
        },
        supportMessage: {
          findFirst: async ({ where }: any) =>
            prismaState.messages.find(
              (m) => m.ticketId === where.ticketId && m.direction === where.direction
            ) ?? null,
          create: async ({ data }: any) => {
            const m = { id: `M${prismaState.messages.length + 1}`, ...data }
            prismaState.messages.push(m)
            return m
          },
        },
        supportMedia: {
          create: async ({ data }: any) => {
            const md = { id: `MD${prismaState.media.length + 1}`, ...data }
            prismaState.media.push(md)
            return md
          },
        },
      }),
    supportMedia: {
      updateMany: async () => ({ count: 0 }),
    },
    appSetting: {
      upsert: async () => ({}),
    },
  },
}))

vi.mock("@/lib/wb-support-api", () => ({
  listFeedbacks: vi.fn(),
  listQuestions: vi.fn(),
}))

vi.mock("@/lib/support-media", () => ({
  downloadMediaBatch: vi.fn().mockResolvedValue([]),
}))

beforeEach(() => {
  prismaState.tickets = []
  prismaState.messages = []
  prismaState.media = []
})

afterEach(() => vi.clearAllMocks())

describe("syncSupport", () => {
  it("делает upsert SupportTicket FEEDBACK с корректными полями", async () => {
    const { listFeedbacks, listQuestions } = (await import(
      "@/lib/wb-support-api"
    )) as any
    listFeedbacks
      .mockResolvedValueOnce([
        {
          id: "YX52",
          text: "Супер",
          productValuation: 5,
          createdDate: "2026-01-01T10:00:00Z",
          state: "wbRu",
          answer: null,
          productDetails: {
            imtId: 1,
            nmId: 123,
            productName: "X",
            supplierArticle: "",
            brandName: "",
          },
          photoLinks: [],
          video: null,
        },
      ])
      .mockResolvedValueOnce([])
    listQuestions.mockResolvedValueOnce([])

    const { syncSupport } = await import("@/lib/support-sync")
    const res = await syncSupport({ isAnswered: false })

    expect(res.feedbacksSynced).toBe(1)
    expect(prismaState.tickets).toHaveLength(1)
    expect(prismaState.tickets[0].channel).toBe("FEEDBACK")
    expect(prismaState.tickets[0].wbExternalId).toBe("YX52")
    expect(prismaState.tickets[0].nmId).toBe(123)
    expect(prismaState.tickets[0].rating).toBe(5)
    expect(prismaState.tickets[0].customerId).toBeNull()
  })

  it("идемпотентен: повторный sync того же feedback не создаёт дубль", async () => {
    const { listFeedbacks, listQuestions } = (await import(
      "@/lib/wb-support-api"
    )) as any
    const fb = {
      id: "A1",
      text: "t",
      productValuation: 4,
      createdDate: "",
      state: "wbRu",
      answer: null,
      productDetails: {
        imtId: 1,
        nmId: 1,
        productName: "",
        supplierArticle: "",
        brandName: "",
      },
      photoLinks: [],
      video: null,
    }
    listFeedbacks.mockResolvedValue([fb])
    listQuestions.mockResolvedValue([])

    const { syncSupport } = await import("@/lib/support-sync")
    await syncSupport()
    await syncSupport()
    expect(prismaState.tickets).toHaveLength(1)
  })

  it("создаёт OUTBOUND SupportMessage если WB answer.text есть", async () => {
    const { listFeedbacks, listQuestions } = (await import(
      "@/lib/wb-support-api"
    )) as any
    listFeedbacks
      .mockResolvedValueOnce([
        {
          id: "B1",
          text: "txt",
          productValuation: 5,
          createdDate: "",
          state: "wbRu",
          answer: {
            text: "Ответ",
            state: "wbRu",
            editable: true,
            createDate: "2026-01-02T00:00:00Z",
          },
          productDetails: {
            imtId: 1,
            nmId: 2,
            productName: "",
            supplierArticle: "",
            brandName: "",
          },
          photoLinks: [],
          video: null,
        },
      ])
      .mockResolvedValueOnce([])
    listQuestions.mockResolvedValueOnce([])

    const { syncSupport } = await import("@/lib/support-sync")
    await syncSupport()
    expect(prismaState.messages.filter((m) => m.direction === "OUTBOUND")).toHaveLength(
      1
    )
    expect(
      prismaState.messages.find((m) => m.direction === "OUTBOUND")?.text
    ).toBe("Ответ")
  })

  it("обрабатывает QUESTION: создаёт ticket QUESTION и INBOUND message", async () => {
    const { listFeedbacks, listQuestions } = (await import(
      "@/lib/wb-support-api"
    )) as any
    listFeedbacks.mockResolvedValueOnce([])
    listQuestions
      .mockResolvedValueOnce([
        {
          id: "Q1",
          text: "Вопрос?",
          createdDate: "2026-01-01T00:00:00Z",
          state: "wbRu",
          answer: null,
          productDetails: {
            imtId: 1,
            nmId: 99,
            productName: "",
            supplierArticle: "",
            brandName: "",
          },
        },
      ])
      .mockResolvedValueOnce([])

    const { syncSupport } = await import("@/lib/support-sync")
    const res = await syncSupport()
    expect(res.questionsSynced).toBe(1)
    expect(prismaState.tickets[0].channel).toBe("QUESTION")
    expect(prismaState.messages[0].direction).toBe("INBOUND")
    expect(prismaState.messages[0].text).toBe("Вопрос?")
  })
})
