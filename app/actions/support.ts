"use server"

// Server actions службы поддержки — RBAC SUPPORT+MANAGE на каждом действии.
// replyToTicket → отправка ответа в WB API, создание OUTBOUND SupportMessage.
// assignTicket → назначение менеджера (IN_PROGRESS при назначении).
// updateTicketStatus → ручное изменение статуса (без APPEALED — резерв Phase 11).

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { auth } from "@/lib/auth"
import { replyFeedback, replyQuestion } from "@/lib/wb-support-api"
import type { TicketStatus } from "@prisma/client"

export type ActionResult = { ok: true } | { ok: false; error: string }

const MANUAL_STATUSES: TicketStatus[] = [
  "NEW",
  "IN_PROGRESS",
  "ANSWERED",
  "CLOSED",
]

async function getSessionUserId(): Promise<string | null> {
  const session = await auth()
  return session?.user?.id ?? null
}

export async function replyToTicket(
  ticketId: string,
  text: string
): Promise<ActionResult> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    const userId = await getSessionUserId()
    if (!userId) {
      return { ok: false, error: "Сессия без user.id" }
    }
    if (!text || !text.trim()) return { ok: false, error: "Пустой ответ" }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, channel: true, wbExternalId: true },
    })
    if (!ticket) return { ok: false, error: "Тикет не найден" }
    if (!ticket.wbExternalId) {
      return {
        ok: false,
        error: "У тикета нет wbExternalId — ответ через WB невозможен",
      }
    }

    try {
      if (ticket.channel === "FEEDBACK") {
        await replyFeedback(ticket.wbExternalId, text)
      } else if (ticket.channel === "QUESTION") {
        await replyQuestion(ticket.wbExternalId, text)
      } else {
        return { ok: false, error: "Канал не поддерживает ответ в Phase 8" }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка WB API"
      return { ok: false, error: `Ошибка WB API: ${msg}` }
    }

    const now = new Date()
    await prisma.$transaction([
      prisma.supportMessage.create({
        data: {
          ticketId: ticket.id,
          direction: "OUTBOUND",
          text,
          authorId: userId,
          wbSentAt: now,
          sentAt: now,
        },
      }),
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: {
          status: "ANSWERED",
          resolvedAt: now,
          lastMessageAt: now,
        },
      }),
    ])

    revalidatePath("/support")
    revalidatePath(`/support/${ticketId}`)
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Ошибка отправки ответа",
    }
  }
}

export async function assignTicket(
  ticketId: string,
  userId: string | null
): Promise<ActionResult> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        assignedToId: userId,
        status: userId ? "IN_PROGRESS" : undefined,
      },
    })
    revalidatePath("/support")
    revalidatePath(`/support/${ticketId}`)
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Ошибка назначения",
    }
  }
}

export async function updateTicketStatus(
  ticketId: string,
  status: TicketStatus
): Promise<ActionResult> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    if (!MANUAL_STATUSES.includes(status)) {
      return { ok: false, error: "Этот статус нельзя установить вручную" }
    }
    const now = new Date()
    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status,
        resolvedAt:
          status === "ANSWERED" || status === "CLOSED" ? now : null,
      },
    })
    revalidatePath("/support")
    revalidatePath(`/support/${ticketId}`)
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Ошибка обновления статуса",
    }
  }
}
