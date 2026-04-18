// app/(dashboard)/support/page.tsx
// RSC — лента тикетов службы поддержки WB
import Link from "next/link"
import { Plus } from "lucide-react"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { SupportFilters } from "@/components/support/SupportFilters"
import { SupportTicketCard } from "@/components/support/SupportTicketCard"
import { SupportPagination } from "@/components/support/SupportPagination"
import { SupportSyncButton } from "@/components/support/SupportSyncButton"
import type { TicketStatus } from "@prisma/client"

const CHANNEL_OPTIONS = [
  { value: "FEEDBACK", label: "Отзывы" },
  { value: "QUESTION", label: "Вопросы" },
  { value: "CHAT", label: "Чаты" },
  { value: "RETURN", label: "Возвраты" },
  { value: "MESSENGER", label: "Мессенджер" },
]

const STATUS_OPTIONS = [
  { value: "NEW", label: "Новый" },
  { value: "IN_PROGRESS", label: "В работе" },
  { value: "ANSWERED", label: "Отвечен" },
  { value: "CLOSED", label: "Закрыт" },
  { value: "APPEALED", label: "Обжалование" },
]

function parseList<T extends string>(
  sp: string | string[] | undefined,
  valid: readonly T[]
): T[] {
  if (!sp) return []
  const raw = Array.isArray(sp) ? sp.join(",") : sp
  return raw.split(",").filter((v): v is T => valid.includes(v as T))
}

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireSection("SUPPORT")
  const sp = await searchParams

  const channels = parseList(sp.channels, [
    "FEEDBACK",
    "QUESTION",
    "CHAT",
    "RETURN",
    "MESSENGER",
  ] as const)
  const statuses = parseList(sp.statuses, [
    "NEW",
    "IN_PROGRESS",
    "ANSWERED",
    "CLOSED",
    "APPEALED",
  ] as const)
  const assignees = (Array.isArray(sp.assignees)
    ? sp.assignees.join(",")
    : (sp.assignees ?? "")
  )
    .split(",")
    .filter(Boolean)
  const nmIdRaw = sp.nmId
    ? Number(Array.isArray(sp.nmId) ? sp.nmId[0] : sp.nmId)
    : null
  const nmId = nmIdRaw && !Number.isNaN(nmIdRaw) ? nmIdRaw : null
  const dateFrom =
    (Array.isArray(sp.dateFrom) ? sp.dateFrom[0] : sp.dateFrom) || null
  const dateTo =
    (Array.isArray(sp.dateTo) ? sp.dateTo[0] : sp.dateTo) || null
  const unansweredOnly = sp.unanswered === "1"
  const page = Math.max(
    1,
    Number(Array.isArray(sp.page) ? sp.page[0] : sp.page ?? 1)
  )
  const pageSize = 20

  const supportUsers = await prisma.user.findMany({
    where: {
      isActive: true,
      sectionRoles: { some: { section: "SUPPORT" } },
    },
    select: { id: true, name: true, firstName: true, lastName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  })
  const assigneeOptions = supportUsers.map((u) => ({
    value: u.id,
    label:
      [u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
      u.name ||
      u.id.slice(-6),
  }))

  const where: Record<string, unknown> = {}
  if (channels.length) where.channel = { in: channels }
  if (statuses.length) {
    where.status = { in: statuses }
  } else if (unansweredOnly) {
    where.status = { in: ["NEW", "IN_PROGRESS"] as TicketStatus[] }
  }
  if (assignees.length) where.assignedToId = { in: assignees }
  if (nmId !== null) where.nmId = nmId
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59`) } : {}),
    }
  }

  const [tickets, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        channel: true,
        status: true,
        nmId: true,
        rating: true,
        previewText: true,
        createdAt: true,
        appealStatus: true,
        assignedTo: {
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
          },
        },
        // Phase 12-02: кликабельное имя покупателя в карточке ленты
        customer: { select: { id: true, name: true } },
        customerNameSnapshot: true,
        // Phase 12-03: бейдж messengerType (Tg/Wa/Др) в карточке ленты для MESSENGER
        messengerType: true,
      },
    }),
    prisma.supportTicket.count({ where }),
  ])

  const nmIds = Array.from(
    new Set(tickets.map((t) => t.nmId).filter((n): n is number => n !== null))
  )
  const cards =
    nmIds.length > 0
      ? await prisma.wbCard.findMany({
          where: { nmId: { in: nmIds } },
          select: { nmId: true, name: true, photoUrl: true },
        })
      : []
  const cardMap = new Map<
    number,
    { nmId: number; photoUrl: string | null; title: string | null }
  >()
  for (const c of cards) {
    cardMap.set(c.nmId, {
      nmId: c.nmId,
      photoUrl: c.photoUrl ?? null,
      title: c.name,
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Служба поддержки</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/support/new"
            className="inline-flex items-center h-9 rounded-md border px-3 text-sm hover:bg-muted"
          >
            <Plus className="w-4 h-4 mr-1" />
            Новый тикет
          </Link>
          <SupportSyncButton />
        </div>
      </div>
      <SupportFilters
        channelOptions={CHANNEL_OPTIONS}
        statusOptions={STATUS_OPTIONS}
        assigneeOptions={assigneeOptions}
      />
      {tickets.length === 0 ? (
        <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">
          Нет тикетов
        </div>
      ) : (
        <ul className="space-y-2">
          {tickets.map((t) => (
            <li key={t.id}>
              <SupportTicketCard
                ticket={t}
                wbCard={t.nmId ? cardMap.get(t.nmId) ?? null : null}
              />
            </li>
          ))}
        </ul>
      )}
      <SupportPagination page={page} pageSize={pageSize} total={total} />
    </div>
  )
}
