// app/actions/pricing.ts
// Phase 7: Server actions для управления ценами WB.
//
// Экспортирует (все async — Next.js 15 "use server" ограничение):
// - updateAppSetting: обновить одну глобальную ставку (debounced из GlobalRatesBar)
// - getPricingSettings: прочитать все глобальные ставки (для init + lazy-seed fallback)
// - saveCalculatedPrice: upsert расчётной цены в слот 1/2/3
// - updateProductOverride: Product.drrOverridePct / defectRateOverridePct (чекбокс «только этот товар»)
// - updateSubcategoryDefault: Subcategory.defaultDrrPct (для всех товаров подкатегории)
// - updateCategoryDefault: Category.defaultDefectRatePct (для всех товаров категории)
// - updateProductDelivery: Product.deliveryCostRub (всегда per-product, без scope выбора — D-14)
//
// Чистые Zod-схемы и whitelist ключей: см. lib/pricing-schemas.ts
// (вынесены, потому что "use server" файлы не могут экспортировать синхронные значения).

"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { revalidatePath } from "next/cache"
import {
  APP_SETTING_KEYS,
  APP_SETTING_DEFAULTS,
  type AppSettingKey,
  isValidAppSettingKey,
  appSettingValueSchema,
  saveCalculatedPriceSchema,
  updateProductOverrideSchema,
} from "@/lib/pricing-schemas"

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
    if (e.message === "FORBIDDEN") return { ok: false, error: "Нет доступа к разделу «Управление ценами»" }
  }
  return null
}

// ──────────────────────────────────────────────────────────────────
// Actions
// ──────────────────────────────────────────────────────────────────

/** Получить все 6 глобальных ставок.
 *  Возвращает Record<key, number> (value парсится в number).
 *  Lazy-seed: если ключи отсутствуют в БД — возвращает дефолты (миграция должна была заполнить).
 */
export async function getPricingSettings(): Promise<
  ActionResult<Record<AppSettingKey, number>>
> {
  try {
    await requireSection("PRICES")
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    return { ok: false, error: (e as Error).message }
  }

  try {
    const rows = await prisma.appSetting.findMany({
      where: { key: { in: [...APP_SETTING_KEYS] } },
    })

    const result: Record<string, number> = {}
    for (const row of rows) {
      const parsed = parseFloat(row.value)
      result[row.key] = Number.isNaN(parsed) ? 0 : parsed
    }

    // Fallback: миграция 07-01 seed-ит 6 ключей, но на всякий случай заполняем дефолтами
    for (const key of APP_SETTING_KEYS) {
      if (result[key] == null) {
        result[key] = APP_SETTING_DEFAULTS[key]
      }
    }

    return { ok: true, data: result as Record<AppSettingKey, number> }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Обновить одну глобальную ставку.
 *  Debounced из GlobalRatesBar (500ms), Zod валидация, upsert по ключу.
 */
export async function updateAppSetting(
  key: string,
  value: string,
): Promise<ActionResult> {
  try {
    await requireSection("PRICES", "MANAGE")
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    return { ok: false, error: (e as Error).message }
  }

  if (!isValidAppSettingKey(key)) {
    return { ok: false, error: `Неизвестный ключ настройки: ${key}` }
  }

  const parsed = appSettingValueSchema.safeParse(value)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  try {
    // Нормализуем — сохраняем с одним знаком после запятой
    const normalized = (Math.round(parseFloat(parsed.data) * 10) / 10).toFixed(1)

    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value: normalized },
      update: { value: normalized },
    })

    revalidatePath("/prices/wb")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Сохранить расчётную цену в слот (1/2/3) с полным snapshot параметров.
 *  Upsert по @@unique([wbCardId, slot]) — перезапись того же слота идемпотентна.
 */
export async function saveCalculatedPrice(
  input: z.infer<typeof saveCalculatedPriceSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireSection("PRICES", "MANAGE")
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    return { ok: false, error: (e as Error).message }
  }

  const parsed = saveCalculatedPriceSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  try {
    const saved = await prisma.calculatedPrice.upsert({
      where: {
        wbCardId_slot: {
          wbCardId: parsed.data.wbCardId,
          slot: parsed.data.slot,
        },
      },
      create: {
        wbCardId: parsed.data.wbCardId,
        slot: parsed.data.slot,
        name: parsed.data.name,
        sellerPrice: parsed.data.sellerPrice,
        drrPct: parsed.data.drrPct ?? null,
        defectRatePct: parsed.data.defectRatePct ?? null,
        deliveryCostRub: parsed.data.deliveryCostRub ?? null,
        // Prisma Json field: передаём как unknown чтобы обойти strict типы InputJsonValue
        snapshot: parsed.data.snapshot as never,
      },
      update: {
        name: parsed.data.name,
        sellerPrice: parsed.data.sellerPrice,
        drrPct: parsed.data.drrPct ?? null,
        defectRatePct: parsed.data.defectRatePct ?? null,
        deliveryCostRub: parsed.data.deliveryCostRub ?? null,
        // Prisma Json field: передаём как unknown чтобы обойти strict типы InputJsonValue
        snapshot: parsed.data.snapshot as never,
      },
    })

    revalidatePath("/prices/wb")
    return { ok: true, data: { id: saved.id } }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Обновить Product.drrOverridePct или Product.defectRateOverridePct.
 *  Используется когда в модалке чекбокс «только этот товар» = true.
 *  value = null → очистка override (будет использоваться Subcategory/Category default).
 */
export async function updateProductOverride(
  input: z.infer<typeof updateProductOverrideSchema>,
): Promise<ActionResult> {
  try {
    await requireSection("PRICES", "MANAGE")
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    return { ok: false, error: (e as Error).message }
  }

  const parsed = updateProductOverrideSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  try {
    const data: Record<string, number | null> = {}
    data[parsed.data.field] = parsed.data.value

    await prisma.product.update({
      where: { id: parsed.data.productId },
      data,
    })

    revalidatePath("/prices/wb")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Обновить Subcategory.defaultDrrPct — влияет на ВСЕ товары подкатегории,
 *  у которых не задан Product.drrOverridePct.
 *  Используется когда в модалке чекбокс «только этот товар» = false (ДРР).
 */
export async function updateSubcategoryDefault(
  subcategoryId: string,
  value: number | null,
): Promise<ActionResult> {
  try {
    await requireSection("PRICES", "MANAGE")
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    return { ok: false, error: (e as Error).message }
  }

  if (!subcategoryId || subcategoryId.length === 0) {
    return { ok: false, error: "subcategoryId обязателен" }
  }

  if (value != null && (value < 0 || value > 100)) {
    return { ok: false, error: "Значение должно быть в диапазоне [0, 100]" }
  }

  try {
    await prisma.subcategory.update({
      where: { id: subcategoryId },
      data: { defaultDrrPct: value },
    })
    revalidatePath("/prices/wb")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Обновить Category.defaultDefectRatePct — влияет на ВСЕ товары категории,
 *  у которых не задан Product.defectRateOverridePct.
 *  Используется когда в модалке чекбокс «только этот товар» = false (Брак).
 */
export async function updateCategoryDefault(
  categoryId: string,
  value: number | null,
): Promise<ActionResult> {
  try {
    await requireSection("PRICES", "MANAGE")
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    return { ok: false, error: (e as Error).message }
  }

  if (!categoryId || categoryId.length === 0) {
    return { ok: false, error: "categoryId обязателен" }
  }

  if (value != null && (value < 0 || value > 100)) {
    return { ok: false, error: "Значение должно быть в диапазоне [0, 100]" }
  }

  try {
    await prisma.category.update({
      where: { id: categoryId },
      data: { defaultDefectRatePct: value },
    })
    revalidatePath("/prices/wb")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Обновить Product.deliveryCostRub. Всегда per-product (D-14).
 *  value = null → использовать hardcoded дефолт 30₽ на стороне клиента.
 */
export async function updateProductDelivery(
  productId: string,
  value: number | null,
): Promise<ActionResult> {
  try {
    await requireSection("PRICES", "MANAGE")
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    return { ok: false, error: (e as Error).message }
  }

  if (!productId || productId.length === 0) {
    return { ok: false, error: "productId обязателен" }
  }

  if (value != null && value < 0) {
    return { ok: false, error: "Стоимость доставки не может быть отрицательной" }
  }

  try {
    await prisma.product.update({
      where: { id: productId },
      data: { deliveryCostRub: value },
    })
    revalidatePath("/prices/wb")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
