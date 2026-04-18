"use server"

// Server actions службы поддержки — RBAC SUPPORT+MANAGE на каждом действии.
// replyToTicket → отправка ответа в WB API, создание OUTBOUND SupportMessage.
// assignTicket → назначение менеджера (IN_PROGRESS при назначении).
// updateTicketStatus → ручное изменение статуса (без APPEALED — резерв Phase 11).

import { revalidatePath } from "next/cache"
import { promises as fs } from "node:fs"
import path from "node:path"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { auth } from "@/lib/auth"
import {
  replyFeedback,
  replyQuestion,
  approveReturn as wbApproveReturn,
  rejectReturn as wbRejectReturn,
  reconsiderReturn as wbReconsiderReturn,
  sendChatMessage,
} from "@/lib/wb-support-api"
import type { MediaType, TicketStatus } from "@prisma/client"
import { autoReplyConfigSchema } from "@/lib/pricing-schemas"

export type ActionResult = { ok: true } | { ok: false; error: string }

// ── Phase 10 Plan 03 — CHAT multipart upload константы ──
const CHAT_UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/www/zoiten-uploads"
const CHAT_MAX_FILE_BYTES = 5 * 1024 * 1024
const CHAT_MAX_TOTAL_BYTES = 30 * 1024 * 1024
const CHAT_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
])

function sanitizeChatFilename(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9.\-_]/g, "_")
  const trimmed = cleaned.slice(-128)
  return trimmed || `file_${Date.now()}`
}

function mimeToMediaType(mime: string): MediaType {
  return mime === "application/pdf" ? "DOCUMENT" : "IMAGE"
}

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

// ── Phase 10 Plan 03 — sendChatMessageAction ────────────────────
// Multipart-отправка ответа в WB Buyer Chat (только channel=CHAT).
// Порядок: requireSection → validation → ticket guards → WB API first → local persist.
// WB-first защищает от неконсистентного состояния БД (паттерн Phase 9 approveReturn).
// Локальные файлы пишутся в /var/www/zoiten-uploads/support/{ticketId}/{messageId}/
// (тот же путь, что Phase 8 downloadMediaBatch — nginx отдаёт через /uploads/).
export async function sendChatMessageAction(
  formData: FormData
): Promise<ActionResult> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    const userId = await getSessionUserId()
    if (!userId) return { ok: false, error: "Сессия без user.id" }

    const ticketId = (formData.get("ticketId") as string | null) ?? ""
    if (!ticketId) return { ok: false, error: "ticketId обязателен" }

    const text = ((formData.get("text") as string | null) ?? "").trim()
    const files = (formData.getAll("files") as unknown[]).filter(
      (f): f is File => f instanceof File && f.size > 0
    )

    if (!text && files.length === 0) {
      return { ok: false, error: "Пустое сообщение" }
    }
    if (text.length > 1000) {
      return { ok: false, error: "Текст превышает 1000 символов" }
    }

    let totalBytes = 0
    for (const f of files) {
      if (!CHAT_ALLOWED_MIME.has(f.type)) {
        return {
          ok: false,
          error: `Недопустимый формат: ${f.name} (${f.type})`,
        }
      }
      if (f.size > CHAT_MAX_FILE_BYTES) {
        return { ok: false, error: `Файл ${f.name} больше 5 МБ` }
      }
      totalBytes += f.size
    }
    if (totalBytes > CHAT_MAX_TOTAL_BYTES) {
      return { ok: false, error: "Суммарный размер файлов больше 30 МБ" }
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        channel: true,
        chatReplySign: true,
        wbExternalId: true,
      },
    })
    if (!ticket) return { ok: false, error: "Тикет не найден" }
    if (ticket.channel !== "CHAT") {
      return { ok: false, error: "Канал тикета не CHAT" }
    }
    if (!ticket.chatReplySign) {
      return {
        ok: false,
        error: "Нет replySign для чата — запустите синхронизацию",
      }
    }

    // Prebuild буферы — File stream читается однократно.
    const wbFiles = await Promise.all(
      files.map(async (f) => ({
        name: f.name,
        data: Buffer.from(await f.arrayBuffer()),
        contentType: f.type,
      }))
    )

    // ── WB-first: при ошибке WB ничего локально не меняем ──
    try {
      await sendChatMessage({
        replySign: ticket.chatReplySign,
        message: text || undefined,
        files: wbFiles.length > 0 ? wbFiles : undefined,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка WB API"
      return { ok: false, error: `WB: ${msg}` }
    }

    // ── После успеха WB: локальная запись ──
    const now = new Date()
    const yearMs = 365 * 24 * 60 * 60 * 1000

    const msg = await prisma.supportMessage.create({
      data: {
        ticketId: ticket.id,
        direction: "OUTBOUND",
        text: text || null,
        authorId: userId,
        isAutoReply: false,
        wbSentAt: now,
        sentAt: now,
      },
    })

    if (wbFiles.length > 0) {
      const dir = path.join(CHAT_UPLOAD_DIR, "support", ticket.id, msg.id)
      await fs.mkdir(dir, { recursive: true })
      for (const f of wbFiles) {
        const localPath = path.join(dir, sanitizeChatFilename(f.name))
        await fs.writeFile(localPath, f.data)
        await prisma.supportMedia.create({
          data: {
            messageId: msg.id,
            type: mimeToMediaType(f.contentType),
            wbUrl: "",
            localPath,
            sizeBytes: f.data.length,
            expiresAt: new Date(Date.now() + yearMs),
          },
        })
      }
    }

    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: "ANSWERED", lastMessageAt: now },
    })

    revalidatePath("/support")
    revalidatePath(`/support/${ticketId}`)
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Ошибка отправки",
    }
  }
}

// ── Phase 10 Plan 04 — AutoReplyConfig settings ─────────────────
// saveAutoReplyConfig — singleton upsert id="default" + updatedById.
// Zod-валидация через autoReplyConfigSchema из @/lib/pricing-schemas
// (vitest не грузит auth chain из "use server" файлов — Phase 7 decision).
// RBAC: SUPPORT + MANAGE (write guard).

export async function saveAutoReplyConfig(
  formData: FormData
): Promise<ActionResult> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    const userId = await getSessionUserId()
    if (!userId) return { ok: false, error: "Сессия без user.id" }

    const rawIsEnabled = formData.get("isEnabled")
    const raw = {
      isEnabled: rawIsEnabled === "true" || rawIsEnabled === "on",
      workdayStart: String(formData.get("workdayStart") ?? ""),
      workdayEnd: String(formData.get("workdayEnd") ?? ""),
      workDays: formData
        .getAll("workDays")
        .map((v) => Number.parseInt(String(v), 10))
        .filter((n) => Number.isFinite(n)),
      messageText: String(formData.get("messageText") ?? ""),
      timezone: String(formData.get("timezone") ?? "Europe/Moscow"),
    }

    const parsed = autoReplyConfigSchema.safeParse(raw)
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Невалидные данные",
      }
    }

    await prisma.autoReplyConfig.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        ...parsed.data,
        updatedById: userId,
      },
      update: {
        ...parsed.data,
        updatedById: userId,
      },
    })

    revalidatePath("/support/auto-reply")
    revalidatePath("/support")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Ошибка сохранения",
    }
  }
}

// ────────────────────────────────────────────────────────────────
// Phase 12 — Профиль покупателя + MESSENGER канал
// ────────────────────────────────────────────────────────────────
// Hybrid strategy (D-01): CHAT тикеты auto-linked через syncChats (namespace chat:<chatID>).
// FEEDBACK/QUESTION/RETURN — manual linking через UI (Plan 12-02).
// MESSENGER — полностью manual (Plan 12-03).

// 1. linkTicketToCustomer — привязать существующий Customer к тикету
export async function linkTicketToCustomer(
  ticketId: string,
  customerId: string
): Promise<ActionResult> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    const userId = await getSessionUserId()
    if (!userId) return { ok: false, error: "Сессия без user.id" }
    if (!ticketId || !customerId) {
      return { ok: false, error: "ticketId/customerId пустые" }
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, channel: true },
    })
    if (!ticket) return { ok: false, error: "Тикет не найден" }
    if (ticket.channel === "CHAT") {
      return {
        ok: false,
        error:
          "CHAT тикеты линкуются автоматически — используйте merge для переноса",
      }
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    })
    if (!customer) return { ok: false, error: "Покупатель не найден" }

    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { customerId },
    })
    revalidatePath("/support")
    revalidatePath(`/support/${ticketId}`)
    revalidatePath(`/support/customers/${customerId}`)
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Ошибка",
    }
  }
}

// 2. createCustomerForTicket — создать Customer и привязать к тикету
const phoneRegex = /^[+\d\s()\-]{5,20}$/
const createCustomerForTicketSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Имя пустое")
    .max(200, "Имя длиннее 200 символов"),
  phone: z
    .string()
    .trim()
    .regex(phoneRegex, "Некорректный телефон")
    .nullable()
    .optional(),
})

export async function createCustomerForTicket(
  ticketId: string,
  input: z.input<typeof createCustomerForTicketSchema>
): Promise<ActionResult & { customerId?: string }> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    const userId = await getSessionUserId()
    if (!userId) return { ok: false, error: "Сессия без user.id" }

    const parsed = createCustomerForTicketSchema.safeParse(input)
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Невалидные данные",
      }
    }
    const data = parsed.data

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, channel: true },
    })
    if (!ticket) return { ok: false, error: "Тикет не найден" }
    if (ticket.channel === "CHAT") {
      return {
        ok: false,
        error: "CHAT тикеты линкуются автоматически",
      }
    }

    const customerId = await prisma.$transaction(async (tx) => {
      const c = await tx.customer.create({
        data: { name: data.name, phone: data.phone ?? null },
      })
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: { customerId: c.id },
      })
      return c.id
    })

    revalidatePath("/support")
    revalidatePath(`/support/${ticketId}`)
    revalidatePath(`/support/customers/${customerId}`)
    return { ok: true, customerId }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Ошибка",
    }
  }
}

// 3. updateCustomerNote — обновить заметку покупателя
const updateNoteSchema = z.string().max(5000, "Заметка длиннее 5000 символов")

export async function updateCustomerNote(
  customerId: string,
  note: string
): Promise<ActionResult> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    const userId = await getSessionUserId()
    if (!userId) return { ok: false, error: "Сессия без user.id" }

    const parsed = updateNoteSchema.safeParse(note)
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Заметка невалидна",
      }
    }

    try {
      await prisma.customer.update({
        where: { id: customerId },
        data: { note: parsed.data },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : ""
      if (msg.includes("Record") || msg.includes("P2025")) {
        return { ok: false, error: "Покупатель не найден" }
      }
      throw err
    }
    revalidatePath(`/support/customers/${customerId}`)
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Ошибка",
    }
  }
}

// 4. mergeCustomers — объединить двух покупателей (tickets переносятся, source удаляется)
const mergeSchema = z
  .object({
    sourceId: z.string().min(1, "sourceId пустой"),
    targetId: z.string().min(1, "targetId пустой"),
  })
  .refine((d) => d.sourceId !== d.targetId, {
    message: "Нельзя объединить покупателя с самим собой",
  })

export async function mergeCustomers(
  input: z.input<typeof mergeSchema>
): Promise<ActionResult & { ticketsMoved?: number }> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    const userId = await getSessionUserId()
    if (!userId) return { ok: false, error: "Сессия без user.id" }

    const parsed = mergeSchema.safeParse(input)
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Невалидные ID",
      }
    }
    const { sourceId, targetId } = parsed.data

    const ticketsMoved = await prisma.$transaction(async (tx) => {
      const source = await tx.customer.findUnique({ where: { id: sourceId } })
      if (!source) throw new Error("Исходный покупатель не найден")
      const target = await tx.customer.findUnique({ where: { id: targetId } })
      if (!target) throw new Error("Целевой покупатель не найден")

      const upd = await tx.supportTicket.updateMany({
        where: { customerId: sourceId },
        data: { customerId: targetId },
      })
      await tx.customer.delete({ where: { id: sourceId } })
      return upd.count
    })

    revalidatePath(`/support/customers/${targetId}`)
    revalidatePath("/support")
    return { ok: true, ticketsMoved }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Ошибка",
    }
  }
}

// 5. createManualMessengerTicket — ручное создание MESSENGER тикета (Telegram/WhatsApp/...)
const messengerTicketSchema = z
  .object({
    messengerType: z.enum(["TELEGRAM", "WHATSAPP", "OTHER"]),
    customerId: z.string().nullable(),
    customerName: z.string().trim().min(1).max(200).nullable(),
    messengerContact: z
      .string()
      .trim()
      .min(3, "Контакт короче 3 символов")
      .max(100),
    text: z.string().trim().min(1, "Текст пустой").max(10000),
    nmId: z.number().int().positive().nullable(),
  })
  .refine(
    (d) =>
      d.customerId !== null ||
      (d.customerName !== null && d.customerName.length > 0),
    {
      message: "Укажите существующего покупателя или имя нового",
    }
  )

export async function createManualMessengerTicket(
  input: z.input<typeof messengerTicketSchema>
): Promise<ActionResult & { ticketId?: string }> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    const userId = await getSessionUserId()
    if (!userId) return { ok: false, error: "Сессия без user.id" }

    const parsed = messengerTicketSchema.safeParse(input)
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Невалидные данные",
      }
    }
    const data = parsed.data

    const ticketId = await prisma.$transaction(async (tx) => {
      let customerId = data.customerId
      if (!customerId) {
        const c = await tx.customer.create({
          data: { name: data.customerName, phone: data.messengerContact },
        })
        customerId = c.id
      }
      const now = new Date()
      const ticket = await tx.supportTicket.create({
        data: {
          channel: "MESSENGER",
          messengerType: data.messengerType,
          messengerContact: data.messengerContact,
          customerId,
          nmId: data.nmId,
          status: "NEW",
          previewText: data.text.slice(0, 140),
          lastMessageAt: now,
        },
      })
      await tx.supportMessage.create({
        data: {
          ticketId: ticket.id,
          direction: "INBOUND",
          text: data.text,
          authorId: null,
          wbSentAt: now,
          sentAt: now,
        },
      })
      return ticket.id
    })

    revalidatePath("/support")
    revalidatePath(`/support/${ticketId}`)
    return { ok: true, ticketId }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Ошибка",
    }
  }
}
