import { describe, it, expect, vi, beforeEach } from "vitest"

// Phase 12 Plan 01 — integration тесты Customer auto-upsert в syncChats.
// Паттерн: mock wb-support-api (listChats / getChatEvents пустой) + mock prisma.
// Тестируется Phase B loop (listChats → upsert Customer перед ticket upsert).

vi.mock("@/lib/wb-support-api", () => ({
  listChats: vi.fn(),
  getChatEvents: vi.fn().mockResolvedValue({ events: [], next: 0 }),
  downloadChatAttachment: vi.fn(),
  sendChatMessage: vi.fn(),
}))

const prismaMock = {
  customer: { upsert: vi.fn() },
  supportTicket: {
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  supportMessage: { findUnique: vi.fn(), create: vi.fn() },
  supportMedia: { create: vi.fn(), updateMany: vi.fn() },
  appSetting: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

beforeEach(() => {
  vi.resetAllMocks()
  prismaMock.customer.upsert.mockResolvedValue({
    id: "c-default",
    wbUserId: "chat:default",
    name: null,
  })
  prismaMock.supportTicket.findUnique.mockResolvedValue(null)
  prismaMock.supportTicket.create.mockResolvedValue({ id: "t-new" })
  prismaMock.supportTicket.update.mockResolvedValue({})
  prismaMock.appSetting.findUnique.mockResolvedValue(null)
  prismaMock.appSetting.upsert.mockResolvedValue({})
})

describe("syncChats — Customer auto-upsert (Phase 12)", () => {
  it("создаёт Customer с wbUserId='chat:'+chatID при первом синке чата (Phase B)", async () => {
    const { listChats } = await import("@/lib/wb-support-api")
    ;(listChats as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        chatID: "abc",
        clientName: "Иван Петров",
        replySign: "sig",
        lastMessage: null,
        goodCard: null,
      },
    ])
    prismaMock.customer.upsert.mockResolvedValueOnce({
      id: "c-abc",
      wbUserId: "chat:abc",
      name: "Иван Петров",
    })
    const { syncChats } = await import("@/lib/support-sync")
    await syncChats()
    expect(prismaMock.customer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { wbUserId: "chat:abc" },
        create: expect.objectContaining({
          wbUserId: "chat:abc",
          name: "Иван Петров",
        }),
      })
    )
  })

  it("передаёт customerId в supportTicket.create при создании нового тикета", async () => {
    const { listChats } = await import("@/lib/wb-support-api")
    ;(listChats as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        chatID: "xyz",
        clientName: "Анна",
        replySign: "s2",
        lastMessage: null,
        goodCard: null,
      },
    ])
    prismaMock.customer.upsert.mockResolvedValueOnce({
      id: "c-xyz",
      wbUserId: "chat:xyz",
      name: "Анна",
    })
    const { syncChats } = await import("@/lib/support-sync")
    await syncChats()
    expect(prismaMock.supportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: "c-xyz",
          wbExternalId: "xyz",
        }),
      })
    )
  })

  it("передаёт customerId в supportTicket.update при повторном синке (существующий ticket)", async () => {
    const { listChats } = await import("@/lib/wb-support-api")
    ;(listChats as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        chatID: "existing",
        clientName: "Иван",
        replySign: "s3",
        lastMessage: null,
        goodCard: null,
      },
    ])
    prismaMock.supportTicket.findUnique.mockResolvedValueOnce({
      id: "t-existing",
      nmId: null,
    })
    prismaMock.customer.upsert.mockResolvedValueOnce({
      id: "c-existing",
      wbUserId: "chat:existing",
      name: "Иван",
    })
    const { syncChats } = await import("@/lib/support-sync")
    await syncChats()
    expect(prismaMock.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ customerId: "c-existing" }),
      })
    )
  })

  it("если clientName null — upsert.create.name=null и update={}", async () => {
    const { listChats } = await import("@/lib/wb-support-api")
    ;(listChats as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        chatID: "noname",
        clientName: null,
        replySign: "s4",
        lastMessage: null,
        goodCard: null,
      },
    ])
    prismaMock.customer.upsert.mockResolvedValueOnce({
      id: "c-noname",
      wbUserId: "chat:noname",
      name: null,
    })
    const { syncChats } = await import("@/lib/support-sync")
    await syncChats()
    expect(prismaMock.customer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { wbUserId: "chat:noname" },
        create: expect.objectContaining({
          wbUserId: "chat:noname",
          name: null,
        }),
        update: {},
      })
    )
  })

  it("customer.upsert вызван ДО supportTicket.create (порядок)", async () => {
    const { listChats } = await import("@/lib/wb-support-api")
    ;(listChats as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        chatID: "order",
        clientName: "X",
        replySign: "s5",
        lastMessage: null,
        goodCard: null,
      },
    ])
    const callOrder: string[] = []
    prismaMock.customer.upsert.mockImplementationOnce(async () => {
      callOrder.push("customer.upsert")
      return { id: "c-order", wbUserId: "chat:order", name: "X" }
    })
    prismaMock.supportTicket.findUnique.mockImplementationOnce(async () => {
      callOrder.push("supportTicket.findUnique")
      return null
    })
    prismaMock.supportTicket.create.mockImplementationOnce(async () => {
      callOrder.push("supportTicket.create")
      return { id: "t-order" }
    })
    const { syncChats } = await import("@/lib/support-sync")
    await syncChats()
    expect(callOrder.indexOf("customer.upsert")).toBeLessThan(
      callOrder.indexOf("supportTicket.create")
    )
  })
})
