"use server"

// Server actions трекера обжалований отзывов (Phase 11 Plan 04).
// WB API POST /api/v1/feedbacks/actions отключён 2025-12-08 — все операции локальные.
// Менеджер создаёт запись + подаёт жалобу в ЛК WB вручную (hybrid manual workflow).
// SUP-30 (cron polling) НЕ реализован — нет WB GET API для опроса статуса жалобы.

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { auth } from "@/lib/auth"
import { APPEAL_REASONS } from "@/lib/appeal-reasons"

export type ActionOk = { ok: true }
export type ActionErr = { ok: false; error: string }
export type ActionResult = ActionOk | ActionErr
export type ActionResultWith<T> = ({ ok: true } & T) | ActionErr

async function getSessionUserId(): Promise<string | null> {
  const session = await auth()
  return session?.user?.id ?? null
}

// ── createAppeal ────────────────────────────────────────────────

const createAppealSchema = z.object({
  ticketId: z.string().min(1, "ticketId обязателен"),
  reason: z.enum(APPEAL_REASONS, {
    message: "Недопустимая причина обжалования",
  }),
  text: z
    .string()
    .trim()
    .min(10, "Минимум 10 символов")
    .max(1000, "Максимум 1000 символов"),
})

export async function createAppeal(
  input: z.input<typeof createAppealSchema>
): Promise<ActionResultWith<{ id: string }>> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    const userId = await getSessionUserId()
    if (!userId) return { ok: false, error: "Сессия без user.id" }

    const data = createAppealSchema.parse(input)

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: data.ticketId },
      select: {
        id: true,
        channel: true,
        status: true,
        appealRecord: { select: { id: true } },
      },
    })
    if (!ticket) return { ok: false, error: "Тикет не найден" }
    if (ticket.channel !== "FEEDBACK") {
      return { ok: false, error: "Обжаловать можно только отзывы" }
    }
    if (ticket.appealRecord) {
      return { ok: false, error: "Обжалование уже создано" }
    }

    // Транзакция callback — нужен record.id для обновления ticket.appealId
    const record = await prisma.$transaction(async (tx) => {
      const r = await tx.appealRecord.create({
        data: {
          ticketId: data.ticketId,
          reason: data.reason,
          text: data.text,
          status: "PENDING",
          createdById: userId,
        },
      })
      await tx.supportTicket.update({
        where: { id: data.ticketId },
        data: {
          status: "APPEALED",
          appealStatus: "PENDING",
          appealedAt: new Date(),
          appealId: r.id,
        },
      })
      return r
    })

    revalidatePath("/support")
    revalidatePath(`/support/${data.ticketId}`)
    return { ok: true, id: record.id }
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return { ok: false, error: "Обжалование уже создано" }
    }
    if (err instanceof z.ZodError) {
      const first = err.issues[0]
      return { ok: false, error: first?.message ?? "Ошибка валидации" }
    }
    const msg =
      err instanceof Error
        ? err.message === "FORBIDDEN"
          ? "Недостаточно прав"
          : err.message === "UNAUTHORIZED"
            ? "Не авторизован"
            : err.message
        : "Неизвестная ошибка"
    return { ok: false, error: msg }
  }
}

// ── updateAppealStatus ──────────────────────────────────────────

const updateAppealStatusSchema = z.object({
  appealId: z.string().min(1, "appealId обязателен"),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"] as const, {
    message: "Статус должен быть PENDING, APPROVED или REJECTED",
  }),
})

export async function updateAppealStatus(
  input: z.input<typeof updateAppealStatusSchema>
): Promise<ActionResult> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    const userId = await getSessionUserId()
    if (!userId) return { ok: false, error: "Сессия без user.id" }

    const data = updateAppealStatusSchema.parse(input)

    const record = await prisma.appealRecord.findUnique({
      where: { id: data.appealId },
      select: { id: true, ticketId: true },
    })
    if (!record) {
      return { ok: false, error: "Запись обжалования не найдена" }
    }

    const resolved = data.status !== "PENDING"
    const resolvedAt: Date | null = resolved ? new Date() : null
    const resolvedById: string | null = resolved ? userId : null

    await prisma.$transaction([
      prisma.appealRecord.update({
        where: { id: data.appealId },
        data: {
          status: data.status,
          appealResolvedAt: resolvedAt,
          resolvedById,
        },
      }),
      prisma.supportTicket.update({
        where: { id: record.ticketId },
        data: {
          appealStatus: data.status,
          appealResolvedAt: resolvedAt,
        },
      }),
    ])

    revalidatePath("/support")
    revalidatePath(`/support/${record.ticketId}`)
    return { ok: true }
  } catch (err) {
    if (err instanceof z.ZodError) {
      const first = err.issues[0]
      return { ok: false, error: first?.message ?? "Ошибка валидации" }
    }
    const msg =
      err instanceof Error
        ? err.message === "FORBIDDEN"
          ? "Недостаточно прав"
          : err.message === "UNAUTHORIZED"
            ? "Не авторизован"
            : err.message
        : "Неизвестная ошибка"
    return { ok: false, error: msg }
  }
}
