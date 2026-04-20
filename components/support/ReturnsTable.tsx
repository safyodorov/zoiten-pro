// components/support/ReturnsTable.tsx
// Phase 9 Plan 03: Таблица заявок на возврат — 9 колонок.
// Колонка «Товар» содержит фото из WbCard.photoUrl (12×9, object-cover) + название + nmId ссылкой.
// Фото брака — превью из SupportMedia (INBOUND сообщение), клик → /support/{ticketId}.
"use client"

import Link from "next/link"
import type {
  ReturnDecision,
  ReturnState,
  SupportMedia,
  SupportMessage,
  SupportTicket,
  User,
} from "@prisma/client"
import { toWbCdnThumb } from "@/lib/wb-cdn"
import { MediaGallery } from "./MediaGallery"

function copyToClipboard(text: string, label: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      import("sonner").then(({ toast }) => toast.success(`${label} скопирован`))
    })
    .catch(() => {
      /* ignore */
    })
}

type TicketWithMessages = SupportTicket & {
  messages: (SupportMessage & { media: SupportMedia[] })[]
  assignedTo: Pick<User, "id" | "firstName" | "lastName" | "name"> | null
}
type DecisionWithUser = ReturnDecision & {
  decidedBy: Pick<User, "id" | "firstName" | "lastName" | "name">
}
type CardInfo = { nmId: number; name: string | null; photoUrl: string | null }

export interface ReturnsTableProps {
  tickets: TicketWithMessages[]
  decisionByTicket: Record<string, DecisionWithUser>
  cardByNm: Record<number, CardInfo>
}

const STATE_BADGE: Record<ReturnState, { label: string; className: string }> = {
  PENDING: { label: "Ожидает", className: "bg-gray-200 text-gray-800" },
  APPROVED: { label: "Одобрен", className: "bg-green-100 text-green-800" },
  REJECTED: { label: "Отклонён", className: "bg-red-100 text-red-800" },
}

const MOSCOW_TZ: Intl.DateTimeFormatOptions = {
  timeZone: "Europe/Moscow",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
}

function formatUser(
  u: Pick<User, "firstName" | "lastName" | "name"> | null | undefined
): string {
  if (!u) return "—"
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim()
  return full || u.name || "—"
}

function mediaSrc(m: SupportMedia): string {
  // localPath = /var/www/zoiten-uploads/... → nginx отдаёт /uploads/...
  if (m.localPath) {
    return m.localPath.replace("/var/www/zoiten-uploads", "/uploads")
  }
  return m.wbUrl
}

// Quick Task 260420-oxd: thumbnailPath → /uploads/...thumb.(jpg|webp)
// Fallback на оригинал для IMAGE (если backfill не прогнали), null для VIDEO
// (в MediaGallery VIDEO без thumbnailSrc рендерится серой заглушкой + Play).
function mediaThumbSrc(m: SupportMedia): string | null {
  if (m.thumbnailPath) {
    return m.thumbnailPath.replace("/var/www/zoiten-uploads", "/uploads")
  }
  if (m.type === "IMAGE" && m.localPath) {
    return m.localPath.replace("/var/www/zoiten-uploads", "/uploads")
  }
  return null
}

export function ReturnsTable({
  tickets,
  decisionByTicket,
  cardByNm,
}: ReturnsTableProps) {
  if (tickets.length === 0) return null

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Товар</th>
            <th className="px-3 py-2 text-left font-medium">Артикул</th>
            <th className="px-3 py-2 text-left font-medium">Покупатель</th>
            <th className="px-3 py-2 text-left font-medium">Причина</th>
            <th className="px-3 py-2 text-left font-medium">Фото брака</th>
            <th className="px-3 py-2 text-left font-medium">Дата заказа</th>
            <th className="px-3 py-2 text-left font-medium">Дата заявки</th>
            <th className="px-3 py-2 text-left font-medium">Решение</th>
            <th className="px-3 py-2 text-left font-medium">Кто принял</th>
            <th className="px-3 py-2 text-left font-medium">Пересмотрено</th>
            <th className="px-3 py-2 text-left font-medium">Действия</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => {
            const card =
              typeof t.nmId === "number" ? cardByNm[t.nmId] : undefined
            const decision = decisionByTicket[t.id]
            const firstMsg = t.messages[0]
            const media = firstMsg?.media ?? []
            const state = t.returnState ?? "PENDING"
            const badge = STATE_BADGE[state]
            const buyerLabel = `Покупатель #${t.id.slice(-6)}`

            return (
              <tr key={t.id} className="border-t hover:bg-accent/20">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {card?.photoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={toWbCdnThumb(card.photoUrl) ?? card.photoUrl}
                        alt=""
                        width={36}
                        height={48}
                        decoding="async"
                        loading="lazy"
                        className="h-12 w-9 rounded object-cover flex-shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate max-w-[220px]">
                        {card?.name ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {t.srid ? (
                          <button
                            type="button"
                            className="hover:text-primary cursor-pointer"
                            title={`Номер заказа: ${t.srid}. Клик — копировать.`}
                            onClick={() => copyToClipboard(t.srid ?? "", "Номер заказа")}
                          >
                            {t.srid.length > 18 ? `${t.srid.slice(0, 18)}…` : t.srid}
                          </button>
                        ) : (
                          "—"
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-xs font-mono whitespace-nowrap">
                  {typeof t.nmId === "number" ? (
                    <button
                      type="button"
                      className="hover:text-primary cursor-pointer"
                      title={`Артикул ${t.nmId}. Клик — копировать.`}
                      onClick={() => copyToClipboard(String(t.nmId), "Артикул")}
                    >
                      {t.nmId}
                    </button>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2">{buyerLabel}</td>
                <td className="px-3 py-2 max-w-[280px]">
                  <p
                    className="line-clamp-2"
                    title={firstMsg?.text ?? undefined}
                  >
                    {firstMsg?.text ?? t.previewText ?? "—"}
                  </p>
                </td>
                <td className="px-3 py-2">
                  <MediaGallery
                    items={media.map((m) => ({
                      id: m.id,
                      src: mediaSrc(m),
                      thumbnailSrc: mediaThumbSrc(m),
                      type: m.type,
                    }))}
                    thumbClassName="w-10 h-10"
                    limit={3}
                  />
                </td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">
                  {t.wbOrderDt
                    ? new Intl.DateTimeFormat("ru-RU", MOSCOW_TZ).format(
                        t.wbOrderDt
                      )
                    : "—"}
                </td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">
                  {new Intl.DateTimeFormat("ru-RU", MOSCOW_TZ).format(
                    t.lastMessageAt ?? t.createdAt
                  )}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">
                  {decision ? (
                    <div>
                      <div>{formatUser(decision.decidedBy)}</div>
                      <div className="text-muted-foreground">
                        {new Intl.DateTimeFormat("ru-RU", MOSCOW_TZ).format(
                          decision.decidedAt
                        )}
                      </div>
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2">
                  {decision?.reconsidered ? (
                    <span className="text-green-700">Да</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/support/${t.id}`}
                    className="inline-block px-3 py-1 text-xs rounded-md border hover:bg-accent"
                  >
                    Открыть
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
