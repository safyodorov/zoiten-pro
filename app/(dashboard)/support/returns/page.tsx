// app/(dashboard)/support/returns/page.tsx
// Phase 9 Plan 03: RSC-страница — таблица заявок на возврат WB (channel=RETURN).
// Preload: WbCard (photoUrl+name), latest ReturnDecision per ticket (distinct on),
// media первого INBOUND сообщения (фото брака). Фильтры через searchParams.
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { ReturnsTable } from "@/components/support/ReturnsTable"
import { ReturnsFilters } from "@/components/support/ReturnsFilters"
import { SupportPagination } from "@/components/support/SupportPagination"
import { SupportSyncButton } from "@/components/support/SupportSyncButton"
import type { ReturnState, Prisma } from "@prisma/client"

const PAGE_SIZE = 20

interface PageSearchParams {
  page?: string
  returnStates?: string // CSV "PENDING,REJECTED"
  nmId?: string
  assignees?: string // CSV user ids
  dateFrom?: string
  dateTo?: string
  reconsideredOnly?: string // "1" | undefined
}

const VALID_STATES: ReturnState[] = ["PENDING", "APPROVED", "REJECTED"]

function parseSearchParams(sp: PageSearchParams) {
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1)
  const returnStates = (sp.returnStates?.split(",").filter(Boolean) ?? []).filter(
    (v): v is ReturnState => VALID_STATES.includes(v as ReturnState)
  )
  const nmIdRaw = sp.nmId ? parseInt(sp.nmId, 10) : NaN
  const nmId = Number.isFinite(nmIdRaw) ? nmIdRaw : undefined
  const assignees = sp.assignees?.split(",").filter(Boolean) ?? []
  const dateFrom = sp.dateFrom ? new Date(sp.dateFrom) : undefined
  const dateTo = sp.dateTo ? new Date(`${sp.dateTo}T23:59:59`) : undefined
  const reconsideredOnly = sp.reconsideredOnly === "1"
  return { page, returnStates, nmId, assignees, dateFrom, dateTo, reconsideredOnly }
}

function buildWhere(
  f: ReturnType<typeof parseSearchParams>
): Prisma.SupportTicketWhereInput {
  const where: Prisma.SupportTicketWhereInput = { channel: "RETURN" }
  if (f.returnStates.length) where.returnState = { in: f.returnStates }
  if (f.nmId !== undefined) where.nmId = f.nmId
  if (f.assignees.length) where.assignedToId = { in: f.assignees }
  if (f.dateFrom || f.dateTo) {
    where.createdAt = {
      ...(f.dateFrom ? { gte: f.dateFrom } : {}),
      ...(f.dateTo ? { lte: f.dateTo } : {}),
    }
  }
  if (f.reconsideredOnly) {
    where.returnDecisions = { some: { reconsidered: true } }
  }
  return where
}

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>
}) {
  await requireSection("SUPPORT")
  const sp = await searchParams
  const filters = parseSearchParams(sp)
  const where = buildWhere(filters)

  const [total, tickets, supportUsers] = await Promise.all([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({
      where,
      // Сортировка: свежие заявки сверху по дате подачи на WB
      orderBy: [
        { lastMessageAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        messages: {
          where: { direction: "INBOUND" },
          orderBy: { sentAt: "asc" },
          take: 1,
          include: { media: { where: { type: "IMAGE" }, take: 3 } },
        },
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, name: true },
        },
      },
    }),
    prisma.user.findMany({
      where: { isActive: true, sectionRoles: { some: { section: "SUPPORT" } } },
      select: { id: true, firstName: true, lastName: true, name: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
  ])

  // Preload latest ReturnDecision per ticket (distinct on ticketId)
  const ticketIds = tickets.map((t) => t.id)
  const latestDecisions =
    ticketIds.length > 0
      ? await prisma.returnDecision.findMany({
          where: { ticketId: { in: ticketIds } },
          orderBy: [{ ticketId: "asc" }, { decidedAt: "desc" }],
          distinct: ["ticketId"],
          include: {
            decidedBy: {
              select: { id: true, firstName: true, lastName: true, name: true },
            },
          },
        })
      : []
  const decisionByTicket = Object.fromEntries(
    latestDecisions.map((d) => [d.ticketId, d])
  )

  // Preload WbCard фото + название (photoUrl ОБЯЗАТЕЛЬНО для колонки «Товар»)
  const nmIds = Array.from(
    new Set(
      tickets.map((t) => t.nmId).filter((n): n is number => typeof n === "number")
    )
  )
  const wbCards =
    nmIds.length > 0
      ? await prisma.wbCard.findMany({
          where: { nmId: { in: nmIds } },
          select: { nmId: true, name: true, photoUrl: true },
        })
      : []
  const cardByNm = Object.fromEntries(wbCards.map((c) => [c.nmId, c]))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Возвраты</h1>
        <SupportSyncButton />
      </div>

      <ReturnsFilters supportUsers={supportUsers} />

      {total === 0 ? (
        <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">
          Заявок на возврат пока нет. Нажмите «Синхронизировать» в шапке.
        </div>
      ) : (
        <>
          <ReturnsTable
            tickets={tickets}
            decisionByTicket={decisionByTicket}
            cardByNm={cardByNm}
          />
          <SupportPagination
            page={filters.page}
            pageSize={PAGE_SIZE}
            total={total}
          />
        </>
      )}
    </div>
  )
}
