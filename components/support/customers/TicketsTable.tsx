// components/support/customers/TicketsTable.tsx
// Server component — список тикетов покупателя с иконкой канала, превью, статусом и ссылкой «Открыть».
// Сортировка (DESC по createdAt) делается в RSC page — этот компонент принимает уже готовый массив.

import Link from "next/link"
import {
  MessageSquare,
  HelpCircle,
  MessageCircle,
  RotateCw,
  Inbox,
  Star,
} from "lucide-react"
import type { TicketChannel, TicketStatus } from "@prisma/client"

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
const statusLabelMap: Record<TicketStatus, string> = {
  NEW: "Новый",
  IN_PROGRESS: "В работе",
  ANSWERED: "Отвечен",
  CLOSED: "Закрыт",
  APPEALED: "Обжалование",
}
const statusColorMap: Record<TicketStatus, string> = {
  NEW: "text-red-600",
  IN_PROGRESS: "text-yellow-600",
  ANSWERED: "text-green-600",
  CLOSED: "text-gray-500",
  APPEALED: "text-purple-600",
}

export interface TicketRow {
  id: string
  channel: TicketChannel
  status: TicketStatus
  nmId: number | null
  rating: number | null
  previewText: string | null
  createdAt: Date
  assignedTo: {
    id: string
    name: string
    firstName: string | null
    lastName: string | null
  } | null
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

function assigneeName(a: TicketRow["assignedTo"]): string {
  if (!a) return "—"
  const full = [a.firstName, a.lastName].filter(Boolean).join(" ").trim()
  return full || a.name || "—"
}

export function TicketsTable({ tickets }: { tickets: TicketRow[] }) {
  if (tickets.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-muted-foreground">
        У этого покупателя нет обращений
      </div>
    )
  }
  return (
    <ul className="space-y-2">
      {tickets.map((t) => {
        const Icon = channelIconMap[t.channel]
        return (
          <li key={t.id}>
            <Link
              href={`/support/${t.id}`}
              className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted transition-colors"
            >
              <div className="flex flex-col items-center w-16 shrink-0">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <span className="text-[10px] uppercase text-muted-foreground mt-1">
                  {channelLabelMap[t.channel]}
                </span>
                {t.channel === "FEEDBACK" && t.rating !== null && (
                  <span className="flex items-center gap-0.5 mt-1 text-amber-500">
                    {Array.from({ length: t.rating }).map((_, i) => (
                      <Star key={i} className="w-2.5 h-2.5 fill-current" />
                    ))}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <span
                    className={`text-xs font-medium ${statusColorMap[t.status]}`}
                  >
                    {statusLabelMap[t.status]}
                  </span>
                  {t.nmId && (
                    <span className="text-xs text-muted-foreground">
                      Артикул {t.nmId}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {formatDate(t.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {t.previewText ?? (
                    <span className="italic">нет текста</span>
                  )}
                </p>
                <div className="text-xs text-muted-foreground">
                  Менеджер: {assigneeName(t.assignedTo)}
                </div>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
