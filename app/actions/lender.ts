// app/actions/lender.ts
// Server Actions для CRUD справочника Lender («Кредитор»)
// Phase 21 (Credits) — U-03 переименование Bank→Lender, паттерн reference.ts
"use server"

import { requireSuperadmin } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { revalidatePath } from "next/cache"

// ── Types ─────────────────────────────────────────────────────────

type ActionResult = { ok: true } | { ok: false; error: string }
type CreateResult = { ok: true; id: string } | { ok: false; error: string }

// ── Schemas ────────────────────────────────────────────────────────

const LenderNameSchema = z.string().min(1, "Название кредитора не может быть пустым").max(100)

// ── Error handler helper ──────────────────────────────────────────

function handleAuthError(e: unknown): { ok: false; error: string } | null {
  if (e instanceof Error) {
    if (e.message === "UNAUTHORIZED") return { ok: false, error: "Не авторизован" }
    if (e.message === "FORBIDDEN") return { ok: false, error: "Нет доступа" }
  }
  return null
}

// ── createLender ──────────────────────────────────────────────────

export async function createLender(name: string): Promise<CreateResult> {
  try {
    await requireSuperadmin()
    const parsedName = LenderNameSchema.parse(name)

    const maxOrder = await prisma.lender.aggregate({ _max: { sortOrder: true } })
    const lender = await prisma.lender.create({
      data: {
        name: parsedName,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    })

    revalidatePath("/admin/settings")
    revalidatePath("/credits")
    return { ok: true, id: lender.id }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2002") {
      return { ok: false, error: "Кредитор с таким названием уже существует" }
    }
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Ошибка валидации" }
    }
    console.error("createLender error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── updateLender ──────────────────────────────────────────────────

export async function updateLender(id: string, name: string): Promise<ActionResult> {
  try {
    await requireSuperadmin()
    const parsedName = LenderNameSchema.parse(name)

    await prisma.lender.update({
      where: { id },
      data: { name: parsedName },
    })

    revalidatePath("/admin/settings")
    revalidatePath("/credits")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2002") {
      return { ok: false, error: "Кредитор с таким названием уже существует" }
    }
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Кредитор не найден" }
    }
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Ошибка валидации" }
    }
    console.error("updateLender error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── deleteLender ──────────────────────────────────────────────────

/**
 * Удаляет кредитора.
 * FK Restrict: если есть связанные Loan → Prisma кинет P2003 → user-friendly message.
 */
export async function deleteLender(id: string): Promise<ActionResult> {
  try {
    await requireSuperadmin()

    await prisma.lender.delete({ where: { id } })

    revalidatePath("/admin/settings")
    revalidatePath("/credits")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2003") {
      return { ok: false, error: "Нельзя удалить кредитора с кредитами" }
    }
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Кредитор не найден" }
    }
    console.error("deleteLender error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── reorderLenders ────────────────────────────────────────────────

export async function reorderLenders(ids: string[]): Promise<ActionResult> {
  try {
    await requireSuperadmin()

    await prisma.$transaction(
      ids.map((id, i) =>
        prisma.lender.update({ where: { id }, data: { sortOrder: i } })
      )
    )

    revalidatePath("/admin/settings")
    revalidatePath("/credits")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    console.error("reorderLenders error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}
