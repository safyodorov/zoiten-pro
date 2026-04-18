// components/support/SupportDialog.tsx
// Server Component: хронологическая лента сообщений.
// Медиа-URL: если localPath задан — маппит через nginx alias /uploads/, иначе WB-URL.
// Phase 10: isAutoReply=true → inline Bot badge «Автоответ» рядом с меткой направления.

import { Bot } from "lucide-react"
import type { Direction, MediaType } from "@prisma/client"

interface Media {
  id: string
  type: MediaType
  wbUrl: string
  localPath: string | null
}

interface Message {
  id: string
  direction: Direction
  text: string | null
  authorName: string | null
  sentAt: Date
  wbSentAt: Date | null
  media: Media[]
  isAutoReply?: boolean
}

function formatTime(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(d)
}

function mediaSrc(m: Media): string {
  // nginx отдаёт /var/www/zoiten-uploads/* как /uploads/*
  if (!m.localPath) return m.wbUrl
  const idx = m.localPath.indexOf("/zoiten-uploads/")
  if (idx === -1) return m.wbUrl
  // .../zoiten-uploads/support/T1/M1/file → /uploads/support/T1/M1/file
  const rel = m.localPath.slice(idx + "/zoiten-uploads/".length)
  return `/uploads/${rel}`
}

export function SupportDialog({ messages }: { messages: Message[] }) {
  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Нет сообщений
      </div>
    )
  }
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {messages.map((m) => {
        const isOut = m.direction === "OUTBOUND"
        return (
          <div
            key={m.id}
            className={`flex ${isOut ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[70%] rounded-lg p-3 ${
                isOut ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}
            >
              <div className="text-[10px] uppercase opacity-70 mb-1 flex items-center gap-1">
                <span>
                  {isOut ? (m.authorName ?? "Менеджер") : "Покупатель"} ·{" "}
                  {formatTime(m.wbSentAt ?? m.sentAt)}
                </span>
                {m.isAutoReply && (
                  <span
                    className="inline-flex items-center gap-0.5"
                    title="Автоответ"
                  >
                    <Bot className="h-3 w-3" />
                    Автоответ
                  </span>
                )}
              </div>
              {m.text && (
                <p className="text-sm whitespace-pre-wrap">{m.text}</p>
              )}
              {m.media.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.media.map((md) =>
                    md.type === "IMAGE" ? (
                      <a
                        key={md.id}
                        href={mediaSrc(md)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={mediaSrc(md)}
                          alt=""
                          className="max-w-[160px] max-h-[120px] rounded object-cover"
                        />
                      </a>
                    ) : (
                      <a
                        key={md.id}
                        href={mediaSrc(md)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline"
                      >
                        Видео (откроется в новой вкладке)
                      </a>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
