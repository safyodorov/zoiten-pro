// app/(dashboard)/support/[ticketId]/page.tsx
// RSC — 3-колоночный диалог тикета: покупатель+товар / хронология+reply / статус+менеджер+мета

import { notFound } from "next/navigation"
import Link from "next/link"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { SupportDialog } from "@/components/support/SupportDialog"
import { ReplyPanel } from "@/components/support/ReplyPanel"
import { ReturnActionsPanel } from "@/components/support/ReturnActionsPanel"
import { ReturnInfoPanel } from "@/components/support/ReturnInfoPanel"
import { TicketSidePanel } from "@/components/support/TicketSidePanel"
import { SupportSyncButton } from "@/components/support/SupportSyncButton"
import { ChevronLeft } from "lucide-react"

export default async function TicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>
}) {
  await requireSection("SUPPORT")
  const { ticketId } = await params

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      customer: true,
      assignedTo: {
        select: { id: true, name: true, firstName: true, lastName: true },
      },
      messages: {
        orderBy: { sentAt: "asc" },
        include: {
          author: {
            select: { id: true, name: true, firstName: true, lastName: true },
          },
          media: {
            select: {
              id: true,
              type: true,
              wbUrl: true,
              localPath: true,
            },
          },
        },
      },
    },
  })
  if (!ticket) notFound()

  const supportUsers = await prisma.user.findMany({
    where: {
      isActive: true,
      sectionRoles: { some: { section: "SUPPORT" } },
    },
    select: { id: true, name: true, firstName: true, lastName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  })

  const wbCard = ticket.nmId
    ? await prisma.wbCard.findUnique({
        where: { nmId: ticket.nmId },
        select: { nmId: true, name: true, photoUrl: true },
      })
    : null

  function authorName(
    a: {
      name: string
      firstName: string | null
      lastName: string | null
    } | null
  ): string | null {
    if (!a) return null
    const full = [a.firstName, a.lastName].filter(Boolean).join(" ").trim()
    return full || a.name || null
  }

  const messages = ticket.messages.map((m) => ({
    id: m.id,
    direction: m.direction,
    text: m.text,
    authorName: authorName(m.author),
    sentAt: m.sentAt,
    wbSentAt: m.wbSentAt,
    media: m.media,
  }))

  const canReply =
    ticket.channel === "FEEDBACK" || ticket.channel === "QUESTION"
  const isReturn = ticket.channel === "RETURN"

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] -m-6">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <Link
          href="/support"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Назад к ленте
        </Link>
        <SupportSyncButton />
      </div>
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] min-h-0">
        <aside className="border-r p-4 space-y-4 overflow-y-auto">
          <section>
            <h3 className="text-xs uppercase text-muted-foreground mb-2">
              Покупатель
            </h3>
            <p className="text-sm">{ticket.customer?.name ?? "Покупатель"}</p>
            {ticket.customer?.wbUserId && (
              <p className="text-xs text-muted-foreground">
                WB ID: {ticket.customer.wbUserId}
              </p>
            )}
          </section>
          {wbCard && (
            <section>
              <h3 className="text-xs uppercase text-muted-foreground mb-2">
                Товар
              </h3>
              {wbCard.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={wbCard.photoUrl}
                  alt={wbCard.name ?? ""}
                  className="w-full rounded mb-2 max-w-[180px]"
                />
              )}
              <p className="text-sm">{wbCard.name ?? "—"}</p>
              <Link
                href={`/cards/wb?nmId=${wbCard.nmId}`}
                className="text-xs text-primary hover:underline"
              >
                Артикул {wbCard.nmId} →
              </Link>
            </section>
          )}
          {isReturn && (
            <ReturnInfoPanel
              price={ticket.price}
              wbComment={ticket.wbComment}
              srid={ticket.srid}
            />
          )}
        </aside>
        <div className="flex flex-col min-h-0">
          <SupportDialog messages={messages} />
          {canReply && (
            <ReplyPanel
              ticketId={ticket.id}
              disabled={ticket.status === "CLOSED"}
            />
          )}
          {isReturn && (
            <ReturnActionsPanel
              ticketId={ticket.id}
              returnState={ticket.returnState}
              wbActions={ticket.wbActions}
            />
          )}
          {!canReply && !isReturn && (
            <div className="border-t p-3 text-xs text-muted-foreground text-center">
              Ответ через интерфейс доступен для каналов «Отзыв» и «Вопрос».
              Чат/мессенджер — в следующих фазах.
            </div>
          )}
        </div>
        <div className="border-l p-4 overflow-y-auto">
          <TicketSidePanel
            ticketId={ticket.id}
            channel={ticket.channel}
            status={ticket.status}
            assignedToId={ticket.assignedToId}
            users={supportUsers}
            createdAt={ticket.createdAt}
            lastMessageAt={ticket.lastMessageAt}
          />
        </div>
      </div>
    </div>
  )
}
