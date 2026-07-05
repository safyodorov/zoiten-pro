// app/actions/cashflow.ts
// Phase 28-03: Server actions для управления допущениями ПДДС.
//
// Экспортирует:
// - updateCashflowSetting: обновить одно допущение (debounced из CashflowAssumptionsBar)
//
// Чистые Zod-схемы и whitelist ключей: см. lib/cashflow-schemas.ts
// (вынесены, потому что "use server" файлы не могут экспортировать синхронные значения).
//
// Паттерн: app/actions/pricing.ts (ActionResult, handleAuthError, updateAppSetting).

"use server"

import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { revalidatePath } from "next/cache"
import { cashflowSettingSchema } from "@/lib/cashflow-schemas"

// ──────────────────────────────────────────────────────────────────
// Result type
// ──────────────────────────────────────────────────────────────────

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string }

// ──────────────────────────────────────────────────────────────────
// Error handler helper — нормализует UNAUTHORIZED/FORBIDDEN → русские сообщения
// ──────────────────────────────────────────────────────────────────

function handleAuthError(e: unknown): { ok: false; error: string } | null {
  if (e instanceof Error) {
    if (e.message === "UNAUTHORIZED") return { ok: false, error: "Не авторизован" }
    if (e.message === "FORBIDDEN")
      return { ok: false, error: "Нет доступа к разделу «Финансы»" }
  }
  return null
}

// ──────────────────────────────────────────────────────────────────
// Actions
// ──────────────────────────────────────────────────────────────────

/**
 * Обновить одно допущение ПДДС.
 * Debounced из CashflowAssumptionsBar (500ms), MANAGE-гейт, Zod-валидация, upsert по ключу.
 * T-28-07: VIEW-пользователь отклоняется на сервере (двойная защита — бар не рендерится).
 * T-28-08: allow-list + per-ключ границы через cashflowSettingSchema.
 */
export async function updateCashflowSetting(
  key: string,
  value: string,
): Promise<ActionResult> {
  try {
    await requireSection("FINANCE", "MANAGE")
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    return { ok: false, error: (e as Error).message }
  }

  const parsed = cashflowSettingSchema.safeParse({ key, value })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  try {
    // AppSetting: колонки key/value/updatedAt (createdAt НЕТ в схеме)
    await prisma.appSetting.upsert({
      where: { key: parsed.data.key },
      create: { key: parsed.data.key, value: parsed.data.value, updatedAt: new Date() },
      update: { value: parsed.data.value, updatedAt: new Date() },
    })

    revalidatePath("/finance/cashflow")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
