// Phase 10: ERP-local auto-reply. WB Chat API не имеет endpoint для auto-reply,
// эта логика — чисто локальная: cron 5 мин проверяет AutoReplyConfig и отправляет
// OUTBOUND сообщение с isAutoReply=true вне рабочих часов.

import { prisma } from "@/lib/prisma"
import { sendChatMessage } from "@/lib/wb-support-api"
import type { AutoReplyConfig } from "@prisma/client"

const DAY_MS = 24 * 60 * 60 * 1000

// Чистый helper — используется из runAutoReplies и (опционально) в UI превью.
// Возвращает true если now находится в рабочем диапазоне (workDays + workdayStart..End)
// по config.timezone (IANA, по умолчанию Europe/Moscow).
export function isWithinWorkingHours(
  config: Pick<AutoReplyConfig, "workDays" | "workdayStart" | "workdayEnd" | "timezone">,
  now: Date = new Date()
): boolean {
  // Построить локальное представление now в config.timezone
  const tzString = now.toLocaleString("en-US", { timeZone: config.timezone })
  const tzDate = new Date(tzString)

  // ISO 8601 day of week: 1=Mon..7=Sun (JS getDay: 0=Sun..6=Sat)
  const jsDay = tzDate.getDay()
  const isoDay = jsDay === 0 ? 7 : jsDay

  if (!config.workDays.includes(isoDay)) return false

  const [startH, startM] = config.workdayStart.split(":").map(Number)
  const [endH, endM] = config.workdayEnd.split(":").map(Number)
  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM
  const nowMinutes = tzDate.getHours() * 60 + tzDate.getMinutes()

  return nowMinutes >= startMinutes && nowMinutes < endMinutes
}

export interface AutoReplyResult {
  sent: number
  skipped: number
  errors: string[]
}

export async function runAutoReplies(now: Date = new Date()): Promise<AutoReplyResult> {
  const result: AutoReplyResult = { sent: 0, skipped: 0, errors: [] }

  const config = await prisma.autoReplyConfig.findUnique({ where: { id: "default" } })
  if (!config) {
    result.errors.push("AutoReplyConfig не инициализирован (ожидается seed 'default')")
    return result
  }
  if (!config.isEnabled) {
    result.skipped = 1
    return result
  }
  if (isWithinWorkingHours(config, now)) {
    result.skipped = 1
    return result
  }

  const cutoff = new Date(now.getTime() - DAY_MS)

  // Кандидаты: CHAT тикеты с chatReplySign и lastMessageAt за 24ч
  const tickets = await prisma.supportTicket.findMany({
    where: {
      channel: "CHAT",
      chatReplySign: { not: null },
      lastMessageAt: { gte: cutoff },
    },
    select: {
      id: true,
      nmId: true,
      chatReplySign: true,
      customerNameSnapshot: true,
    },
  })

  for (const ticket of tickets) {
    try {
      if (!ticket.chatReplySign) continue

      // Все сообщения ticket за 24ч — для dedup + ответ-проверки
      const recent = await prisma.supportMessage.findMany({
        where: { ticketId: ticket.id, sentAt: { gte: cutoff } },
        orderBy: { sentAt: "desc" },
      })
      if (recent.length === 0) continue

      const lastInbound = recent.find((m) => m.direction === "INBOUND")
      if (!lastInbound) continue

      // Есть ли OUTBOUND после последнего INBOUND? → менеджер уже ответил
      const hasOutboundAfter = recent.some(
        (m) =>
          m.direction === "OUTBOUND" &&
          m.sentAt.getTime() > lastInbound.sentAt.getTime()
      )
      if (hasOutboundAfter) continue

      // Dedup: уже отправляли autoReply за 24ч на этом ticket?
      const hadAutoReply = recent.some((m) => m.isAutoReply === true)
      if (hadAutoReply) continue

      // Подстановка переменных
      const wbCard = ticket.nmId
        ? await prisma.wbCard.findUnique({
            where: { nmId: ticket.nmId },
            select: { name: true },
          })
        : null
      const text = config.messageText
        .replace(/\{имя_покупателя\}/g, ticket.customerNameSnapshot ?? "покупатель")
        .replace(/\{название_товара\}/g, wbCard?.name ?? "товар")

      try {
        await sendChatMessage({ replySign: ticket.chatReplySign, message: text })
      } catch (err) {
        result.errors.push(
          `ticket ${ticket.id}: sendChatMessage ${err instanceof Error ? err.message : "unknown"}`
        )
        continue
      }

      await prisma.supportMessage.create({
        data: {
          ticketId: ticket.id,
          direction: "OUTBOUND",
          text,
          authorId: null,
          isAutoReply: true,
          wbSentAt: now,
          sentAt: now,
        },
      })
      result.sent++
    } catch (err) {
      result.errors.push(
        `ticket ${ticket.id}: ${err instanceof Error ? err.message : "unknown"}`
      )
    }
  }

  return result
}
