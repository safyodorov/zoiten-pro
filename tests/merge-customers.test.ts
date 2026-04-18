import { describe, it, expect, vi, beforeEach } from "vitest"

// Phase 12 Plan 01 — unit тесты mergeCustomers.
// Happy path + self-merge reject + not-found rollback.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/rbac", () => ({
  requireSection: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}))

const prismaMock = {
  customer: { findUnique: vi.fn(), delete: vi.fn() },
  supportTicket: { updateMany: vi.fn() },
  $transaction: vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: unknown) => unknown)(prismaMock)
    }
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
    return arg
  })
})

describe("mergeCustomers", () => {
  it("happy path: updateMany tickets + delete source + возвращает ticketsMoved", async () => {
    prismaMock.customer.findUnique
      .mockResolvedValueOnce({ id: "src" })
      .mockResolvedValueOnce({ id: "tgt" })
    prismaMock.supportTicket.updateMany.mockResolvedValueOnce({ count: 5 })
    prismaMock.customer.delete.mockResolvedValueOnce({})
    const { mergeCustomers } = await import("@/app/actions/support")
    const res = await mergeCustomers({ sourceId: "src", targetId: "tgt" })
    expect(res).toEqual({ ok: true, ticketsMoved: 5 })
    expect(prismaMock.supportTicket.updateMany).toHaveBeenCalledWith({
      where: { customerId: "src" },
      data: { customerId: "tgt" },
    })
    expect(prismaMock.customer.delete).toHaveBeenCalledWith({
      where: { id: "src" },
    })
  })

  it("Zod отклоняет sourceId===targetId (self-merge)", async () => {
    const { mergeCustomers } = await import("@/app/actions/support")
    const res = await mergeCustomers({ sourceId: "same", targetId: "same" })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("самим собой")
  })

  it("source не найден → rollback (delete/updateMany НЕ вызваны)", async () => {
    prismaMock.customer.findUnique.mockResolvedValueOnce(null)
    const { mergeCustomers } = await import("@/app/actions/support")
    const res = await mergeCustomers({ sourceId: "ghost", targetId: "tgt" })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("Исходный")
    expect(prismaMock.supportTicket.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.customer.delete).not.toHaveBeenCalled()
  })

  it("target не найден → rollback", async () => {
    prismaMock.customer.findUnique
      .mockResolvedValueOnce({ id: "src" })
      .mockResolvedValueOnce(null)
    const { mergeCustomers } = await import("@/app/actions/support")
    const res = await mergeCustomers({ sourceId: "src", targetId: "ghost" })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("Целевой")
    expect(prismaMock.customer.delete).not.toHaveBeenCalled()
  })

  it("Zod отклоняет пустые sourceId/targetId", async () => {
    const { mergeCustomers } = await import("@/app/actions/support")
    const res = await mergeCustomers({ sourceId: "", targetId: "tgt" })
    expect(res.ok).toBe(false)
  })

  it("ticketsMoved = 0 если у source не было тикетов", async () => {
    prismaMock.customer.findUnique
      .mockResolvedValueOnce({ id: "src" })
      .mockResolvedValueOnce({ id: "tgt" })
    prismaMock.supportTicket.updateMany.mockResolvedValueOnce({ count: 0 })
    prismaMock.customer.delete.mockResolvedValueOnce({})
    const { mergeCustomers } = await import("@/app/actions/support")
    const res = await mergeCustomers({ sourceId: "src", targetId: "tgt" })
    expect(res).toEqual({ ok: true, ticketsMoved: 0 })
  })
})
