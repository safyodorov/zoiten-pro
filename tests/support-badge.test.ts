import { describe, it, expect, vi, beforeEach } from "vitest"

const countMock = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: { supportTicket: { count: countMock } },
}))

beforeEach(() => countMock.mockReset())

describe("getSupportBadgeCount", () => {
  it("возвращает количество тикетов со статусом NEW", async () => {
    countMock.mockResolvedValueOnce(7)
    const { getSupportBadgeCount } = await import("@/lib/support-badge")
    expect(await getSupportBadgeCount()).toBe(7)
    expect(countMock).toHaveBeenCalledWith({ where: { status: "NEW" } })
  })

  it("возвращает 0 если Prisma падает (миграция ещё не применена)", async () => {
    countMock.mockRejectedValueOnce(new Error("DB offline"))
    const { getSupportBadgeCount } = await import("@/lib/support-badge")
    expect(await getSupportBadgeCount()).toBe(0)
  })
})
