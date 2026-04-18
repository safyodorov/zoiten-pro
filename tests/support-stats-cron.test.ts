import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

const prismaMock = {
  user: { findMany: vi.fn() },
  managerSupportStats: { upsert: vi.fn() },
  supportMessage: { findMany: vi.fn(), count: vi.fn() },
  returnDecision: { count: vi.fn() },
  appealRecord: { count: vi.fn() },
  supportTicket: { count: vi.fn(), aggregate: vi.fn() },
  $queryRawUnsafe: vi.fn(),
}
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

beforeEach(() => {
  vi.resetAllMocks()
  process.env.CRON_SECRET = "test-secret"
  // Defaults that allow computeManagerStatsForPeriod to complete without errors
  prismaMock.supportMessage.findMany.mockResolvedValue([])
  prismaMock.supportMessage.count.mockResolvedValue(0)
  prismaMock.returnDecision.count.mockResolvedValue(0)
  prismaMock.appealRecord.count.mockResolvedValue(0)
  prismaMock.$queryRawUnsafe.mockResolvedValue([{ avg_sec: null }])
  prismaMock.managerSupportStats.upsert.mockResolvedValue({})
})

afterEach(() => {
  delete process.env.CRON_SECRET
})

function createReq(secret?: string): NextRequest {
  const headers = new Headers()
  if (secret) headers.set("x-cron-secret", secret)
  return new NextRequest("http://localhost/api/cron/support-stats-refresh", { headers })
}

describe("GET /api/cron/support-stats-refresh", () => {
  it("401 без x-cron-secret", async () => {
    const { GET } = await import("@/app/api/cron/support-stats-refresh/route")
    const res = await GET(createReq())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe("Не авторизован")
  })

  it("401 при неверном x-cron-secret", async () => {
    const { GET } = await import("@/app/api/cron/support-stats-refresh/route")
    const res = await GET(createReq("wrong-secret"))
    expect(res.status).toBe(401)
  })

  it("happy path: 3 users → 3 upserts", async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: "u-1" },
      { id: "u-2" },
      { id: "u-3" },
    ])
    const { GET } = await import("@/app/api/cron/support-stats-refresh/route")
    const res = await GET(createReq("test-secret"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.usersProcessed).toBe(3)
    expect(prismaMock.managerSupportStats.upsert).toHaveBeenCalledTimes(3)
  })

  it("period = startOfMonthMsk(now) — 1-е число текущего месяца 00:00 МСК", async () => {
    vi.useFakeTimers()
    // 15 April 2026 14:00 UTC
    vi.setSystemTime(new Date("2026-04-15T14:00:00Z"))

    prismaMock.user.findMany.mockResolvedValueOnce([{ id: "u-1" }])
    const { GET } = await import("@/app/api/cron/support-stats-refresh/route")
    const res = await GET(createReq("test-secret"))
    const body = await res.json()

    // 1 April 2026 00:00 МСК (+03:00) = 31 March 2026 21:00 UTC
    expect(body.period).toBe("2026-03-31T21:00:00.000Z")
    const upsertCall = prismaMock.managerSupportStats.upsert.mock.calls[0][0]
    expect(upsertCall.where.userId_period.userId).toBe("u-1")
    expect((upsertCall.where.userId_period.period as Date).toISOString()).toBe(
      "2026-03-31T21:00:00.000Z"
    )
    expect((upsertCall.create.period as Date).toISOString()).toBe("2026-03-31T21:00:00.000Z")

    vi.useRealTimers()
  })

  it("idempotent: upsert использует @@unique ключ userId_period", async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([{ id: "u-1" }])
    const { GET } = await import("@/app/api/cron/support-stats-refresh/route")
    await GET(createReq("test-secret"))

    const call = prismaMock.managerSupportStats.upsert.mock.calls[0][0]
    expect(call.where).toHaveProperty("userId_period")
    expect(call.where.userId_period).toHaveProperty("userId")
    expect(call.where.userId_period).toHaveProperty("period")
    // update block provided — upsert для идемпотентности
    expect(call.update).toBeDefined()
    expect(call.create).toBeDefined()
  })

  it("0 users с SUPPORT → usersProcessed=0 + ok=true", async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([])
    const { GET } = await import("@/app/api/cron/support-stats-refresh/route")
    const res = await GET(createReq("test-secret"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.usersProcessed).toBe(0)
    expect(prismaMock.managerSupportStats.upsert).not.toHaveBeenCalled()
  })

  it("user findMany запрошен с фильтром isActive+SUPPORT", async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([])
    const { GET } = await import("@/app/api/cron/support-stats-refresh/route")
    await GET(createReq("test-secret"))
    const call = prismaMock.user.findMany.mock.calls[0][0]
    expect(call.where.isActive).toBe(true)
    expect(call.where.sectionRoles).toEqual({ some: { section: "SUPPORT" } })
  })

  it("один падающий user не ломает весь cron (graceful error per-user)", async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([{ id: "u-1" }, { id: "u-2" }])
    prismaMock.managerSupportStats.upsert
      .mockRejectedValueOnce(new Error("DB timeout")) // u-1 fails
      .mockResolvedValueOnce({}) // u-2 succeeds

    const { GET } = await import("@/app/api/cron/support-stats-refresh/route")
    const res = await GET(createReq("test-secret"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.usersProcessed).toBe(1)
    expect(body.usersTotal).toBe(2)
    expect(body.errors).toEqual([{ userId: "u-1", error: "DB timeout" }])
  })
})
