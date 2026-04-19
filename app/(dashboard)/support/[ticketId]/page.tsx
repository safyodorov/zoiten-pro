// app/(dashboard)/support/[ticketId]/page.tsx
// RSC — 3-колоночный диалог тикета: покупатель+товар / хронология+reply / статус+менеджер+мета

import { notFound } from "next/navigation"
import Link from "next/link"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { SupportDialog } from "@/components/support/SupportDialog"
import { ReplyPanel } from "@/components/support/ReplyPanel"
import { ChatReplyPanel } from "@/components/support/ChatReplyPanel"
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
      // Phase 11-04: AppealRecord для APPEALED тикетов (TicketSidePanel → AppealStatusPanel)
      appealRecord: {
        include: {
          createdBy: {
            select: { name: true, firstName: true, lastName: true },
          },
          resolvedBy: {
            select: { name: true, firstName: true, lastName: true },
          },
        },
      },
      // 2026-04-19: auto-link CHAT ↔ RETURN
      linkedReturn: {
        select: { id: true, nmId: true, returnState: true, previewText: true },
      },
      linkedChats: {
        select: { id: true, previewText: true, lastMessageAt: true, status: true },
        orderBy: { lastMessageAt: "desc" },
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

  // Phase 11-03: активные шаблоны канала тикета — для TemplatePickerModal в ReplyPanel.
  // Загружаем только для FEEDBACK/QUESTION/CHAT; RETURN/MESSENGER не используют picker.
  const canLoadTemplates =
    ticket.channel === "FEEDBACK" ||
    ticket.channel === "QUESTION" ||
    ticket.channel === "CHAT"
  const templates = canLoadTemplates
    ? await prisma.responseTemplate.findMany({
        where: { channel: ticket.channel, isActive: true },
        orderBy: [{ updatedAt: "desc" }],
      })
    : []

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
    isAutoReply: m.isAutoReply,
  }))

  const canReply =
    ticket.channel === "FEEDBACK" || ticket.channel === "QUESTION"
  const isChat = ticket.channel === "CHAT"
  const isReturn = ticket.channel === "RETURN"
  const isMessenger = ticket.channel === "MESSENGER"

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
            {ticket.customerId ? (
              <Link
                href={`/support/customers/${ticket.customerId}`}
                className="text-sm hover:underline"
              >
                {ticket.customer?.name ?? "Покупатель"} →
              </Link>
            ) : (
              <p className="text-sm">
                {ticket.customer?.name ??
                  ticket.customerNameSnapshot ??
                  "Покупатель"}
              </p>
            )}
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
          {isReturn && ticket.linkedChats.length > 0 && (
            <section className="space-y-2 border rounded-lg p-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase">
                Связанные чаты
              </h3>
              <div className="space-y-1.5">
                {ticket.linkedChats.map((c) => (
                  <Link
                    key={c.id}
                    href={`/support/${c.id}`}
                    className="block text-sm hover:bg-accent rounded p-2 transition-colors"
                  >
                    <div className="font-medium">
                      Чат · {c.status === "NEW" ? "Новый" : c.status === "ANSWERED" ? "Отвечен" : c.status}
                    </div>
                    {c.previewText && (
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {c.previewText}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          )}
          {isChat && ticket.linkedReturn && (
            <section className="space-y-2 border rounded-lg p-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase">
                По заявке на возврат
              </h3>
              <Link
                href={`/support/${ticket.linkedReturn.id}`}
                className="block text-sm hover:bg-accent rounded p-2 transition-colors"
              >
                <div className="font-medium">
                  Возврат · nmID {ticket.linkedReturn.nmId ?? "—"}
                </div>
                {ticket.linkedReturn.previewText && (
                  <div className="text-xs text-muted-foreground line-clamp-2">
                    {ticket.linkedReturn.previewText}
                  </div>
                )}
              </Link>
            </section>
          )}
        </aside>
        <div className="flex flex-col min-h-0">
          <SupportDialog messages={messages} />
          {canReply && (
            <ReplyPanel
              ticketId={ticket.id}
              ticketNmId={ticket.nmId}
              ticketChannel={ticket.channel as "FEEDBACK" | "QUESTION" | "CHAT"}
              ticketStatus={ticket.status}
              wbExternalId={ticket.wbExternalId}
              customerName={ticket.customer?.name ?? null}
              productName={wbCard?.name ?? null}
              templates={templates}
              disabled={ticket.status === "CLOSED"}
            />
          )}
          {isChat && (
            <ChatReplyPanel
              ticketId={ticket.id}
              replySign={ticket.chatReplySign}
            />
          )}
          {isReturn && (
            <ReturnActionsPanel
              ticketId={ticket.id}
              returnState={ticket.returnState}
              wbActions={ticket.wbActions}
            />
          )}
          {isMessenger && (
            <div className="border-t p-3 text-xs text-muted-foreground text-center">
              Канал внешний — ответьте покупателю в{" "}
              {ticket.messengerType === "TELEGRAM"
                ? "Telegram"
                : ticket.messengerType === "WHATSAPP"
                ? "WhatsApp"
                : "мессенджере"}
              {ticket.messengerContact && (
                <>
                  :{" "}
                  <code className="bg-muted px-1 rounded">
                    {ticket.messengerContact}
                  </code>
                </>
              )}
            </div>
          )}
          {!canReply && !isChat && !isReturn && !isMessenger && (
            <div className="border-t p-3 text-xs text-muted-foreground text-center">
              Канал «{ticket.channel}» не поддерживает ответ через интерфейс.
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
            appealRecord={ticket.appealRecord}
            customerId={ticket.customerId}
            customerName={ticket.customer?.name ?? null}
          />
        </div>
      </div>
    </div>
  )
}
