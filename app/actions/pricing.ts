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
  saveRowEditsSchema,
  resetParamOverrideSchema,
  updateProductOverrideSchema,
  PRODUCT_FIELD_MAP,
  CALC_FIELD_MAP,
  type EditableParamKey,
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

  // «Сохранить как расчётную цену» создаёт/обновляет слот. Все параметры
  // пишутся в CalculatedPrice.X (per-slot). Product.XOverride не трогаем.
  // value=null → CalculatedPrice.X=null (слот использует fallback).
  const cpFields: Record<string, number | null> = {}
  if (parsed.data.params) {
    for (const [key, p] of Object.entries(parsed.data.params)) {
      const k = key as EditableParamKey
      const cpField = CALC_FIELD_MAP[k]
      if (!cpField) continue
      cpFields[cpField] = p.value
    }
  }
  // Legacy поля (обратная совместимость) — dominate cpFields только если не заданы через params
  if (parsed.data.drrPct !== undefined && cpFields.drrPct === undefined)
    cpFields.drrPct = parsed.data.drrPct
  if (parsed.data.defectRatePct !== undefined && cpFields.defectRatePct === undefined)
    cpFields.defectRatePct = parsed.data.defectRatePct
  if (parsed.data.deliveryCostRub !== undefined && cpFields.deliveryCostRub === undefined)
    cpFields.deliveryCostRub = parsed.data.deliveryCostRub

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
        sellerDiscountPct: parsed.data.sellerDiscountPct ?? null,
        costPrice: parsed.data.costPrice ?? null,
        ...cpFields,
        snapshot: parsed.data.snapshot as never,
      },
      update: {
        name: parsed.data.name,
        sellerPrice: parsed.data.sellerPrice,
        sellerDiscountPct: parsed.data.sellerDiscountPct ?? null,
        costPrice: parsed.data.costPrice ?? null,
        ...cpFields,
        snapshot: parsed.data.snapshot as never,
      },
    })

    revalidatePath("/prices/wb")
    return { ok: true, data: { id: saved.id } }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Сохранить изменения параметров в ТЕКУЩУЮ строку (кнопка «Сохранить»).
 *  Scope определяется по источнику клика:
 *    - calculatedPriceId != null → пишем в CalculatedPrice.X (только этот слот)
 *    - calculatedPriceId == null → пишем в Product.XOverride (влияет на все
 *      Текущая + акционные строки этого товара через fallback chain)
 *  value=null → сбросить override на соответствующем уровне.
 *  НЕ ТРОГАЕТ: sellerPrice, sellerDiscountPct, costPrice (они через новый слот).
 */
export async function saveRowEdits(
  input: z.infer<typeof saveRowEditsSchema>,
): Promise<ActionResult> {
  try {
    await requireSection("PRICES", "MANAGE")
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    return { ok: false, error: (e as Error).message }
  }

  const parsed = saveRowEditsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const productUpdates: Record<string, number | null> = {}
  const cpUpdates: Record<string, number | null> = {}

  for (const [key, p] of Object.entries(parsed.data.params)) {
    const k = key as EditableParamKey
    const cpField = CALC_FIELD_MAP[k]
    const prodField = PRODUCT_FIELD_MAP[k]
    if (!cpField || !prodField) continue

    if (parsed.data.calculatedPriceId == null) {
      // Non-calc (Текущая / Regular / Auto) → в Product.XOverride
      productUpdates[prodField] = p.value
    } else {
      // Calc → в CalculatedPrice.X
      cpUpdates[cpField] = p.value
    }
  }

  try {
    if (parsed.data.calculatedPriceId) {
      if (Object.keys(cpUpdates).length > 0) {
        await prisma.calculatedPrice.update({
          where: { id: parsed.data.calculatedPriceId },
          data: cpUpdates,
        })
      }
    } else if (Object.keys(productUpdates).length > 0) {
      await prisma.product.update({
        where: { id: parsed.data.productId },
        data: productUpdates,
      })
    }
    revalidatePath("/prices/wb")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Удалить одну или несколько расчётных цен. */
export async function deleteCalculatedPrices(
  ids: string[],
): Promise<ActionResult<{ deleted: number }>> {
  try {
    await requireSection("PRICES", "MANAGE")
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    return { ok: false, error: (e as Error).message }
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "Не выбрано ни одной расчётной цены" }
  }
  const cleanIds = ids.filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  )
  if (cleanIds.length === 0) {
    return { ok: false, error: "Некорректные id" }
  }

  try {
    const result = await prisma.calculatedPrice.deleteMany({
      where: { id: { in: cleanIds } },
    })
    revalidatePath("/prices/wb")
    return { ok: true, data: { deleted: result.count } }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Очистить override параметра («↻ глобальное»).
 *  Всегда очищает Product.XOverride. Если задан calculatedPriceId — дополнительно
 *  очищает CalculatedPrice.X, чтобы значение действительно вернулось к fallback.
 */
export async function resetParamOverride(
  input: z.infer<typeof resetParamOverrideSchema>,
): Promise<ActionResult> {
  try {
    await requireSection("PRICES", "MANAGE")
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    return { ok: false, error: (e as Error).message }
  }

  const parsed = resetParamOverrideSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const prodField = PRODUCT_FIELD_MAP[parsed.data.paramKey]
  const cpField = CALC_FIELD_MAP[parsed.data.paramKey]

  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: parsed.data.productId },
        data: { [prodField]: null },
      })
      if (parsed.data.calculatedPriceId) {
        await tx.calculatedPrice.update({
          where: { id: parsed.data.calculatedPriceId },
          data: { [cpField]: null },
        })
      }
    })
    revalidatePath("/prices/wb")
    return { ok: true }
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

// ──────────────────────────────────────────────────────────────────
// WbPromotion displayName — пользовательское название акции для UI.
// Обновление глобально для всех строк этой акции. Не трогает name
// (его перезаписывает WB API sync — displayName поверх как override).
// ──────────────────────────────────────────────────────────────────

export async function updateWbPromotionDisplayName(
  promotionId: number,
  displayName: string | null,
): Promise<ActionResult> {
  try {
    await requireSection("PRICES", "MANAGE")
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    return { ok: false, error: (e as Error).message }
  }

  if (!Number.isInteger(promotionId) || promotionId <= 0) {
    return { ok: false, error: "Некорректный id акции" }
  }

  // Нормализация: пустая строка / только пробелы → null (восстанавливаем оригинал)
  const normalized =
    displayName && displayName.trim().length > 0 ? displayName.trim() : null

  if (normalized && normalized.length > 200) {
    return { ok: false, error: "Название слишком длинное (макс 200 символов)" }
  }

  try {
    await prisma.wbPromotion.update({
      where: { id: promotionId },
      data: { displayName: normalized },
    })
    revalidatePath("/prices/wb")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
