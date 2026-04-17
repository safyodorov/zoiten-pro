"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { assignTicket, updateTicketStatus } from "@/app/actions/support"
import type { TicketStatus, TicketChannel } from "@prisma/client"

interface User {
  id: string
  name: string
  firstName: string | null
  lastName: string | null
}

interface Props {
  ticketId: string
  channel: TicketChannel
  status: TicketStatus
  assignedToId: string | null
  users: User[]
  createdAt: Date
  lastMessageAt: Date | null
}

const STATUS_LABELS: Record<TicketStatus, string> = {
  NEW: "Новый",
  IN_PROGRESS: "В работе",
  ANSWERED: "Отвечен",
  CLOSED: "Закрыт",
  APPEALED: "Обжалование",
}
const MANUAL_STATUSES: TicketStatus[] = [
  "NEW",
  "IN_PROGRESS",
  "ANSWERED",
  "CLOSED",
]

const CHANNEL_LABELS: Record<TicketChannel, string> = {
  FEEDBACK: "Отзыв",
  QUESTION: "Вопрос",
  CHAT: "Чат",
  RETURN: "Возврат",
  MESSENGER: "Мессенджер",
}

function fullName(u: User): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim()
  return full || u.name || u.id.slice(-6)
}

function formatDate(d: Date | null): string {
  if (!d) return "—"
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(d)
}

export function TicketSidePanel({
  ticketId,
  channel,
  status,
  assignedToId,
  users,
  createdAt,
  lastMessageAt,
}: Props) {
  const [isPending, startTransition] = useTransition()

  function onStatusChange(next: TicketStatus) {
    startTransition(async () => {
      const res = await updateTicketStatus(ticketId, next)
      if (res.ok) toast.success("Статус обновлён")
      else toast.error(res.error)
    })
  }

  function onAssigneeChange(val: string) {
    const userId = val === "" ? null : val
    startTransition(async () => {
      const res = await assignTicket(ticketId, userId)
      if (res.ok)
        toast.success(userId ? "Менеджер назначен" : "Назначение снято")
      else toast.error(res.error)
    })
  }

  return (
    <aside className="space-y-4 text-sm">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">
          Статус
        </label>
        <select
          value={status}
          disabled={isPending}
          onChange={(e) => onStatusChange(e.target.value as TicketStatus)}
          className="w-full h-9 rounded-md border bg-transparent px-2"
        >
          {MANUAL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
          {status === "APPEALED" && (
            <option value="APPEALED">Обжалование</option>
          )}
        </select>
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">
          Менеджер
        </label>
        <select
          value={assignedToId ?? ""}
          disabled={isPending}
          onChange={(e) => onAssigneeChange(e.target.value)}
          className="w-full h-9 rounded-md border bg-transparent px-2"
        >
          <option value="">— Не назначен —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {fullName(u)}
            </option>
          ))}
        </select>
      </div>
      <div className="pt-2 border-t space-y-2 text-xs text-muted-foreground">
        <div>
          Канал: <span className="text-foreground">{CHANNEL_LABELS[channel]}</span>
        </div>
        <div>
          Создан: <span className="text-foreground">{formatDate(createdAt)}</span>
        </div>
        <div>
          Последнее сообщение:{" "}
          <span className="text-foreground">{formatDate(lastMessageAt)}</span>
        </div>
      </div>
    </aside>
  )
}
