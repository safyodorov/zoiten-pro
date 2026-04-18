// components/support/customers/ChannelStats.tsx
// Server component — счётчики тикетов по 5 каналам + средний рейтинг FEEDBACK.
// Агрегаты приходят из lib/customer-aggregations (Plan 12-01 pure helpers).

import type { TicketChannel } from "@prisma/client"
import {
  MessageSquare,
  HelpCircle,
  MessageCircle,
  RotateCw,
  Inbox,
  Star,
} from "lucide-react"

export interface ChannelStatsProps {
  byChannel: Record<TicketChannel, number>
  avgRating: number | null
}

const CHANNEL_CONFIG: Record<
  TicketChannel,
  { label: string; Icon: typeof MessageSquare }
> = {
  FEEDBACK: { label: "Отзывы", Icon: MessageSquare },
  QUESTION: { label: "Вопросы", Icon: HelpCircle },
  CHAT: { label: "Чаты", Icon: MessageCircle },
  RETURN: { label: "Возвраты", Icon: RotateCw },
  MESSENGER: { label: "Мессенджер", Icon: Inbox },
}

export function ChannelStats({ byChannel, avgRating }: ChannelStatsProps) {
  const channels: TicketChannel[] = [
    "FEEDBACK",
    "QUESTION",
    "CHAT",
    "RETURN",
    "MESSENGER",
  ]
  return (
    <section className="rounded-lg border p-4 space-y-3">
      <h3 className="text-sm font-semibold">По каналам</h3>
      <ul className="space-y-1">
        {channels.map((ch) => {
          const cfg = CHANNEL_CONFIG[ch]
          const Icon = cfg.Icon
          return (
            <li
              key={ch}
              className="flex items-center justify-between text-sm"
            >
              <span className="flex items-center gap-2 text-muted-foreground">
                <Icon className="w-3.5 h-3.5" />
                {cfg.label}
              </span>
              <span className="font-medium tabular-nums">{byChannel[ch]}</span>
            </li>
          )
        })}
      </ul>
      {avgRating !== null && (
        <div className="pt-2 border-t flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            Средний рейтинг
          </span>
          <span className="font-medium">{avgRating.toFixed(2)}</span>
        </div>
      )}
    </section>
  )
}
