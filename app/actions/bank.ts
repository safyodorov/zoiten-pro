// app/actions/bank.ts
// Server Actions для операций с банковскими счетами.
// Phase 22 (22-04): categorizeTx — inline-категоризация операции.
"use server"

import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import type { TxCategory } from "@prisma/client"

// ── Types ─────────────────────────────────────────────────────────

type ActionResult = { ok: true } | { ok: false; error: string }

// ── Error handler helper ──────────────────────────────────────────

function handleAuthError(e: unknown): { ok: false; error: string } | null {
  if (e instanceof Error) {
    if (e.message === "UNAUTHORIZED") return { ok: false, error: "Не авторизован" }
    if (e.message === "FORBIDDEN") return { ok: false, error: "Нет доступа" }
  }
  return null
}

// ── Допустимые категории ──────────────────────────────────────────

const VALID_CATEGORIES: TxCategory[] = [
  "UNCATEGORIZED",
  "INTERNAL_TRANSFER",
  "BANK_FEE",
  "SUPPLIER_PAYMENT",
  "INCOME",
  "TAX",
  "LOAN",
  "OTHER",
]

// ── categorizeTx ─────────────────────────────────────────────────

/**
 * Сохраняет категорию банковской операции (inline-редактирование в таблице).
 * Требует роль MANAGE в разделе BANK.
 */
export async function categorizeTx(id: string, category: string): Promise<ActionResult> {
  try {
    await requireSection("BANK", "MANAGE")

    if (!VALID_CATEGORIES.includes(category as TxCategory)) {
      return { ok: false, error: "Недопустимая категория" }
    }

    await prisma.bankTransaction.update({
      where: { id },
      data: { category: category as TxCategory },
    })

    revalidatePath("/bank")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Операция не найдена" }
    }
    console.error("categorizeTx error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── updateTxComment ──────────────────────────────────────────────

/**
 * Сохраняет ручной комментарий банковской операции (управленческий учёт).
 * Пустая строка → null. Требует роль MANAGE в разделе BANK.
 */
export async function updateTxComment(id: string, comment: string): Promise<ActionResult> {
  try {
    await requireSection("BANK", "MANAGE")

    const trimmed = comment.trim()
    await prisma.bankTransaction.update({
      where: { id },
      data: { comment: trimmed === "" ? null : trimmed },
    })

    revalidatePath("/bank")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Операция не найдена" }
    }
    console.error("updateTxComment error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}
