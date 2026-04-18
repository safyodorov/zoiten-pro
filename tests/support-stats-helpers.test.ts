import { describe, it, expect, vi, beforeEach } from "vitest"

const prismaMock = {
  supportTicket: {
    count: vi.fn(),
    aggregate: vi.fn(),
    findMany: vi.fn(),
  },
  supportMessage: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  returnDecision: {
    count: vi.fn(),
  },
  appealRecord: {
    count: vi.fn(),
  },
  user: { findMany: vi.fn() },
  wbCard: { findMany: vi.fn() },
  $queryRawUnsafe: vi.fn(),
}
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

beforeEach(() => {
  vi.resetAllMocks()
})

const DF = new Date("2026-04-01T00:00:00Z")
const DT = new Date("2026-04-30T23:59:59Z")

describe("computeProductStats", () => {
  it("happy path — 5 feedbacks, 3 answered, avg 4.2, 2 returns (1 approved, 1 rejected)", async () => {
    prismaMock.supportTicket.count
      .mockResolvedValueOnce(5) // feedbacksTotal
      .mockResolvedValueOnce(3) // feedbacksAnswered
      .mockResolvedValueOnce(2) // questionsTotal
      .mockResolvedValueOnce(2) // returnsTotal
      .mockResolvedValueOnce(1) // returnsApproved
      .mockResolvedValueOnce(1) // returnsRejected
    prismaMock.supportTicket.aggregate.mockResolvedValueOnce({ _avg: { rating: 4.2 } })
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([{ avg_sec: 3600 }])

    const { computeProductStats } = await import("@/lib/support-stats")
    const r = await computeProductStats(12345, DF, DT)

    expect(r.nmId).toBe(12345)
    expect(r.feedbacksTotal).toBe(5)
    expect(r.feedbacksAnsweredPct).toBe(60) // 3/5
    expect(r.avgRating).toBe(4.2)
    expect(r.questionsTotal).toBe(2)
    expect(r.returnsTotal).toBe(2)
    expect(r.returnsApproved).toBe(1)
    expect(r.returnsRejected).toBe(1)
    expect(r.avgResponseTimeSec).toBe(3600)
  })

  it("feedbacksAnsweredPct = null если 0 feedbacks", async () => {
    prismaMock.supportTicket.count.mockResolvedValue(0)
    prismaMock.supportTicket.aggregate.mockResolvedValueOnce({ _avg: { rating: null } })
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([{ avg_sec: null }])
    const { computeProductStats } = await import("@/lib/support-stats")
    const r = await computeProductStats(1, DF, DT)
    expect(r.feedbacksAnsweredPct).toBeNull()
  })

  it("avgResponseTimeSec = null если нет ответов", async () => {
    prismaMock.supportTicket.count.mockResolvedValue(0)
    prismaMock.supportTicket.aggregate.mockResolvedValueOnce({ _avg: { rating: null } })
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([{ avg_sec: null }])
    const { computeProductStats } = await import("@/lib/support-stats")
    const r = await computeProductStats(1, DF, DT)
    expect(r.avgResponseTimeSec).toBeNull()
  })
})

describe("computeManagerStatsForPeriod (D-04 outcome-actions only)", () => {
  it("happy path — 2 FEEDBACK + 1 QUESTION + 1 CHAT replies + 3 returns + 1 appeal", async () => {
    prismaMock.supportMessage.findMany.mockResolvedValueOnce([
      { ticket: { channel: "FEEDBACK" } },
      { ticket: { channel: "FEEDBACK" } },
      { ticket: { channel: "QUESTION" } },
      { ticket: { channel: "CHAT" } },
    ])
    prismaMock.returnDecision.count
      .mockResolvedValueOnce(3) // returnsDecided
      .mockResolvedValueOnce(2) // returnsApproved
      .mockResolvedValueOnce(1) // returnsRejected
    prismaMock.appealRecord.count.mockResolvedValueOnce(1)
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([{ avg_sec: 1200 }])

    const { computeManagerStatsForPeriod } = await import("@/lib/support-stats")
    const r = await computeManagerStatsForPeriod("u-1", DF, DT)

    expect(r.feedbacksAnswered).toBe(2)
    expect(r.questionsAnswered).toBe(1)
    expect(r.chatsAnswered).toBe(1)
    expect(r.returnsDecided).toBe(3)
    expect(r.returnsApproved).toBe(2)
    expect(r.returnsRejected).toBe(1)
    expect(r.appealsResolved).toBe(1)
    expect(r.avgResponseTimeSec).toBe(1200)
  })

  it("totalProcessed = feedbacks + questions + chats + returnsDecided + appealsResolved (D-04)", async () => {
    prismaMock.supportMessage.findMany.mockResolvedValueOnce([
      { ticket: { channel: "FEEDBACK" } },
      { ticket: { channel: "QUESTION" } },
      { ticket: { channel: "CHAT" } },
    ])
    prismaMock.returnDecision.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0)
    prismaMock.appealRecord.count.mockResolvedValueOnce(1)
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([{ avg_sec: null }])

    const { computeManagerStatsForPeriod } = await import("@/lib/support-stats")
    const r = await computeManagerStatsForPeriod("u-1", DF, DT)
    // 1 (F) + 1 (Q) + 1 (C) + 2 (returns) + 1 (appeal) = 6
    expect(r.totalProcessed).toBe(6)
  })

  it("avgResponseTimeSec = null если нет ответов менеджера", async () => {
    prismaMock.supportMessage.findMany.mockResolvedValueOnce([])
    prismaMock.returnDecision.count.mockResolvedValue(0)
    prismaMock.appealRecord.count.mockResolvedValueOnce(0)
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([{ avg_sec: null }])

    const { computeManagerStatsForPeriod } = await import("@/lib/support-stats")
    const r = await computeManagerStatsForPeriod("u-1", DF, DT)
    expect(r.avgResponseTimeSec).toBeNull()
    expect(r.totalProcessed).toBe(0)
  })

  it("returnsApproved включает и APPROVE, и RECONSIDER (для расчёта % одобрения)", async () => {
    prismaMock.supportMessage.findMany.mockResolvedValueOnce([])
    prismaMock.returnDecision.count
      .mockResolvedValueOnce(5) // total decided (APPROVE+REJECT+RECONSIDER)
      .mockResolvedValueOnce(3) // approved (APPROVE+RECONSIDER) ← WHERE action IN (APPROVE, RECONSIDER)
      .mockResolvedValueOnce(2) // rejected
    prismaMock.appealRecord.count.mockResolvedValueOnce(0)
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([{ avg_sec: null }])

    const { computeManagerStatsForPeriod } = await import("@/lib/support-stats")
    const r = await computeManagerStatsForPeriod("u-1", DF, DT)
    expect(r.returnsDecided).toBe(5)
    expect(r.returnsApproved).toBe(3)
    // Проверяем что 2-й вызов count использовал action IN (APPROVE, RECONSIDER)
    const call2 = prismaMock.returnDecision.count.mock.calls[1][0]
    expect(call2.where.action).toEqual({ in: ["APPROVE", "RECONSIDER"] })
  })
})

describe("listProductsWithStats", () => {
  it("JOIN WbCard — возвращает name и photoUrl", async () => {
    prismaMock.supportTicket.findMany.mockResolvedValueOnce([{ nmId: 100 }, { nmId: 200 }])
    // per-nmId stats calls
    prismaMock.supportTicket.count.mockResolvedValue(0)
    prismaMock.supportTicket.aggregate.mockResolvedValue({ _avg: { rating: null } })
    prismaMock.$queryRawUnsafe.mockResolvedValue([{ avg_sec: null }])
    prismaMock.wbCard.findMany.mockResolvedValueOnce([
      { nmId: 100, name: "Товар A", photoUrl: "/a.jpg" },
      { nmId: 200, name: "Товар B", photoUrl: "/b.jpg" },
    ])

    const { listProductsWithStats } = await import("@/lib/support-stats")
    const r = await listProductsWithStats(DF, DT)

    expect(r).toHaveLength(2)
    const byId = Object.fromEntries(r.map((x) => [x.nmId, x]))
    expect(byId[100].name).toBe("Товар A")
    expect(byId[100].photoUrl).toBe("/a.jpg")
    expect(byId[200].name).toBe("Товар B")
  })

  it("пустой список если нет тикетов в периоде", async () => {
    prismaMock.supportTicket.findMany.mockResolvedValueOnce([])
    const { listProductsWithStats } = await import("@/lib/support-stats")
    const r = await listProductsWithStats(DF, DT)
    expect(r).toEqual([])
  })

  it("применяет filter nmIds если передан", async () => {
    prismaMock.supportTicket.findMany.mockResolvedValueOnce([])
    const { listProductsWithStats } = await import("@/lib/support-stats")
    await listProductsWithStats(DF, DT, { nmIds: [100, 200] })
    const call = prismaMock.supportTicket.findMany.mock.calls[0][0]
    expect(call.where.nmId).toEqual({ not: null, in: [100, 200] })
  })
})

describe("listManagersWithStats", () => {
  it("фильтрует пользователей по sectionRoles SUPPORT + isActive", async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([])
    const { listManagersWithStats } = await import("@/lib/support-stats")
    await listManagersWithStats(DF, DT)
    const call = prismaMock.user.findMany.mock.calls[0][0]
    expect(call.where.isActive).toBe(true)
    expect(call.where.sectionRoles).toEqual({ some: { section: "SUPPORT" } })
  })

  it("isLive=true если период включает текущий месяц", async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: "u-1", name: "Иван", firstName: "Иван", lastName: "Петров" },
    ])
    prismaMock.supportMessage.findMany.mockResolvedValueOnce([])
    prismaMock.returnDecision.count.mockResolvedValue(0)
    prismaMock.appealRecord.count.mockResolvedValue(0)
    prismaMock.$queryRawUnsafe.mockResolvedValue([{ avg_sec: null }])

    const { listManagersWithStats } = await import("@/lib/support-stats")
    const nowDt = new Date()
    const r = await listManagersWithStats(new Date(nowDt.getTime() - 7 * 86_400_000), nowDt)
    expect(r[0].isLive).toBe(true)
    expect(r[0].name).toBe("Иван Петров")
  })

  it("isLive=false для past period (dateTo < currentMonthStart)", async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: "u-1", name: "Иван", firstName: null, lastName: null },
    ])
    prismaMock.supportMessage.findMany.mockResolvedValueOnce([])
    prismaMock.returnDecision.count.mockResolvedValue(0)
    prismaMock.appealRecord.count.mockResolvedValue(0)
    prismaMock.$queryRawUnsafe.mockResolvedValue([{ avg_sec: null }])

    const { listManagersWithStats } = await import("@/lib/support-stats")
    // Past period — 2020
    const r = await listManagersWithStats(new Date("2020-01-01"), new Date("2020-01-31"))
    expect(r[0].isLive).toBe(false)
  })
})

describe("getTopReturnReasons (D-03 глобально)", () => {
  it("возвращает отсортированный список с count как number (не bigint)", async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
      { reason: "Фото не соответствует", cnt: 5n },
      { reason: "Брак не подтверждён", cnt: 3n },
    ])
    const { getTopReturnReasons } = await import("@/lib/support-stats")
    const r = await getTopReturnReasons(DF, DT, 10)
    expect(r).toEqual([
      { reason: "Фото не соответствует", count: 5 },
      { reason: "Брак не подтверждён", count: 3 },
    ])
    // $queryRawUnsafe вызвана с SQL + params
    const [sql, from, to, limit] = prismaMock.$queryRawUnsafe.mock.calls[0]
    expect(sql).toContain(`action" = 'REJECT'`)
    expect(sql).toContain("GROUP BY rd.reason")
    expect(from).toBe(DF)
    expect(to).toBe(DT)
    expect(limit).toBe(10)
  })

  it("пустой список если нет отклонённых", async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([])
    const { getTopReturnReasons } = await import("@/lib/support-stats")
    expect(await getTopReturnReasons(DF, DT)).toEqual([])
  })
})

describe("getAutoReplyCount (D-02 глобально)", () => {
  it("count SupportMessage where isAutoReply=true AND wbSentAt BETWEEN", async () => {
    prismaMock.supportMessage.count.mockResolvedValueOnce(42)
    const { getAutoReplyCount } = await import("@/lib/support-stats")
    const r = await getAutoReplyCount(DF, DT)
    expect(r).toBe(42)
    const call = prismaMock.supportMessage.count.mock.calls[0][0]
    expect(call.where.isAutoReply).toBe(true)
    expect(call.where.wbSentAt).toEqual({ gte: DF, lte: DT })
  })
})
