// lib/support-stats.ts
// Phase 13 — aggregation helpers для /support/stats и cron upsert ManagerSupportStats.
// D-01: RETURN avg response time исключён (Phase 9 не создаёт OUTBOUND SupportMessage).
// D-02: auto-replies — глобальный счётчик (authorId=null).
// D-03: top reasons — глобально (не per-product).
// D-04: totalProcessed — only outcome-actions (НЕ status changes).
// D-05: календарный квартал в date-periods.ts.
// D-08: текущий месяц — live поверх cache.

import { prisma } from "@/lib/prisma"
import { startOfMonthMsk } from "@/lib/date-periods"

export interface ProductStatRow {
  nmId: number
  name: string | null
  photoUrl: string | null
  feedbacksTotal: number
  avgRating: number | null
  feedbacksAnsweredPct: number | null
  questionsTotal: number
  returnsTotal: number
  returnsApproved: number
  returnsRejected: number
  avgResponseTimeSec: number | null
}

export interface ManagerStatFields {
  totalProcessed: number
  feedbacksAnswered: number
  questionsAnswered: number
  chatsAnswered: number
  returnsDecided: number
  returnsApproved: number
  returnsRejected: number
  appealsResolved: number
  avgResponseTimeSec: number | null
}

export interface ManagerStatRow extends ManagerStatFields {
  userId: string
  name: string | null
  isLive: boolean
}

// ── Helper: avg response time per ticket filter ──────────────────
async function computeAvgResponseTimeSecForTickets(
  ticketFilter: { dateFrom: Date; dateTo: Date; nmId?: number; userId?: string }
): Promise<number | null> {
  const { dateFrom, dateTo, nmId, userId } = ticketFilter
  const nmClause = nmId ? `AND t."nmId" = ${nmId}` : ""
  const userClause = userId ? `AND fo."authorId" = '${userId}'` : ""
  const rows = await prisma.$queryRawUnsafe<Array<{ avg_sec: number | null }>>(
    `
      WITH first_inbound AS (
        SELECT "ticketId", MIN("wbSentAt") AS inbound_at
        FROM "SupportMessage"
        WHERE "direction" = 'INBOUND' AND "wbSentAt" IS NOT NULL
        GROUP BY "ticketId"
      ),
      first_outbound AS (
        SELECT "ticketId", "authorId", MIN("wbSentAt") AS outbound_at
        FROM "SupportMessage"
        WHERE "direction" = 'OUTBOUND' AND "isAutoReply" = false AND "wbSentAt" IS NOT NULL
        GROUP BY "ticketId", "authorId"
      )
      SELECT AVG(EXTRACT(EPOCH FROM (fo.outbound_at - fi.inbound_at)))::int AS avg_sec
      FROM "SupportTicket" t
      JOIN first_inbound fi ON fi."ticketId" = t.id
      JOIN first_outbound fo ON fo."ticketId" = t.id
      WHERE t."createdAt" >= $1 AND t."createdAt" <= $2
        AND fo.outbound_at > fi.inbound_at
        ${nmClause} ${userClause}
    `,
    dateFrom,
    dateTo
  )
  return rows[0]?.avg_sec ?? null
}

// ── SUP-37: Product stats ────────────────────────────────────────
export async function computeProductStats(
  nmId: number,
  dateFrom: Date,
  dateTo: Date
): Promise<ProductStatRow> {
  const where = { nmId, createdAt: { gte: dateFrom, lte: dateTo } }

  const [
    feedbacksTotal,
    feedbacksAnswered,
    avgRatingAgg,
    questionsTotal,
    returnsTotal,
    returnsApproved,
    returnsRejected,
    avgResponseTimeSec,
  ] = await Promise.all([
    prisma.supportTicket.count({ where: { ...where, channel: "FEEDBACK" } }),
    prisma.supportTicket.count({
      where: { ...where, channel: "FEEDBACK", status: { in: ["ANSWERED", "CLOSED", "APPEALED"] } },
    }),
    prisma.supportTicket.aggregate({
      where: { ...where, channel: "FEEDBACK", rating: { not: null } },
      _avg: { rating: true },
    }),
    prisma.supportTicket.count({ where: { ...where, channel: "QUESTION" } }),
    prisma.supportTicket.count({ where: { ...where, channel: "RETURN" } }),
    prisma.supportTicket.count({ where: { ...where, channel: "RETURN", returnState: "APPROVED" } }),
    prisma.supportTicket.count({ where: { ...where, channel: "RETURN", returnState: "REJECTED" } }),
    computeAvgResponseTimeSecForTickets({ dateFrom, dateTo, nmId }),
  ])

  return {
    nmId,
    name: null,
    photoUrl: null,
    feedbacksTotal,
    avgRating: avgRatingAgg._avg.rating,
    feedbacksAnsweredPct:
      feedbacksTotal > 0 ? Math.round((feedbacksAnswered / feedbacksTotal) * 100) : null,
    questionsTotal,
    returnsTotal,
    returnsApproved,
    returnsRejected,
    avgResponseTimeSec,
  }
}

export async function listProductsWithStats(
  dateFrom: Date,
  dateTo: Date,
  filters: { nmIds?: number[] } = {}
): Promise<ProductStatRow[]> {
  // 1. Find all distinct nmIds active in period
  const ticketNmIds = await prisma.supportTicket.findMany({
    where: {
      createdAt: { gte: dateFrom, lte: dateTo },
      nmId: { not: null, ...(filters.nmIds ? { in: filters.nmIds } : {}) },
    },
    select: { nmId: true },
    distinct: ["nmId"],
  })
  const nmIds = ticketNmIds.map((t) => t.nmId!).filter(Boolean)
  if (nmIds.length === 0) return []

  // 2. Compute stats per nmId (parallel)
  const stats = await Promise.all(nmIds.map((id) => computeProductStats(id, dateFrom, dateTo)))

  // 3. Enrich with WbCard
  const cards = await prisma.wbCard.findMany({
    where: { nmId: { in: nmIds } },
    select: { nmId: true, name: true, photoUrl: true },
  })
  const cardMap = new Map(cards.map((c) => [c.nmId, c]))

  return stats.map((s) => ({
    ...s,
    name: cardMap.get(s.nmId)?.name ?? null,
    photoUrl: cardMap.get(s.nmId)?.photoUrl ?? null,
  }))
}

// ── SUP-38: Manager stats (D-04 outcome-actions only) ────────────
export async function computeManagerStatsForPeriod(
  userId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<ManagerStatFields> {
  // 1. OUTBOUND replies per channel (authorId=userId, isAutoReply=false)
  const messageGroups = await prisma.supportMessage.findMany({
    where: {
      authorId: userId,
      direction: "OUTBOUND",
      isAutoReply: false,
      wbSentAt: { gte: dateFrom, lte: dateTo },
    },
    select: { ticket: { select: { channel: true } } },
  })
  const counts = { feedbacksAnswered: 0, questionsAnswered: 0, chatsAnswered: 0 }
  for (const m of messageGroups) {
    if (m.ticket.channel === "FEEDBACK") counts.feedbacksAnswered++
    else if (m.ticket.channel === "QUESTION") counts.questionsAnswered++
    else if (m.ticket.channel === "CHAT") counts.chatsAnswered++
  }

  // 2. Return decisions per action type
  const [returnsDecided, returnsApproved, returnsRejected] = await Promise.all([
    prisma.returnDecision.count({
      where: { decidedById: userId, decidedAt: { gte: dateFrom, lte: dateTo } },
    }),
    prisma.returnDecision.count({
      where: {
        decidedById: userId,
        decidedAt: { gte: dateFrom, lte: dateTo },
        action: { in: ["APPROVE", "RECONSIDER"] },
      },
    }),
    prisma.returnDecision.count({
      where: {
        decidedById: userId,
        decidedAt: { gte: dateFrom, lte: dateTo },
        action: "REJECT",
      },
    }),
  ])

  // 3. Appeal decisions
  const appealsResolved = await prisma.appealRecord.count({
    where: {
      resolvedById: userId,
      appealResolvedAt: { gte: dateFrom, lte: dateTo },
    },
  })

  // 4. Avg response time for this manager's OUTBOUND
  const avgResponseTimeSec = await computeAvgResponseTimeSecForTickets({ dateFrom, dateTo, userId })

  const totalProcessed =
    counts.feedbacksAnswered +
    counts.questionsAnswered +
    counts.chatsAnswered +
    returnsDecided +
    appealsResolved

  return {
    totalProcessed,
    ...counts,
    returnsDecided,
    returnsApproved,
    returnsRejected,
    appealsResolved,
    avgResponseTimeSec,
  }
}

export async function listManagersWithStats(
  dateFrom: Date,
  dateTo: Date
): Promise<ManagerStatRow[]> {
  // Users with SUPPORT section role
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      sectionRoles: { some: { section: "SUPPORT" } },
    },
    select: { id: true, name: true, firstName: true, lastName: true },
  })
  if (users.length === 0) return []

  const currentMonthStart = startOfMonthMsk(new Date())
  const isLive = dateTo >= currentMonthStart

  const rows = await Promise.all(
    users.map(async (u) => {
      const stats = await computeManagerStatsForPeriod(u.id, dateFrom, dateTo)
      const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.name || null
      return { userId: u.id, name, isLive, ...stats }
    })
  )
  return rows
}

// ── SUP-37 extra: top return reasons (D-03 глобально) ────────────
export async function getTopReturnReasons(
  dateFrom: Date,
  dateTo: Date,
  limit: number = 10
): Promise<Array<{ reason: string; count: number }>> {
  const rows = await prisma.$queryRawUnsafe<Array<{ reason: string; cnt: bigint | number }>>(
    `
      SELECT rd.reason, COUNT(*)::int AS cnt
      FROM "ReturnDecision" rd
      WHERE rd."action" = 'REJECT'
        AND rd.reason IS NOT NULL
        AND rd."decidedAt" >= $1 AND rd."decidedAt" <= $2
      GROUP BY rd.reason
      ORDER BY cnt DESC
      LIMIT $3
    `,
    dateFrom,
    dateTo,
    limit
  )
  return rows.map((r) => ({ reason: r.reason, count: Number(r.cnt) }))
}

// ── SUP-38 extra: auto reply count (D-02 глобально) ──────────────
export async function getAutoReplyCount(dateFrom: Date, dateTo: Date): Promise<number> {
  return prisma.supportMessage.count({
    where: {
      isAutoReply: true,
      wbSentAt: { gte: dateFrom, lte: dateTo },
    },
  })
}
