// app/actions/cash.ts
// Server Actions для CRUD операций кассы.
// Phase 23 (23-04): createCashEntry / updateCashEntry / deleteCashEntry /
//                   categorizeCashEntry / updateCashComment
"use server"

import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { revalidatePath } from "next/cache"

// ── Types ─────────────────────────────────────────────────────────

type ActionResult = { ok: true } | { ok: false; error: string }
type CreateResult = { ok: true; id: string } | { ok: false; error: string }

// ── Error handler helper ──────────────────────────────────────────

function handleAuthError(e: unknown): { ok: false; error: string } | null {
  if (e instanceof Error) {
    if (e.message === "UNAUTHORIZED") return { ok: false, error: "Не авторизован" }
    if (e.message === "FORBIDDEN") return { ok: false, error: "Нет доступа" }
  }
  return null
}

// ── Schemas ────────────────────────────────────────────────────────

const EntrySchema = z.object({
  date: z.string().min(1),                            // ISO YYYY-MM-DD
  direction: z.enum(["INCOME", "EXPENSE"]),
  amount: z.number().positive(),
  department: z.string().max(100).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  purpose: z.string().min(1, "Укажите назначение").max(2000),
  responsibleEmployeeId: z.string().nullable().optional(),
  comment: z.string().max(2000).nullable().optional(),
  fund: z.enum(["yulya", "pavel"]).default("yulya"),  // касса/фонд
})

const UpdateEntrySchema = EntrySchema.extend({ id: z.string().min(1) })

/** Касса/фонд → значение source. Юля = «manual» (попадает в yulya-вид), Павел = «budget-pavel». */
function fundToSource(fund: "yulya" | "pavel"): string {
  return fund === "pavel" ? "budget-pavel" : "manual"
}

// ── createCashEntry ────────────────────────────────────────────────

/**
 * Создаёт кассовую операцию (ручной ввод).
 * source = "manual"; fingerprint = null (не участвует в дедупе импорта).
 * Требует роль MANAGE в разделе CASH.
 */
export async function createCashEntry(
  data: z.infer<typeof EntrySchema>,
): Promise<CreateResult> {
  try {
    await requireSection("CASH", "MANAGE")
    const parsed = EntrySchema.parse(data)

    const entry = await prisma.cashEntry.create({
      data: {
        date: new Date(parsed.date),
        direction: parsed.direction,
        amount: parsed.amount,
        department: parsed.department ?? null,
        categoryId: parsed.categoryId ?? null,
        purpose: parsed.purpose,
        responsibleEmployeeId: parsed.responsibleEmployeeId ?? null,
        responsibleNameRaw: null,
        comment: parsed.comment ?? null,
        source: fundToSource(parsed.fund),
        fingerprint: null,
      },
    })

    revalidatePath("/cash")
    return { ok: true, id: entry.id }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Ошибка валидации" }
    }
    console.error("createCashEntry error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── updateCashEntry ────────────────────────────────────────────────

/**
 * Обновляет кассовую операцию (полное редактирование).
 * Требует роль MANAGE в разделе CASH.
 */
export async function updateCashEntry(
  data: z.infer<typeof UpdateEntrySchema>,
): Promise<ActionResult> {
  try {
    await requireSection("CASH", "MANAGE")
    const parsed = UpdateEntrySchema.parse(data)

    await prisma.cashEntry.update({
      where: { id: parsed.id },
      data: {
        date: new Date(parsed.date),
        direction: parsed.direction,
        amount: parsed.amount,
        department: parsed.department ?? null,
        categoryId: parsed.categoryId ?? null,
        purpose: parsed.purpose,
        responsibleEmployeeId: parsed.responsibleEmployeeId ?? null,
        comment: parsed.comment ?? null,
        source: fundToSource(parsed.fund),
      },
    })

    revalidatePath("/cash")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Ошибка валидации" }
    }
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Запись не найдена" }
    }
    console.error("updateCashEntry error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── deleteCashEntry ────────────────────────────────────────────────

/**
 * Удаляет кассовую операцию.
 * Требует роль MANAGE в разделе CASH.
 */
export async function deleteCashEntry(id: string): Promise<ActionResult> {
  try {
    await requireSection("CASH", "MANAGE")

    await prisma.cashEntry.delete({ where: { id } })

    revalidatePath("/cash")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Запись не найдена" }
    }
    console.error("deleteCashEntry error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── categorizeCashEntry ────────────────────────────────────────────

/**
 * Inline-сохранение категории кассовой операции.
 * Пустая строка → null (снять категорию). Требует роль MANAGE в разделе CASH.
 */
export async function categorizeCashEntry(
  id: string,
  categoryId: string | null,
): Promise<ActionResult> {
  try {
    await requireSection("CASH", "MANAGE")

    await prisma.cashEntry.update({
      where: { id },
      data: { categoryId: categoryId === "" ? null : categoryId },
    })

    revalidatePath("/cash")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Запись не найдена" }
    }
    console.error("categorizeCashEntry error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── updateCashComment ──────────────────────────────────────────────

/**
 * Сохраняет ручной комментарий кассовой операции.
 * Пустая строка → null. Требует роль MANAGE в разделе CASH.
 */
export async function updateCashComment(id: string, comment: string): Promise<ActionResult> {
  try {
    await requireSection("CASH", "MANAGE")

    const trimmed = comment.trim()
    await prisma.cashEntry.update({
      where: { id },
      data: { comment: trimmed === "" ? null : trimmed },
    })

    revalidatePath("/cash")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Запись не найдена" }
    }
    console.error("updateCashComment error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}
