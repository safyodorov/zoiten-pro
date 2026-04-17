import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import sampleResponse from "./fixtures/wb-claim-sample.json"

// ── Единый mock Prisma (Warning 5) ──────────────────────────────
// Поддерживает обе формы $transaction:
//   - callback: prisma.$transaction(async (tx) => {...}) — 09-02 syncReturns
//   - array: prisma.$transaction([op1, op2]) — 09-04 actions
// tx внутри callback — это сам prismaMock (dual-mode), НЕ undefined.
const prismaMock = {
  supportTicket: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  supportMessage: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  supportMedia: {
    create: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  returnDecision: { create: vi.fn() },
  appSetting: {
    upsert: vi.fn().mockResolvedValue({}),
  },
  $transaction: vi.fn(async (arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg as unknown[])
    if (typeof arg === "function") {
      return (arg as (tx: unknown) => unknown)(prismaMock)
    }
    return arg
  }),
}

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

vi.mock("@/lib/support-media", () => ({
  downloadMediaBatch: vi.fn().mockResolvedValue([]),
}))

const ORIGINAL_TOKEN = process.env.WB_API_TOKEN
const ORIGINAL_RETURNS_TOKEN = process.env.WB_RETURNS_TOKEN

beforeEach(() => {
  process.env.WB_API_TOKEN = "test-token"
  process.env.WB_RETURNS_TOKEN = "test-returns-token"
  vi.stubGlobal("fetch", vi.fn())

  // Сбросить все Prisma моки
  prismaMock.supportTicket.upsert.mockReset()
  prismaMock.supportTicket.findUnique.mockReset()
  prismaMock.supportTicket.update.mockReset()
  prismaMock.supportMessage.findFirst.mockReset()
  prismaMock.supportMessage.create.mockReset()
  prismaMock.supportMedia.create.mockReset()
  prismaMock.returnDecision.create.mockReset()

  // Дефолтное поведение $transaction — выполнить callback с prismaMock
  prismaMock.$transaction.mockImplementation(async (arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg as unknown[])
    if (typeof arg === "function") {
      return (arg as (tx: unknown) => unknown)(prismaMock)
    }
    return arg
  })
})

afterEach(() => {
  process.env.WB_API_TOKEN = ORIGINAL_TOKEN
  process.env.WB_RETURNS_TOKEN = ORIGINAL_RETURNS_TOKEN
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function mockRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("syncReturns()", () => {
  it("создаёт SupportTicket с channel=RETURN, returnState=PENDING и нужные поля из Claim", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockRes(sampleResponse)) // is_archive=false → 1 claim
      .mockResolvedValueOnce(mockRes({ claims: [], total: 0 })) // is_archive=true

    prismaMock.supportTicket.findUnique.mockResolvedValue(null) // isCreate=true
    prismaMock.supportTicket.upsert.mockResolvedValue({ id: "ticket-1" })
    prismaMock.supportMessage.findFirst.mockResolvedValue(null)
    prismaMock.supportMessage.create.mockResolvedValue({ id: "msg-1" })
    prismaMock.supportMedia.create.mockResolvedValue({})

    const { syncReturns } = await import("@/lib/support-sync")
    const result = await syncReturns()

    expect(result.synced).toBe(1)
    expect(result.created).toBe(1)
    expect(result.updated).toBe(0)

    expect(prismaMock.supportTicket.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          channel_wbExternalId: {
            channel: "RETURN",
            wbExternalId: "fe3e9337-e9f9-423c-8930-946a8ebef80",
          },
        },
        create: expect.objectContaining({
          channel: "RETURN",
          returnState: "PENDING",
          wbActions: ["autorefund1", "approve1"],
          nmId: 196320101,
        }),
      })
    )
  })

  it("идемпотентен: повторный вызов обновляет, но НЕ трогает returnState", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockRes(sampleResponse))
      .mockResolvedValueOnce(mockRes({ claims: [], total: 0 }))

    prismaMock.supportTicket.findUnique.mockResolvedValue({ id: "ticket-1" }) // already exists
    prismaMock.supportTicket.upsert.mockResolvedValue({ id: "ticket-1" })
    prismaMock.supportMessage.findFirst.mockResolvedValue({ id: "msg-1" }) // already exists

    const { syncReturns } = await import("@/lib/support-sync")
    const result = await syncReturns()

    expect(result.updated).toBe(1)
    expect(result.created).toBe(0)

    const upsertCall = prismaMock.supportTicket.upsert.mock.calls[0][0] as {
      update: Record<string, unknown>
    }
    expect(upsertCall.update).not.toHaveProperty("returnState")
    expect(upsertCall.update).not.toHaveProperty("status")
    expect(upsertCall.update).toHaveProperty("wbClaimStatus")
    expect(upsertCall.update).toHaveProperty("wbActions")
  })

  it("создаёт SupportMedia с https: префиксом для photos и video_paths", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockRes(sampleResponse))
      .mockResolvedValueOnce(mockRes({ claims: [], total: 0 }))

    prismaMock.supportTicket.findUnique.mockResolvedValue(null)
    prismaMock.supportTicket.upsert.mockResolvedValue({ id: "ticket-1" })
    prismaMock.supportMessage.findFirst.mockResolvedValue(null)
    prismaMock.supportMessage.create.mockResolvedValue({ id: "msg-1" })
    prismaMock.supportMedia.create.mockResolvedValue({})

    const { syncReturns } = await import("@/lib/support-sync")
    await syncReturns()

    // 2 photos + 1 video = 3 media calls
    expect(prismaMock.supportMedia.create).toHaveBeenCalledTimes(3)
    const urls = prismaMock.supportMedia.create.mock.calls.map(
      (c) => (c[0] as { data: { wbUrl: string } }).data.wbUrl
    )
    expect(urls.every((u) => u.startsWith("https:"))).toBe(true)
    expect(urls).toContain(
      "https://photos.wbstatic.net/claim/fe3e9337-e9f9-423c-8930-946a8ebef80/1.webp"
    )
    expect(urls).toContain(
      "https://video.wbstatic.net/claim/fe3e9337-e9f9-423c-8930-946a8ebef80/1.mp4"
    )
  })

  it("вызывает listReturns с is_archive=false И is_archive=true", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(mockRes({ claims: [], total: 0 })) // is_archive=false
      .mockResolvedValueOnce(mockRes({ claims: [], total: 0 })) // is_archive=true

    const { syncReturns } = await import("@/lib/support-sync")
    await syncReturns()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes("is_archive=false"))).toBe(true)
    expect(urls.some((u) => u.includes("is_archive=true"))).toBe(true)
  })

  it("при ошибке одной заявки продолжает обработку остальных (error collected, не throws)", async () => {
    const doubleClaim = {
      claims: [
        { ...sampleResponse.claims[0], id: "uuid-1" },
        { ...sampleResponse.claims[0], id: "uuid-2" },
      ],
      total: 2,
    }
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockRes(doubleClaim))
      .mockResolvedValueOnce(mockRes({ claims: [], total: 0 }))

    prismaMock.supportTicket.findUnique.mockResolvedValue(null)
    prismaMock.supportTicket.upsert
      .mockRejectedValueOnce(new Error("DB error uuid-1"))
      .mockResolvedValueOnce({ id: "ticket-2" })
    prismaMock.supportMessage.findFirst.mockResolvedValue(null)
    prismaMock.supportMessage.create.mockResolvedValue({ id: "msg-2" })

    const { syncReturns } = await import("@/lib/support-sync")
    const result = await syncReturns()

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain("uuid-1")
    expect(result.synced).toBe(1) // uuid-2 прошёл
  })
})
