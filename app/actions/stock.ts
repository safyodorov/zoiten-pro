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
// upsertIvanovoStock — Plan 14-04 (реализация)
// Вызывается из IvanovoUploadDialog.tsx после подтверждения пользователем.
// Принимает rows из preview-ответа API route (sku-based, не productId).
// ──────────────────────────────────────────────────────────────────

const IvanovoRowSchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().int().min(0).max(999999),
})

export type UpsertIvanovoResult = {
  imported: number
  notFound: string[]        // SKU которых нет в БД (race condition после preview)
  errors: Array<{ sku: string; error: string }>
}

/**
 * Применяет остатки склада Иваново из Excel к таблице Product (by SKU).
 * Требует STOCK MANAGE. Транзакция — при ошибке одной строки остальные сохраняются.
 */
export async function upsertIvanovoStock(
  rows: Array<{ sku: string; quantity: number }>,
): Promise<UpsertIvanovoResult> {
  await requireSection("STOCK", "MANAGE")

  // Валидируем каждую строку через Zod
  const validRows: Array<z.infer<typeof IvanovoRowSchema>> = []
  const errors: Array<{ sku: string; error: string }> = []

  for (const row of rows) {
    const parsed = IvanovoRowSchema.safeParse(row)
    if (parsed.success) {
      validRows.push(parsed.data)
    } else {
      errors.push({ sku: row.sku ?? "(нет)", error: parsed.error.message })
    }
  }

  const result: UpsertIvanovoResult = { imported: 0, notFound: [], errors }
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    for (const row of validRows) {
      try {
        const updated = await tx.product.updateMany({
          where: { sku: row.sku, deletedAt: null },
          data: {
            ivanovoStock: row.quantity,
            ivanovoStockUpdatedAt: now,
          },
        })
        if (updated.count === 0) {
          result.notFound.push(row.sku)
        } else {
          result.imported += updated.count
        }
      } catch (e) {
        result.errors.push({ sku: row.sku, error: (e as Error).message })
      }
    }
  })

  revalidatePath("/stock")
  return result
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
