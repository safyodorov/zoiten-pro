"use server"

// Server actions службы поддержки — RBAC SUPPORT+MANAGE на каждом действии.
// replyToTicket → отправка ответа в WB API, создание OUTBOUND SupportMessage.
// assignTicket → назначение менеджера (IN_PROGRESS при назначении).
// updateTicketStatus → ручное изменение статуса (без APPEALED — резерв Phase 11).

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { auth } from "@/lib/auth"
import {
  replyFeedback,
  replyQuestion,
  approveReturn as wbApproveReturn,
  rejectReturn as wbRejectReturn,
  reconsiderReturn as wbReconsiderReturn,
} from "@/lib/wb-support-api"
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

// ── Phase 9 — Возвраты ──────────────────────────────────────────
// approveReturn  — PENDING → APPROVED, WB action picker (approve1 > autorefund1 > approvecc1)
// rejectReturn   — PENDING → REJECTED, WB rejectcustom + reason 10..1000
// reconsiderReturn — REJECTED → APPROVED (reconsidered=true), требует approve1 в свежих wbActions
//
// Все 3 action:
//   1) requireSection("SUPPORT", "MANAGE") + getSessionUserId (переиспользует Phase 8 helper)
//   2) state machine guards (SUP-20) — APPROVED финал, REJECTED→PENDING невозможен
//   3) WB PATCH первым — Decision/update только после успеха (если WB 4xx/5xx, Decision НЕ создаётся)
//   4) revalidatePath /support/returns + /support/[ticketId]

function pickApproveAction(wbActions: string[]): string | null {
  if (wbActions.includes("approve1")) return "approve1"
  if (wbActions.includes("autorefund1")) return "autorefund1"
  if (wbActions.includes("approvecc1")) return "approvecc1"
  return null
}

export async function approveReturn(
  ticketId: string
): Promise<ActionResult> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    const userId = await getSessionUserId()
    if (!userId) return { ok: false, error: "Сессия без user.id" }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        channel: true,
        wbExternalId: true,
        returnState: true,
        wbActions: true,
      },
    })
    if (!ticket) return { ok: false, error: "Тикет не найден" }
    if (ticket.channel !== "RETURN") {
      return { ok: false, error: "Не RETURN-тикет" }
    }
    if (ticket.returnState === "APPROVED") {
      return { ok: false, error: "Возврат уже одобрен (финал)" }
    }
    if (ticket.returnState === "REJECTED") {
      return { ok: false, error: "Используйте reconsiderReturn" }
    }
    if (!ticket.wbExternalId) {
      return { ok: false, error: "У тикета нет wbExternalId" }
    }

    const wbAction = pickApproveAction(ticket.wbActions)
    if (!wbAction) {
      return {
        ok: false,
        error: "WB API не предоставляет доступных action-ов для одобрения",
      }
    }

    // 1. PATCH WB первым — если ошибка, Decision не создаётся
    try {
      await wbApproveReturn(ticket.wbExternalId, wbAction)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Неизвестная ошибка"
      return { ok: false, error: `WB: ${msg}` }
    }

    // 2. Transaction: Decision + ticket update
    const now = new Date()
    await prisma.$transaction([
      prisma.returnDecision.create({
        data: {
          ticketId: ticket.id,
          action: "APPROVE",
          wbAction,
          reason: null,
          decidedById: userId,
          reconsidered: false,
          wbResponseOk: true,
        },
      }),
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: {
          returnState: "APPROVED",
          status: "ANSWERED",
          resolvedAt: now,
        },
      }),
    ])

    revalidatePath("/support/returns")
    revalidatePath(`/support/${ticketId}`)
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Ошибка",
    }
  }
}

export async function rejectReturn(
  ticketId: string,
  reason: string
): Promise<ActionResult> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    const userId = await getSessionUserId()
    if (!userId) return { ok: false, error: "Сессия без user.id" }

    const trimmed = reason.trim()
    if (trimmed.length < 10 || trimmed.length > 1000) {
      return {
        ok: false,
        error: "Причина должна быть от 10 до 1000 символов",
      }
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        channel: true,
        wbExternalId: true,
        returnState: true,
        wbActions: true,
      },
    })
    if (!ticket) return { ok: false, error: "Тикет не найден" }
    if (ticket.channel !== "RETURN") {
      return { ok: false, error: "Не RETURN-тикет" }
    }
    if (ticket.returnState !== "PENDING") {
      return { ok: false, error: "Отклонить можно только из PENDING" }
    }
    if (!ticket.wbExternalId) {
      return { ok: false, error: "У тикета нет wbExternalId" }
    }
    if (!ticket.wbActions.includes("rejectcustom")) {
      return {
        ok: false,
        error: "WB не предоставляет rejectcustom для этой заявки",
      }
    }

    try {
      await wbRejectReturn(ticket.wbExternalId, trimmed)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Неизвестная ошибка"
      return { ok: false, error: `WB: ${msg}` }
    }

    await prisma.$transaction([
      prisma.returnDecision.create({
        data: {
          ticketId: ticket.id,
          action: "REJECT",
          wbAction: "rejectcustom",
          reason: trimmed,
          decidedById: userId,
          reconsidered: false,
          wbResponseOk: true,
        },
      }),
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: {
          returnState: "REJECTED",
          status: "IN_PROGRESS",
        },
      }),
    ])

    revalidatePath("/support/returns")
    revalidatePath(`/support/${ticketId}`)
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Ошибка",
    }
  }
}

export async function reconsiderReturn(
  ticketId: string
): Promise<ActionResult> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    const userId = await getSessionUserId()
    if (!userId) return { ok: false, error: "Сессия без user.id" }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        channel: true,
        wbExternalId: true,
        returnState: true,
        wbActions: true,
      },
    })
    if (!ticket) return { ok: false, error: "Тикет не найден" }
    if (ticket.channel !== "RETURN") {
      return { ok: false, error: "Не RETURN-тикет" }
    }
    if (ticket.returnState !== "REJECTED") {
      return { ok: false, error: "Пересмотреть можно только отклонённые" }
    }
    if (!ticket.wbExternalId) {
      return { ok: false, error: "У тикета нет wbExternalId" }
    }
    if (!ticket.wbActions.includes("approve1")) {
      return {
        ok: false,
        error: "WB не позволяет пересмотреть эту заявку",
      }
    }

    try {
      await wbReconsiderReturn(ticket.wbExternalId, "approve1")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Неизвестная ошибка"
      return { ok: false, error: `WB: ${msg}` }
    }

    const now = new Date()
    await prisma.$transaction([
      prisma.returnDecision.create({
        data: {
          ticketId: ticket.id,
          action: "RECONSIDER",
          wbAction: "approve1",
          reason: null,
          decidedById: userId,
          reconsidered: true,
          wbResponseOk: true,
        },
      }),
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: {
          returnState: "APPROVED",
          status: "ANSWERED",
          resolvedAt: now,
        },
      }),
    ])

    revalidatePath("/support/returns")
    revalidatePath(`/support/${ticketId}`)
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Ошибка",
    }
  }
}
