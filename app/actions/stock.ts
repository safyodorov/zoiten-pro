// app/actions/stock.ts
// Phase 14: Server actions для управления остатками.
//
// Экспортирует:
// - upsertIvanovoStock: импорт остатков Иваново из Excel-preview (Plan 14-04)
// - updateProductionArrivalDate: inline-редактирование даты прихода Производства
// - updateIvanovoStock: inline-редактирование остатка Иваново
// - updateTurnoverNorm: сохранение нормы оборачиваемости в AppSetting (Plan 14-05, STOCK-14)
//
// Количество Производства (ProductIncoming.orderedQty) machine-managed из закупок
// (lib/production-sync.ts, quick 260702-j52) — ручной редактор количества удалён.

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
// Производство = ProductIncoming (2026-06-04): единый источник с Планом
// закупок/продаж. Количество (orderedQty) считается автоматически из открытых
// закупок (lib/production-sync.ts); вручную редактируется только дата прихода
// (expectedDate). plannedSalesPerDay сохраняется.
// Синхронизация: /stock ↔ /purchase-plan ↔ /sales-plan.
// ──────────────────────────────────────────────────────────────────

function revalidateProductionLinked() {
  revalidatePath("/stock")
  revalidatePath("/purchase-plan")
  revalidatePath("/sales-plan")
}

const ArrivalDateSchema = z.object({
  productId: z.string().min(1),
  dateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
})

/** Дата прихода Производства на склад Иваново → ProductIncoming.expectedDate (null чистит). */
export async function updateProductionArrivalDate(
  productId: string,
  dateIso: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSection("STOCK", "MANAGE")

  const parsed = ArrivalDateSchema.safeParse({ productId, dateIso })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Невалидная дата" }
  }

  const expectedDate = parsed.data.dateIso ? new Date(parsed.data.dateIso) : null
  if (expectedDate && Number.isNaN(expectedDate.getTime())) {
    return { ok: false, error: "Невалидная дата" }
  }

  try {
    await prisma.productIncoming.upsert({
      where: { productId: parsed.data.productId },
      create: { productId: parsed.data.productId, orderedQty: 0, expectedDate },
      update: { expectedDate },
    })
    revalidateProductionLinked()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ──────────────────────────────────────────────────────────────────
// updateIvanovoStock (2026-06-04): ручной ввод остатка Иваново (inline).
// Глобально в Product.ivanovoStock (тот же столбец, что и Excel-импорт).
// ──────────────────────────────────────────────────────────────────

const IvanovoStockSchema = z.object({
  productId: z.string().min(1),
  value: z.number().int().min(0).max(999999).nullable(),
})

export async function updateIvanovoStock(
  productId: string,
  value: number | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSection("STOCK", "MANAGE")

  const parsed = IvanovoStockSchema.safeParse({ productId, value })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" }
  }

  try {
    await prisma.product.update({
      where: { id: parsed.data.productId },
      data: { ivanovoStock: parsed.data.value, ivanovoStockUpdatedAt: new Date() },
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
