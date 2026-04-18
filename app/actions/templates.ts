"use server"

// Server actions CRUD шаблонов ответов + Export/Import JSON.
// WB /api/v1/templates отключён 2025-11-19 — все операции локальные.
// Export/Import JSON заменяет WB sync (per user decision D-01).
// Все write-операции требуют SUPPORT+MANAGE (RBAC).

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { auth } from "@/lib/auth"

export type ActionOk = { ok: true }
export type ActionErr = { ok: false; error: string }
export type ActionResult = ActionOk | ActionErr
export type ActionResultWith<T> = ({ ok: true } & T) | ActionErr

// ── Zod схема ───────────────────────────────────────────────────
// channel ограничен FEEDBACK/QUESTION/CHAT — RETURN/MESSENGER не имеют локальных
// шаблонов (возвраты — через returns actions, мессенджеры — Phase 12 out of scope).

const templateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Имя короче 2 символов")
    .max(80, "Имя длиннее 80 символов"),
  text: z
    .string()
    .trim()
    .min(1, "Текст пустой")
    .max(5000, "Текст длиннее 5000 символов"),
  channel: z.enum(["FEEDBACK", "QUESTION", "CHAT"] as const, {
    message: "Канал должен быть FEEDBACK, QUESTION или CHAT",
  }),
  situationTag: z
    .string()
    .trim()
    .max(60, "Тег длиннее 60 символов")
    .nullable()
    .optional(),
  nmId: z.coerce.number().int().positive().nullable().optional(),
  isActive: z.boolean().default(true),
})

async function getSessionUserId(): Promise<string | null> {
  const session = await auth()
  return session?.user?.id ?? null
}

function isPrismaKnownError(
  err: unknown
): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError
}

// ── CRUD ────────────────────────────────────────────────────────

export async function createTemplate(
  input: z.input<typeof templateSchema>
): Promise<ActionResultWith<{ id: string }>> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    const userId = await getSessionUserId()
    const data = templateSchema.parse(input)

    const created = await prisma.responseTemplate.create({
      data: {
        name: data.name,
        text: data.text,
        channel: data.channel,
        situationTag: data.situationTag ?? null,
        nmId: data.nmId ?? null,
        isActive: data.isActive,
        createdById: userId,
        updatedById: userId,
      },
      select: { id: true },
    })

    revalidatePath("/support/templates")
    return { ok: true, id: created.id }
  } catch (err) {
    if (isPrismaKnownError(err) && err.code === "P2002") {
      return {
        ok: false,
        error: "Шаблон с таким именем уже существует в этом канале",
      }
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Ошибка",
    }
  }
}

export async function updateTemplate(
  id: string,
  input: z.input<typeof templateSchema>
): Promise<ActionResult> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    const userId = await getSessionUserId()
    const data = templateSchema.parse(input)

    await prisma.responseTemplate.update({
      where: { id },
      data: {
        name: data.name,
        text: data.text,
        channel: data.channel,
        situationTag: data.situationTag ?? null,
        nmId: data.nmId ?? null,
        isActive: data.isActive,
        updatedById: userId,
      },
    })

    revalidatePath("/support/templates")
    return { ok: true }
  } catch (err) {
    if (isPrismaKnownError(err)) {
      if (err.code === "P2025") return { ok: false, error: "Шаблон не найден" }
      if (err.code === "P2002") {
        return {
          ok: false,
          error: "Имя шаблона уже используется в этом канале",
        }
      }
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Ошибка",
    }
  }
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    // Hard delete — позволяет пересоздать имя после import (иначе @@unique
    // [name, channel] не даст upsert при восстановлении из JSON).
    await prisma.responseTemplate.delete({ where: { id } })
    revalidatePath("/support/templates")
    return { ok: true }
  } catch (err) {
    if (isPrismaKnownError(err) && err.code === "P2025") {
      return { ok: false, error: "Шаблон не найден" }
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Ошибка",
    }
  }
}

export async function toggleTemplateActive(
  id: string
): Promise<ActionResultWith<{ isActive: boolean }>> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    const current = await prisma.responseTemplate.findUnique({
      where: { id },
      select: { isActive: true },
    })
    if (!current) return { ok: false, error: "Шаблон не найден" }

    const updated = await prisma.responseTemplate.update({
      where: { id },
      data: { isActive: !current.isActive },
      select: { isActive: true },
    })
    revalidatePath("/support/templates")
    return { ok: true, isActive: updated.isActive }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Ошибка",
    }
  }
}

// ── Export / Import JSON ────────────────────────────────────────
// Заменяет WB sync (D-01) — WB Templates API отключён 2025-11-19.
// Формат: { version, exportedAt, templates: [{name, text, channel, situationTag, nmId, isActive}] }
// Без id/createdById/timestamps — переносимость между инсталляциями ERP.

const EXPORT_VERSION = 1

export async function exportTemplatesJson(): Promise<
  ActionResultWith<{ json: string }>
> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    const templates = await prisma.responseTemplate.findMany({
      where: { isActive: true },
      select: {
        name: true,
        text: true,
        channel: true,
        situationTag: true,
        nmId: true,
        isActive: true,
      },
      orderBy: [{ channel: "asc" }, { name: "asc" }],
    })
    const payload = {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      templates,
    }
    return { ok: true, json: JSON.stringify(payload, null, 2) }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Ошибка",
    }
  }
}

// Схема envelope — валидируем версию и оболочку, templates[] каждый элемент
// парсим отдельно, чтобы собирать errors[] и не падать на первой невалидной.
const importEnvelopeSchema = z.object({
  version: z.literal(EXPORT_VERSION),
  templates: z.array(z.unknown()),
})

const importItemSchema = templateSchema.extend({
  isActive: z.boolean().optional().default(true),
})

export async function importTemplatesJson(
  json: string
): Promise<
  ActionResultWith<{
    added: number
    updated: number
    errors: Array<{ name?: string; channel?: string; reason: string }>
  }>
> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    const userId = await getSessionUserId()

    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      return { ok: false, error: "Невалидный JSON" }
    }

    const envelope = importEnvelopeSchema.safeParse(parsed)
    if (!envelope.success) {
      const msg = envelope.error.issues[0]?.message ?? "Неподдерживаемый формат"
      return {
        ok: false,
        error: `Неподдерживаемый формат: ${msg.slice(0, 200)}`,
      }
    }

    let added = 0
    let updated = 0
    const errors: Array<{ name?: string; channel?: string; reason: string }> =
      []

    for (const raw of envelope.data.templates) {
      const itemResult = importItemSchema.safeParse(raw)
      if (!itemResult.success) {
        const rawRecord =
          raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
        const rawName =
          typeof rawRecord.name === "string" ? rawRecord.name : undefined
        const rawChannel =
          typeof rawRecord.channel === "string" ? rawRecord.channel : undefined
        errors.push({
          name: rawName,
          channel: rawChannel,
          reason: itemResult.error.issues[0]?.message ?? "Невалидная запись",
        })
        continue
      }
      const data = itemResult.data
      try {
        const result = await prisma.responseTemplate.upsert({
          where: { name_channel: { name: data.name, channel: data.channel } },
          create: {
            name: data.name,
            text: data.text,
            channel: data.channel,
            situationTag: data.situationTag ?? null,
            nmId: data.nmId ?? null,
            isActive: data.isActive,
            createdById: userId,
            updatedById: userId,
          },
          update: {
            text: data.text,
            situationTag: data.situationTag ?? null,
            nmId: data.nmId ?? null,
            isActive: data.isActive,
            updatedById: userId,
          },
          select: { createdAt: true, updatedAt: true },
        })
        // upsert не различает insert/update — сравниваем timestamps
        // (в insert createdAt === updatedAt, в update updatedAt > createdAt).
        if (result.createdAt.getTime() === result.updatedAt.getTime()) {
          added++
        } else {
          updated++
        }
      } catch (err) {
        errors.push({
          name: data.name,
          channel: data.channel,
          reason: err instanceof Error ? err.message : "Ошибка БД",
        })
      }
    }

    revalidatePath("/support/templates")
    return { ok: true, added, updated, errors }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Ошибка",
    }
  }
}
