import { describe, it, expect, vi, beforeEach } from "vitest"

// Phase 12 Plan 01 — unit тесты server actions:
// linkTicketToCustomer, createCustomerForTicket, updateCustomerNote.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/rbac", () => ({
  requireSection: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}))

const prismaMock = {
  customer: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  supportTicket: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
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

describe("linkTicketToCustomer", () => {
  it("happy path — обновляет ticket.customerId", async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValueOnce({
      id: "t1",
      channel: "FEEDBACK",
    })
    prismaMock.customer.findUnique.mockResolvedValueOnce({ id: "c1" })
    prismaMock.supportTicket.update.mockResolvedValueOnce({})
    const { linkTicketToCustomer } = await import("@/app/actions/support")
    const res = await linkTicketToCustomer("t1", "c1")
    expect(res).toEqual({ ok: true })
    expect(prismaMock.supportTicket.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { customerId: "c1" },
    })
  })

  it("отклоняет CHAT канал (auto-linked)", async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValueOnce({
      id: "t1",
      channel: "CHAT",
    })
    const { linkTicketToCustomer } = await import("@/app/actions/support")
    const res = await linkTicketToCustomer("t1", "c1")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("автоматически")
  })

  it("ticket не найден → error", async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValueOnce(null)
    const { linkTicketToCustomer } = await import("@/app/actions/support")
    const res = await linkTicketToCustomer("t1", "c1")
    expect(res).toEqual({ ok: false, error: "Тикет не найден" })
  })

  it("customer не найден → error", async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValueOnce({
      id: "t1",
      channel: "FEEDBACK",
    })
    prismaMock.customer.findUnique.mockResolvedValueOnce(null)
    const { linkTicketToCustomer } = await import("@/app/actions/support")
    const res = await linkTicketToCustomer("t1", "c1")
    expect(res).toEqual({ ok: false, error: "Покупатель не найден" })
  })
})

describe("createCustomerForTicket", () => {
  it("создаёт Customer и линкует тикет в transaction", async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValueOnce({
      id: "t1",
      channel: "FEEDBACK",
    })
    prismaMock.customer.create.mockResolvedValueOnce({ id: "c-new" })
    prismaMock.supportTicket.update.mockResolvedValueOnce({})
    const { createCustomerForTicket } = await import("@/app/actions/support")
    const res = await createCustomerForTicket("t1", {
      name: "Иван",
      phone: "+79991234567",
    })
    expect(res).toEqual({ ok: true, customerId: "c-new" })
    expect(prismaMock.customer.create).toHaveBeenCalledWith({
      data: { name: "Иван", phone: "+79991234567" },
    })
  })

  it("Zod отклоняет невалидный phone", async () => {
    const { createCustomerForTicket } = await import("@/app/actions/support")
    const res = await createCustomerForTicket("t1", {
      name: "Иван",
      phone: "INVALID!!!",
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("телефон")
  })

  it("Zod отклоняет пустое имя", async () => {
    const { createCustomerForTicket } = await import("@/app/actions/support")
    const res = await createCustomerForTicket("t1", { name: "" })
    expect(res.ok).toBe(false)
  })

  it("отклоняет CHAT канал (auto-linked)", async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValueOnce({
      id: "t1",
      channel: "CHAT",
    })
    const { createCustomerForTicket } = await import("@/app/actions/support")
    const res = await createCustomerForTicket("t1", { name: "Иван" })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("автоматически")
  })
})

describe("updateCustomerNote", () => {
  it("успешно обновляет note", async () => {
    prismaMock.customer.update.mockResolvedValueOnce({})
    const { updateCustomerNote } = await import("@/app/actions/support")
    const res = await updateCustomerNote(
      "c1",
      "Постоянный клиент, любит возвраты"
    )
    expect(res).toEqual({ ok: true })
    expect(prismaMock.customer.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { note: "Постоянный клиент, любит возвраты" },
    })
  })

  it("Zod отклоняет note > 5000 символов", async () => {
    const { updateCustomerNote } = await import("@/app/actions/support")
    const res = await updateCustomerNote("c1", "x".repeat(5001))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("5000")
  })

  it("P2025 → Покупатель не найден", async () => {
    prismaMock.customer.update.mockRejectedValueOnce(
      new Error("Record to update not found (P2025)")
    )
    const { updateCustomerNote } = await import("@/app/actions/support")
    const res = await updateCustomerNote("ghost", "note")
    expect(res).toEqual({ ok: false, error: "Покупатель не найден" })
  })
})
