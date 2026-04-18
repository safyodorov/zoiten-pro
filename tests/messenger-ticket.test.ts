import { describe, it, expect, vi, beforeEach } from "vitest"

// Phase 12 Plan 01 — unit тесты createManualMessengerTicket.
// Happy path + Zod валидация + транзакция (Customer + Ticket + INBOUND Message).

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/rbac", () => ({
  requireSection: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}))

const prismaMock = {
  customer: { create: vi.fn() },
  supportTicket: { create: vi.fn() },
  supportMessage: { create: vi.fn() },
  $transaction: vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: unknown) => unknown)(prismaMock)
    }
    if (Array.isArray(arg)) return Promise.all(arg)
    return arg
  }),
}
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

beforeEach(() => {
  vi.resetAllMocks()
  prismaMock.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: unknown) => unknown)(prismaMock)
    }
    if (Array.isArray(arg)) return Promise.all(arg)
    return arg
  })
})

describe("createManualMessengerTicket", () => {
  it("создаёт Customer + Ticket + INBOUND Message в одной транзакции", async () => {
    prismaMock.customer.create.mockResolvedValueOnce({ id: "c-new" })
    prismaMock.supportTicket.create.mockResolvedValueOnce({ id: "t-new" })
    prismaMock.supportMessage.create.mockResolvedValueOnce({})
    const { createManualMessengerTicket } = await import(
      "@/app/actions/support"
    )
    const res = await createManualMessengerTicket({
      messengerType: "TELEGRAM",
      customerId: null,
      customerName: "Иван П",
      messengerContact: "@ivanp",
      text: "Здравствуйте, проблема с заказом",
      nmId: null,
    })
    expect(res).toEqual({ ok: true, ticketId: "t-new" })
    expect(prismaMock.customer.create).toHaveBeenCalled()
    expect(prismaMock.supportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channel: "MESSENGER",
          messengerType: "TELEGRAM",
          messengerContact: "@ivanp",
          customerId: "c-new",
        }),
      })
    )
    expect(prismaMock.supportMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticketId: "t-new",
          direction: "INBOUND",
          text: "Здравствуйте, проблема с заказом",
        }),
      })
    )
  })

  it("при customerId existing — НЕ создаёт нового Customer", async () => {
    prismaMock.supportTicket.create.mockResolvedValueOnce({ id: "t-new" })
    prismaMock.supportMessage.create.mockResolvedValueOnce({})
    const { createManualMessengerTicket } = await import(
      "@/app/actions/support"
    )
    const res = await createManualMessengerTicket({
      messengerType: "WHATSAPP",
      customerId: "c-existing",
      customerName: null,
      messengerContact: "+79991234567",
      text: "Обращение от существующего клиента",
      nmId: 12345,
    })
    expect(res.ok).toBe(true)
    expect(prismaMock.customer.create).not.toHaveBeenCalled()
    expect(prismaMock.supportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: "c-existing",
          nmId: 12345,
        }),
      })
    )
  })

  it("Zod отклоняет messengerContact < 3 символов", async () => {
    const { createManualMessengerTicket } = await import(
      "@/app/actions/support"
    )
    const res = await createManualMessengerTicket({
      messengerType: "TELEGRAM",
      customerId: null,
      customerName: "Иван",
      messengerContact: "ab",
      text: "Hi",
      nmId: null,
    })
    expect(res.ok).toBe(false)
  })

  it("Zod отклоняет пустой text", async () => {
    const { createManualMessengerTicket } = await import(
      "@/app/actions/support"
    )
    const res = await createManualMessengerTicket({
      messengerType: "TELEGRAM",
      customerId: null,
      customerName: "Иван",
      messengerContact: "@ivan",
      text: "",
      nmId: null,
    })
    expect(res.ok).toBe(false)
  })

  it("Zod отклоняет customerId=null И customerName=null одновременно", async () => {
    const { createManualMessengerTicket } = await import(
      "@/app/actions/support"
    )
    const res = await createManualMessengerTicket({
      messengerType: "OTHER",
      customerId: null,
      customerName: null,
      messengerContact: "@anon",
      text: "Hi",
      nmId: null,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("покупателя")
  })

  it("при customerId existing и nmId — корректно прокидывает nmId", async () => {
    prismaMock.supportTicket.create.mockResolvedValueOnce({
      id: "t-with-card",
    })
    prismaMock.supportMessage.create.mockResolvedValueOnce({})
    const { createManualMessengerTicket } = await import(
      "@/app/actions/support"
    )
    await createManualMessengerTicket({
      messengerType: "WHATSAPP",
      customerId: "c-1",
      customerName: null,
      messengerContact: "+79991234567",
      text: "Вопрос по товару",
      nmId: 99999,
    })
    expect(prismaMock.supportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ nmId: 99999 }),
      })
    )
  })
})
