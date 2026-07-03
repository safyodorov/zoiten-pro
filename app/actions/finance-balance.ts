// app/actions/finance-balance.ts
// Phase 24 Plan 24-08 — управляющий слой раздела «Финансы → Баланс».
//
// Экспортирует (все async — Next.js 15 "use server" ограничение):
// - recalcBalanceDate: переоценка FinanceStockSnapshot.costPriceAtDate/valueRub по текущей
//   ProductCost на выбранную дату (D-04). qty НЕ меняется — количества снапшота неизменяемы
//   (задним числом не восстановимы). Balance API НЕ вызывается (Pitfall 6, 24-RESEARCH.md):
//   дебиторка WB отдаёт только «сейчас», прошлую дату переоценить нечем.
// - saveFinanceAdjustment / deleteFinanceAdjustment: CRUD ручных статей (D-08). Редактирование
//   финансовых полей (amountRub/type/effectiveFrom) существующей статьи ВЕРСИОНИРУЕТ —
//   закрывает старую запись (deletedAt = новый effectiveFrom) и создаёт новую версию, вместо
//   мутации прошлого (m8) — прошлые балансы (asOf < новой effectiveFrom) продолжают видеть
//   старую сумму через окно effectiveFrom<=asOf AND (deletedAt=null OR deletedAt>asOf) из 24-05.
// - saveTaxRates: AppSetting finance.vatPct / finance.incomeTaxPct (D-15).
// - saveTaxPeriodActual: upsert факта НДС/налога per закрытый квартал (D-17).
//
// Чистые Zod-схемы: см. lib/finance-balance-schemas.ts (вынесены — "use server" файлы
// не могут экспортировать синхронные значения).

"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import {
  adjustmentSchema,
  taxRatesSchema,
  taxPeriodActualSchema,
} from "@/lib/finance-balance-schemas"

// ──────────────────────────────────────────────────────────────────
// Result type
// ──────────────────────────────────────────────────────────────────

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ──────────────────────────────────────────────────────────────────
// Error handler helper — нормализует UNAUTHORIZED/FORBIDDEN → русские сообщения
// ──────────────────────────────────────────────────────────────────

function handleAuthError(e: unknown): { ok: false; error: string } | null {
  if (e instanceof Error) {
    if (e.message === "UNAUTHORIZED") return { ok: false, error: "Не авторизован" }
    if (e.message === "FORBIDDEN") return { ok: false, error: "Нет доступа к разделу «Финансы» (требуется управление)" }
  }
  return null
}

async function getSessionUserId(): Promise<string | null> {
  const session = await auth()
  return session?.user?.id ?? null
}

// ──────────────────────────────────────────────────────────────────
// D-04: Пересчитать дату
// ──────────────────────────────────────────────────────────────────

/**
 * Переоценивает FinanceStockSnapshot.costPriceAtDate/valueRub на дату dateStr по текущей
 * ProductCost.costPrice. qty НЕ трогается (снапшот количества неизменяем). НЕ вызывает
 * WB Balance API (дебиторку прошлой даты восстановить нельзя, Pitfall 6).
 */
export async function recalcBalanceDate(dateStr: string): Promise<ActionResult> {
  try {
    await requireSection("FINANCE", "MANAGE")
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    return { ok: false, error: (e as Error).message }
  }

  if (!DATE_RE.test(dateStr)) {
    return { ok: false, error: "Некорректная дата" }
  }

  try {
    const date = new Date(dateStr)

    const rows = await prisma.financeStockSnapshot.findMany({
      where: { date },
      select: { id: true, productId: true, qty: true },
    })

    if (rows.length === 0) {
      return { ok: false, error: "Нет снапшота остатков на эту дату" }
    }

    const productIds = [...new Set(rows.map((r) => r.productId))]
    const costs = await prisma.productCost.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, costPrice: true },
    })
    const costMap = new Map(costs.map((c) => [c.productId, c.costPrice]))

    // Батч переоценки: qty неизменяемы (D-04), обновляем только costPriceAtDate/valueRub.
    await prisma.$transaction(
      rows.map((row) => {
        const newCost = costMap.get(row.productId) ?? null
        const valueRub = newCost != null ? round2(row.qty * newCost) : null
        return prisma.financeStockSnapshot.update({
          where: { id: row.id },
          data: { costPriceAtDate: newCost, valueRub },
        })
      })
    )

    revalidatePath("/finance/balance")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ──────────────────────────────────────────────────────────────────
// D-08: Ручные корректировочные статьи (CRUD)
// ──────────────────────────────────────────────────────────────────

/**
 * Создать или отредактировать ручную статью (D-08).
 * - Без id → create.
 * - С id, меняются amountRub/type/effectiveFrom (m8, НЕ мутировать прошлое ретроактивно):
 *   версионирование — закрыть старую запись (deletedAt = новый effectiveFrom) + создать
 *   новую версию с новыми значениями. Прошлые балансы продолжают видеть старую сумму.
 *   Валидация: новый effectiveFrom >= старого effectiveFrom.
 * - С id, меняются ТОЛЬКО label/comment → in-place update без версии.
 */
export async function saveFinanceAdjustment(
  input: z.infer<typeof adjustmentSchema>
): Promise<ActionResult> {
  try {
    await requireSection("FINANCE", "MANAGE")
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    return { ok: false, error: (e as Error).message }
  }

  const parsed = adjustmentSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }
  const data = parsed.data

  try {
    const userId = await getSessionUserId()

    // ── Create ──────────────────────────────────────────────────────────
    if (!data.id) {
      await prisma.financeManualAdjustment.create({
        data: {
          label: data.label,
          type: data.type,
          amountRub: data.amountRub,
          effectiveFrom: new Date(data.effectiveFrom),
          comment: data.comment ?? null,
          createdById: userId,
        },
      })
      revalidatePath("/finance/balance")
      return { ok: true }
    }

    // ── Edit существующей статьи ────────────────────────────────────────
    const existing = await prisma.financeManualAdjustment.findUnique({
      where: { id: data.id },
    })
    if (!existing) {
      return { ok: false, error: "Статья не найдена" }
    }

    const newEffectiveFrom = new Date(data.effectiveFrom)
    const financialFieldsChanged =
      Number(existing.amountRub) !== data.amountRub ||
      existing.type !== data.type ||
      existing.effectiveFrom.getTime() !== newEffectiveFrom.getTime()

    if (!financialFieldsChanged) {
      // Только label/comment — не влияют на суммы/даты, in-place допустимо.
      await prisma.financeManualAdjustment.update({
        where: { id: data.id },
        data: { label: data.label, comment: data.comment ?? null },
      })
      revalidatePath("/finance/balance")
      return { ok: true }
    }

    // m8 — версионирование: нельзя версионировать раньше начала текущей версии.
    if (newEffectiveFrom.getTime() < existing.effectiveFrom.getTime()) {
      return {
        ok: false,
        error: "Новая дата не может быть раньше даты начала действующей версии статьи",
      }
    }

    await prisma.$transaction([
      // Закрыть старую версию: действовала до новой effectiveFrom.
      prisma.financeManualAdjustment.update({
        where: { id: data.id },
        data: { deletedAt: newEffectiveFrom },
      }),
      // Создать новую версию с новыми значениями.
      prisma.financeManualAdjustment.create({
        data: {
          label: data.label,
          type: data.type,
          amountRub: data.amountRub,
          effectiveFrom: newEffectiveFrom,
          comment: data.comment ?? null,
          createdById: userId,
        },
      }),
    ])

    revalidatePath("/finance/balance")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Снять ручную статью (soft delete — «действовала до сейчас»). */
export async function deleteFinanceAdjustment(id: string): Promise<ActionResult> {
  try {
    await requireSection("FINANCE", "MANAGE")
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    return { ok: false, error: (e as Error).message }
  }

  if (!id || id.length === 0) {
    return { ok: false, error: "id обязателен" }
  }

  try {
    await prisma.financeManualAdjustment.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    revalidatePath("/finance/balance")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ──────────────────────────────────────────────────────────────────
// D-15: Ставки НДС/налога на доходы
// ──────────────────────────────────────────────────────────────────

/** Сохранить ставки НДС/налога на доходы (AppSetting finance.vatPct/finance.incomeTaxPct). */
export async function saveTaxRates(
  input: z.infer<typeof taxRatesSchema>
): Promise<ActionResult> {
  try {
    await requireSection("FINANCE", "MANAGE")
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    return { ok: false, error: (e as Error).message }
  }

  const parsed = taxRatesSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  try {
    await prisma.$transaction([
      prisma.appSetting.upsert({
        where: { key: "finance.vatPct" },
        create: { key: "finance.vatPct", value: String(parsed.data.vatPct) },
        update: { value: String(parsed.data.vatPct) },
      }),
      prisma.appSetting.upsert({
        where: { key: "finance.incomeTaxPct" },
        create: { key: "finance.incomeTaxPct", value: String(parsed.data.incomeTaxPct) },
        update: { value: String(parsed.data.incomeTaxPct) },
      }),
    ])
    revalidatePath("/finance/balance")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ──────────────────────────────────────────────────────────────────
// D-17: Факт НДС/налога per закрытый квартал
// ──────────────────────────────────────────────────────────────────

/** Сохранить факт НДС/налога за закрытый квартал (перекрывает расчёт в балансе). */
export async function saveTaxPeriodActual(
  input: z.infer<typeof taxPeriodActualSchema>
): Promise<ActionResult> {
  try {
    await requireSection("FINANCE", "MANAGE")
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    return { ok: false, error: (e as Error).message }
  }

  const parsed = taxPeriodActualSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  try {
    const userId = await getSessionUserId()
    await prisma.financeTaxPeriodActual.upsert({
      where: {
        year_quarter: { year: parsed.data.year, quarter: parsed.data.quarter },
      },
      create: {
        year: parsed.data.year,
        quarter: parsed.data.quarter,
        vatActualRub: parsed.data.vatActualRub,
        incomeTaxActualRub: parsed.data.incomeTaxActualRub,
        updatedById: userId,
      },
      update: {
        vatActualRub: parsed.data.vatActualRub,
        incomeTaxActualRub: parsed.data.incomeTaxActualRub,
        updatedById: userId,
      },
    })
    revalidatePath("/finance/balance")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
