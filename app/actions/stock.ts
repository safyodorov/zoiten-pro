// app/actions/stock.ts
// Phase 14: Server actions для управления остатками.
//
// Экспортирует:
// - upsertIvanovoStock: импорт остатков Иваново из Excel-preview (Plan 14-04)
// - updateProductionStock: inline-редактирование Производство (Plan 14-05, STOCK-13)
// - updateTurnoverNorm: сохранение нормы оборачиваемости в AppSetting (Plan 14-05, STOCK-14)

"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { revalidatePath } from "next/cache"

// ──────────────────────────────────────────────────────────────────
// upsertIvanovoStock — Plan 14-04 (заглушка, реализуется в 14-04)
// ──────────────────────────────────────────────────────────────────

export interface UpsertIvanovoRow {
  productId: string
  qty: number
}

export interface UpsertIvanovoResult {
  ok: true
  updated: number
}

export async function upsertIvanovoStock(
  rows: UpsertIvanovoRow[]
): Promise<UpsertIvanovoResult> {
  await requireSection("STOCK", "MANAGE")

  let updated = 0
  for (const row of rows) {
    await prisma.product.update({
      where: { id: row.productId },
      data: {
        ivanovoStock: row.qty,
        ivanovoStockUpdatedAt: new Date(),
      },
    })
    updated++
  }

  revalidatePath("/stock")
  return { ok: true, updated }
}

// ──────────────────────────────────────────────────────────────────
// Plan 14-05: updateProductionStock (STOCK-13)
// Inline-редактирование поля Производство (debounced 500ms от UI).
// Zod: int(0..99999) | null — для очистки поля.
// ──────────────────────────────────────────────────────────────────

const ProductionStockSchema = z.object({
  productId: z.string().min(1),
  value: z.number().int().min(0).max(99999).nullable(),
})

export async function updateProductionStock(
  productId: string,
  value: number | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSection("STOCK", "MANAGE")

  const parsed = ProductionStockSchema.safeParse({ productId, value })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" }
  }

  try {
    await prisma.product.update({
      where: { id: parsed.data.productId },
      data: {
        productionStock: parsed.data.value,
        productionStockUpdatedAt: new Date(),
      },
    })
    revalidatePath("/stock")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ──────────────────────────────────────────────────────────────────
// Plan 14-05: updateTurnoverNorm (STOCK-14)
// Сохраняет норму оборачиваемости в AppSetting KV (key='stock.turnoverNormDays').
// Zod: int(1..100) — допустимый диапазон дней.
// ──────────────────────────────────────────────────────────────────

const TurnoverNormSchema = z.object({
  days: z.number().int().min(1).max(100),
})

const TURNOVER_NORM_KEY = "stock.turnoverNormDays"

export async function updateTurnoverNorm(
  days: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSection("STOCK", "MANAGE")

  const parsed = TurnoverNormSchema.safeParse({ days })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Допустимо от 1 до 100 дней" }
  }

  try {
    await prisma.appSetting.upsert({
      where: { key: TURNOVER_NORM_KEY },
      create: { key: TURNOVER_NORM_KEY, value: String(parsed.data.days) },
      update: { value: String(parsed.data.days) },
    })
    revalidatePath("/stock")
    revalidatePath("/stock/wb")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
