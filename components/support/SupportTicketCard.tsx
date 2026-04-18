"use client"

// Карточка тикета — client component (Phase 12-02: кликабельное имя покупателя через router.push).
// Индикатор-полоса слева по статусу. Outer <Link> на /support/[id]; если customer есть —
// inline <a> с onClick preventDefault+stopPropagation+router.push ведёт на /support/customers/[id].
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  MessageSquare,
  HelpCircle,
  MessageCircle,
  RotateCw,
  Inbox,
  Star,
} from "lucide-react"
import type {
  TicketChannel,
  TicketStatus,
  AppealStatus,
  MessengerType,
} from "@prisma/client"

const channelIconMap: Record<TicketChannel, typeof MessageSquare> = {
  FEEDBACK: MessageSquare,
  QUESTION: HelpCircle,
  CHAT: MessageCircle,
  RETURN: RotateCw,
  MESSENGER: Inbox,
}

const channelLabelMap: Record<TicketChannel, string> = {
  FEEDBACK: "Отзыв",
  QUESTION: "Вопрос",
  CHAT: "Чат",
  RETURN: "Возврат",
  MESSENGER: "Мессенджер",
}

const statusBorderMap: Record<TicketStatus, string> = {
  NEW: "border-l-red-500",
  IN_PROGRESS: "border-l-yellow-500",
  ANSWERED: "border-l-green-500",
  CLOSED: "border-l-gray-400",
  APPEALED: "border-l-purple-500",
}

const statusLabelMap: Record<TicketStatus, string> = {
  NEW: "Новый",
  IN_PROGRESS: "В работе",
  ANSWERED: "Отвечен",
  CLOSED: "Закрыт",
  APPEALED: "Обжалование",
}

export interface SupportTicketCardProps {
  ticket: {
    id: string
    channel: TicketChannel
    status: TicketStatus
    nmId: number | null
    rating: number | null
    previewText: string | null
    createdAt: Date
    appealStatus?: AppealStatus | null
    assignedTo: {
      id: string
      name: string
      firstName: string | null
      lastName: string | null
    } | null
    // Phase 12-02:
    customer: { id: string; name: string | null } | null
    customerNameSnapshot: string | null
    // Phase 12-03:
    messengerType?: MessengerType | null
  }
  wbCard: { nmId: number; photoUrl: string | null; title: string | null } | null
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(d)
}

function getAssigneeName(
  u: SupportTicketCardProps["ticket"]["assignedTo"]
): string {
  if (!u) return "Не назначен"
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim()
  return full || u.name || "—"
}

export function SupportTicketCard({ ticket, wbCard }: SupportTicketCardProps) {
  const router = useRouter()
  const Icon = channelIconMap[ticket.channel]

  function onCustomerClick(e: React.MouseEvent) {
    if (!ticket.customer) return
    e.preventDefault()
    e.stopPropagation()
    router.push(`/support/customers/${ticket.customer.id}`)
  }

  const customerLabel =
    ticket.customer?.name ?? ticket.customerNameSnapshot ?? "Покупатель"

  return (
    <Link
      href={`/support/${ticket.id}`}
      className={`flex gap-4 p-4 bg-white dark:bg-neutral-900 rounded-lg border border-l-4 hover:shadow-md transition-shadow ${statusBorderMap[ticket.status]}`}
    >
      <div className="flex-shrink-0 flex flex-col items-center gap-1 text-muted-foreground">
        <Icon className="w-5 h-5" />
        <span className="text-[10px] uppercase">
          {channelLabelMap[ticket.channel]}
        </span>
        {ticket.channel === "MESSENGER" && ticket.messengerType && (
          <span className="text-[9px] uppercase text-muted-foreground font-medium">
            {ticket.messengerType === "TELEGRAM"
              ? "Tg"
              : ticket.messengerType === "WHATSAPP"
              ? "Wa"
              : "Др"}
          </span>
        )}
      </div>
      {wbCard?.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={wbCard.photoUrl}
          alt={wbCard.title ?? ""}
          className="w-[60px] h-[80px] object-cover rounded"
        />
      ) : (
        <div className="w-[60px] h-[80px] rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
          {ticket.nmId ?? "—"}
        </div>
      )}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 text-sm">
          {ticket.customer ? (
            <a
              href={`/support/customers/${ticket.customer.id}`}
              onClick={onCustomerClick}
              className="font-medium hover:underline cursor-pointer"
            >
              {customerLabel}
            </a>
          ) : (
            <span className="font-medium">{customerLabel}</span>
          )}
          {ticket.channel === "FEEDBACK" && ticket.rating !== null && (
            <span className="flex items-center gap-0.5 text-amber-500">
              {Array.from({ length: ticket.rating }).map((_, i) => (
                <Star key={i} className="w-3.5 h-3.5 fill-current" />
              ))}
            </span>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {statusLabelMap[ticket.status]}
          </span>
          {ticket.appealStatus && ticket.appealStatus !== "NONE" && (
            <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {ticket.appealStatus === "PENDING" && <>🕐 Обжалование</>}
              {ticket.appealStatus === "APPROVED" && (
                <>✅ Обжалование одобрено</>
              )}
              {ticket.appealStatus === "REJECTED" && <>❌ Отклонено WB</>}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {ticket.previewText ?? <span className="italic">нет текста</span>}
        </p>
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <span>
            {ticket.nmId ? `Артикул ${ticket.nmId}` : "Без артикула"}
          </span>
          <span>{formatDate(ticket.createdAt)}</span>
          <span>{getAssigneeName(ticket.assignedTo)}</span>
        </div>
      </div>
    </Link>
  )
}
