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
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
  },
}))

vi.mock("@/lib/wb-support-api", () => ({
  listFeedbacks: vi.fn(),
  listQuestions: vi.fn(),
  WbRateLimitError: class WbRateLimitError extends Error {
    retryAfterSec: number
    endpoint: string
    constructor(retryAfterSec: number, endpoint: string) {
      super(
        `WB API 429: rate-limit требует ожидания ${retryAfterSec}s — превышает cap 60s, повторим на следующий cron tick`
      )
      this.name = "WbRateLimitError"
      this.retryAfterSec = retryAfterSec
      this.endpoint = endpoint
    }
  },
}))

vi.mock("@/lib/support-media", () => ({
  downloadMediaBatch: vi.fn().mockResolvedValue([]),
}))

beforeEach(async () => {
  prismaState.tickets = []
  prismaState.messages = []
  prismaState.media = []

  // Восстанавливаем дефолтные реализации vi.fn() после resetAllMocks
  const { prisma } = (await import("@/lib/prisma")) as any
  prisma.appSetting.findUnique.mockResolvedValue(null)
  prisma.appSetting.upsert.mockResolvedValue({})
  prisma.appSetting.delete.mockResolvedValue({})

  const { downloadMediaBatch } = (await import("@/lib/support-media")) as any
  downloadMediaBatch.mockResolvedValue([])
})

afterEach(() => vi.resetAllMocks())

describe("syncSupport", () => {
  it("делает upsert SupportTicket FEEDBACK с корректными полями", async () => {
    const { listFeedbacks, listQuestions } = (await import(
      "@/lib/wb-support-api"
    )) as any
    // 1 feedback < 5000 → pagination breaks after first call
    listFeedbacks.mockResolvedValueOnce([
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
    listQuestions.mockResolvedValue([])

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
    // 1 feedback < 5000 → pagination breaks after first call
    listFeedbacks.mockResolvedValueOnce([
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
    listQuestions.mockResolvedValue([])

    const { syncSupport } = await import("@/lib/support-sync")
    await syncSupport()
    expect(prismaState.messages.filter((m) => m.direction === "OUTBOUND")).toHaveLength(
      1
    )
    expect(
      prismaState.messages.find((m) => m.direction === "OUTBOUND")?.text
    ).toBe("Ответ")
  })

  it("повышает status NEW → ANSWERED при повторном sync, если WB feedback получил ответ", async () => {
    const { listFeedbacks, listQuestions } = (await import(
      "@/lib/wb-support-api"
    )) as any
    const base = {
      id: "FX1",
      text: "текст",
      productValuation: 5,
      createdDate: "",
      state: "wbRu",
      productDetails: {
        imtId: 1,
        nmId: 7,
        productName: "",
        supplierArticle: "",
        brandName: "",
      },
      photoLinks: [],
      video: null,
    }
    // 1-й sync: без ответа → NEW
    // mockResolvedValueOnce([batch]) — один вызов, 1 < 5000 → break, второй Once не нужен
    listFeedbacks.mockResolvedValueOnce([{ ...base, answer: null }])
    listQuestions.mockResolvedValue([])
    const { syncSupport } = await import("@/lib/support-sync")
    await syncSupport()
    expect(prismaState.tickets[0].status).toBe("NEW")

    // 2-й sync: ответ появился в WB кабинете → status должен стать ANSWERED
    listFeedbacks.mockResolvedValueOnce([
      {
        ...base,
        answer: { text: "Спасибо", state: "wbRu", editable: true, createDate: "" },
      },
    ])
    await syncSupport()
    expect(prismaState.tickets).toHaveLength(1)
    expect(prismaState.tickets[0].status).toBe("ANSWERED")
  })

  it("повышает status NEW → ANSWERED для QUESTION при повторном sync", async () => {
    const { listFeedbacks, listQuestions } = (await import(
      "@/lib/wb-support-api"
    )) as any
    const base = {
      id: "QX1",
      text: "вопрос?",
      createdDate: "",
      state: "wbRu",
      productDetails: {
        imtId: 1,
        nmId: 9,
        productName: "",
        supplierArticle: "",
        brandName: "",
      },
    }
    listFeedbacks.mockResolvedValue([])
    // mockResolvedValueOnce([batch]) — один вызов, 1 < 10000 → break, второй Once не нужен
    listQuestions.mockResolvedValueOnce([{ ...base, answer: null }])
    const { syncSupport } = await import("@/lib/support-sync")
    await syncSupport()
    expect(prismaState.tickets[0].status).toBe("NEW")

    listQuestions.mockResolvedValueOnce([
      {
        ...base,
        answer: { text: "Ответ", state: "wbRu", editable: true, createDate: "" },
      },
    ])
    await syncSupport()
    expect(prismaState.tickets).toHaveLength(1)
    expect(prismaState.tickets[0].status).toBe("ANSWERED")
  })

  it("обрабатывает QUESTION: создаёт ticket QUESTION и INBOUND message", async () => {
    const { listFeedbacks, listQuestions } = (await import(
      "@/lib/wb-support-api"
    )) as any
    listFeedbacks.mockResolvedValueOnce([])
    // 1 question < 10000 → pagination breaks after first call, второй Once не нужен
    listQuestions.mockResolvedValueOnce([
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

    const { syncSupport } = await import("@/lib/support-sync")
    const res = await syncSupport()
    expect(res.questionsSynced).toBe(1)
    expect(prismaState.tickets[0].channel).toBe("QUESTION")
    expect(prismaState.messages[0].direction).toBe("INBOUND")
    expect(prismaState.messages[0].text).toBe("Вопрос?")
  })

  // ── Новые тесты: lock-aware questions ───────────────────────

  // 2026-05-12: lock-aware теперь применяется и к Feedbacks тоже (тот же паттерн).
  // findUnique вызывается дважды per syncSupport (1: Feedbacks, 2: Questions),
  // мокаем через mockImplementation с разводкой по key.
  function mockLocks(prisma: any, locks: { feedbacks?: string | null; questions?: string | null }) {
    prisma.appSetting.findUnique.mockImplementation((args: any) => {
      const key = args?.where?.key
      if (key === "wbFeedbacksLockedUntil") {
        return Promise.resolve(locks.feedbacks ? { value: locks.feedbacks } : null)
      }
      if (key === "wbQuestionsLockedUntil") {
        return Promise.resolve(locks.questions ? { value: locks.questions } : null)
      }
      return Promise.resolve(null)
    })
  }

  it("пропускает listQuestions если wbQuestionsLockedUntil > now", async () => {
    const { listFeedbacks, listQuestions } = (await import(
      "@/lib/wb-support-api"
    )) as any
    const { prisma } = (await import("@/lib/prisma")) as any

    // Только Questions lock активен; Feedbacks свободен.
    const unlockAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    mockLocks(prisma, { questions: unlockAt })

    listFeedbacks.mockResolvedValueOnce([]).mockResolvedValue([])
    listQuestions.mockResolvedValueOnce([])

    const { syncSupport } = await import("@/lib/support-sync")
    const result = await syncSupport()

    expect(listQuestions).not.toHaveBeenCalled()
    expect(result.errors.some((e: string) => e.includes("Questions locked until"))).toBe(true)
    expect(result.questionsSynced).toBe(0)
    expect(listFeedbacks).toHaveBeenCalled()
  })

  it("пропускает listFeedbacks если wbFeedbacksLockedUntil > now (симметрично Questions)", async () => {
    const { listFeedbacks, listQuestions } = (await import(
      "@/lib/wb-support-api"
    )) as any
    const { prisma } = (await import("@/lib/prisma")) as any

    // Только Feedbacks lock активен; Questions свободен.
    const unlockAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    mockLocks(prisma, { feedbacks: unlockAt })

    listFeedbacks.mockResolvedValue([])
    listQuestions.mockResolvedValueOnce([])

    const { syncSupport } = await import("@/lib/support-sync")
    const result = await syncSupport()

    expect(listFeedbacks).not.toHaveBeenCalled()
    expect(result.errors.some((e: string) => e.includes("Feedbacks locked until"))).toBe(true)
    expect(result.feedbacksSynced).toBe(0)
    // Questions при этом синкается
    expect(listQuestions).toHaveBeenCalled()
  })

  it("записывает wbQuestionsLockedUntil при WbRateLimitError", async () => {
    const { listFeedbacks, listQuestions, WbRateLimitError } = (await import(
      "@/lib/wb-support-api"
    )) as any
    const { prisma } = (await import("@/lib/prisma")) as any

    mockLocks(prisma, {})

    listFeedbacks.mockResolvedValueOnce([]).mockResolvedValue([])
    listQuestions.mockRejectedValueOnce(
      new WbRateLimitError(720, "/api/v1/questions?take=10000&skip=0")
    )

    const { syncSupport } = await import("@/lib/support-sync")
    const before = Date.now()
    await syncSupport()
    const after = Date.now()

    expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "wbQuestionsLockedUntil" },
      })
    )

    const upsertCall = prisma.appSetting.upsert.mock.calls.find(
      (c: any[]) => c[0]?.where?.key === "wbQuestionsLockedUntil"
    )
    const storedValue = upsertCall?.[0]?.create?.value ?? upsertCall?.[0]?.update?.value
    const storedDate = new Date(storedValue).getTime()
    expect(Math.abs(storedDate - (before + 720 * 1000))).toBeLessThan(5000)
    expect(Math.abs(storedDate - (after + 720 * 1000))).toBeLessThan(5000 + (after - before))
  })

  it("записывает wbFeedbacksLockedUntil при WbRateLimitError на Feedbacks", async () => {
    const { listFeedbacks, listQuestions, WbRateLimitError } = (await import(
      "@/lib/wb-support-api"
    )) as any
    const { prisma } = (await import("@/lib/prisma")) as any

    mockLocks(prisma, {})

    listFeedbacks.mockRejectedValueOnce(
      new WbRateLimitError(720, "/api/v1/feedbacks?take=5000&skip=0")
    )
    listQuestions.mockResolvedValueOnce([])

    const { syncSupport } = await import("@/lib/support-sync")
    await syncSupport()

    expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "wbFeedbacksLockedUntil" },
      })
    )
  })

  it("удаляет wbQuestionsLockedUntil при успехе listQuestions (lockRow есть)", async () => {
    const { listFeedbacks, listQuestions } = (await import(
      "@/lib/wb-support-api"
    )) as any
    const { prisma } = (await import("@/lib/prisma")) as any

    // Questions lock есть но истёк
    const expiredLock = new Date(Date.now() - 60 * 1000).toISOString()
    mockLocks(prisma, { questions: expiredLock })

    listFeedbacks.mockResolvedValueOnce([]).mockResolvedValue([])
    listQuestions.mockResolvedValueOnce([])

    const { syncSupport } = await import("@/lib/support-sync")
    await syncSupport()

    expect(prisma.appSetting.delete).toHaveBeenCalledWith({
      where: { key: "wbQuestionsLockedUntil" },
    })
  })

  it("НЕ удаляет wbQuestionsLockedUntil если lockRow = null (нечего чистить)", async () => {
    const { listFeedbacks, listQuestions } = (await import(
      "@/lib/wb-support-api"
    )) as any
    const { prisma } = (await import("@/lib/prisma")) as any

    mockLocks(prisma, {})

    listFeedbacks.mockResolvedValueOnce([]).mockResolvedValue([])
    listQuestions.mockResolvedValueOnce([])

    const { syncSupport } = await import("@/lib/support-sync")
    await syncSupport()

    expect(prisma.appSetting.delete).not.toHaveBeenCalledWith({
      where: { key: "wbQuestionsLockedUntil" },
    })
  })
})
