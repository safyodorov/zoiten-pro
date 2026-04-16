// lib/pricing-schemas.ts
// Phase 7: чистые Zod-схемы и whitelisted ключи для валидации ставок ценообразования WB.
//
// Вынесено из app/actions/pricing.ts, потому что "use server" файлы Next.js 15
// не могут экспортировать синхронные значения (только async-функции).
// Этот модуль не содержит импортов prisma/auth — его можно безопасно импортировать
// из unit-тестов (vitest) без загрузки server runtime.

import { z } from "zod"

// ──────────────────────────────────────────────────────────────────
// Whitelisted ключи AppSetting для Phase 7
// ──────────────────────────────────────────────────────────────────

/** Whitelisted ключи AppSetting для Phase 7. Защита от injection неизвестных ключей. */
export const APP_SETTING_KEYS = [
  "wbWalletPct",
  "wbAcquiringPct",
  "wbJemPct",
  "wbCreditPct",
  "wbOverheadPct",
  "wbTaxPct",
  "wbDefectRatePct",
] as const

export type AppSettingKey = (typeof APP_SETTING_KEYS)[number]

/** Дефолтные значения глобальных ставок. Используются как fallback в getPricingSettings,
 *  если миграция 07-01 не была применена или запись отсутствует. */
export const APP_SETTING_DEFAULTS: Record<AppSettingKey, number> = {
  wbWalletPct: 2.0,
  wbAcquiringPct: 2.7,
  wbJemPct: 1.0,
  wbCreditPct: 7.0,
  wbOverheadPct: 6.0,
  wbTaxPct: 8.0,
  wbDefectRatePct: 2.0,
}

/** Проверка валидности ключа AppSetting. Используется тестами и защитой action'ов. */
export function isValidAppSettingKey(key: string): key is AppSettingKey {
  return (APP_SETTING_KEYS as readonly string[]).includes(key)
}

// ──────────────────────────────────────────────────────────────────
// Zod схемы
// ──────────────────────────────────────────────────────────────────

/** Zod схема для value глобальной ставки.
 *  Строка → парсится как число → валидируется [0, 100] с десятыми.
 *  Отклоняет: пустые строки, строки с пробелами, нечисловой ввод, "2.0%", суффиксы.
 *
 *  Принимает: "0", "2.0", "2.5", "2.7", "99.9", "100"
 *  Отклоняет: "", " ", "abc", "2.0%", "101", "100.1", "-1", "-0.5"
 */
export const appSettingValueSchema = z
  .string()
  .min(1, "Значение не может быть пустым")
  .refine((s) => s.trim().length > 0, "Значение не может быть пустым")
  .refine(
    (s) => /^-?\d+(\.\d+)?$/.test(s),
    "Значение должно быть числом",
  )
  .refine((s) => {
    const n = parseFloat(s)
    return !Number.isNaN(n) && n >= 0 && n <= 100
  }, "Значение должно быть в диапазоне [0, 100]")

/** Zod схема для slot (1|2|3). */
export const slotSchema = z.number().int().min(1).max(3)

/** Ключи редактируемых в модалке параметров (2026-04-16).
 *  Каждый ключ — имя колонки и в Product override-поле (с суффиксом OverridePct),
 *  и в CalculatedPrice per-slot override-поле. */
export const EDITABLE_PARAM_KEYS = [
  "buyoutPct",
  "clubDiscountPct",
  "walletPct",
  "acquiringPct",
  "commissionPct",
  "jemPct",
  "drrPct",
  "defectRatePct",
  "creditPct",
  "overheadPct",
  "taxPct",
  "deliveryCostRub",
] as const

export type EditableParamKey = (typeof EDITABLE_PARAM_KEYS)[number]

/** Маппинг ключ модалки → поле Product. */
export const PRODUCT_FIELD_MAP: Record<EditableParamKey, string> = {
  buyoutPct: "buyoutOverridePct",
  clubDiscountPct: "clubDiscountOverridePct",
  walletPct: "walletOverridePct",
  acquiringPct: "acquiringOverridePct",
  commissionPct: "commissionOverridePct",
  jemPct: "jemOverridePct",
  drrPct: "drrOverridePct",
  defectRatePct: "defectRateOverridePct",
  creditPct: "creditOverridePct",
  overheadPct: "overheadOverridePct",
  taxPct: "taxOverridePct",
  deliveryCostRub: "deliveryCostRub",
}

/** Маппинг ключ модалки → поле CalculatedPrice. */
export const CALC_FIELD_MAP: Record<EditableParamKey, string> = {
  buyoutPct: "buyoutPct",
  clubDiscountPct: "clubDiscountPct",
  walletPct: "walletPct",
  acquiringPct: "acquiringPct",
  commissionPct: "commissionPct",
  jemPct: "jemPct",
  drrPct: "drrPct",
  defectRatePct: "defectRatePct",
  creditPct: "creditPct",
  overheadPct: "overheadPct",
  taxPct: "taxPct",
  deliveryCostRub: "deliveryCostRub",
}

/** Zod для одного параметра модалки.
 *  value=null означает «сбросить override» — применить глобальное значение. */
const paramOverrideSchema = z.object({
  value: z.number().min(0).nullable(),
})

/** Zod схема для сохранения расчётной цены (создание нового слота). */
export const saveCalculatedPriceSchema = z.object({
  wbCardId: z.string().min(1, "wbCardId обязателен"),
  slot: slotSchema,
  name: z.string().min(1, "Название обязательно").max(100, "Название слишком длинное"),
  sellerPrice: z.number().positive("Цена продавца должна быть > 0"),
  sellerDiscountPct: z.number().min(0).max(100).nullable().optional(),
  costPrice: z.number().min(0).nullable().optional(),
  /** Override-поля параметров: для каждого ключа value + scopeSlot. */
  params: z.record(z.string(), paramOverrideSchema).optional(),
  snapshot: z.record(z.string(), z.any()), // JSON полный слепок параметров
  // Legacy поля (обратная совместимость — саморефакторится в params)
  drrPct: z.number().min(0).max(100).nullable().optional(),
  defectRatePct: z.number().min(0).max(100).nullable().optional(),
  deliveryCostRub: z.number().min(0).nullable().optional(),
})

/** Zod схема для сохранения изменений в ТЕКУЩУЮ строку (кнопка «Сохранить»).
 *  - `calculatedPriceId = null` → non-calc строка (Текущая/Regular/Auto), все параметры
 *    пишутся ТОЛЬКО в Product overrides (scopeSlot игнорируется, всегда false).
 *  - `calculatedPriceId != null` → calc строка, параметры пишутся per scopeSlot. */
export const saveRowEditsSchema = z.object({
  wbCardId: z.string().min(1, "wbCardId обязателен"),
  productId: z.string().min(1, "productId обязателен"),
  calculatedPriceId: z.string().nullable(),
  params: z.record(z.string(), paramOverrideSchema),
})

/** Zod схема для сброса override (кнопка «↻ глобальное»).
 *  Очищает Product.XOverride (и CalculatedPrice.X, если calculatedPriceId задан). */
export const resetParamOverrideSchema = z.object({
  productId: z.string().min(1),
  calculatedPriceId: z.string().nullable(),
  paramKey: z.string().refine(
    (k): k is EditableParamKey =>
      (EDITABLE_PARAM_KEYS as readonly string[]).includes(k),
    "Недопустимый ключ параметра",
  ),
})

/** Zod схема для обновления product override полей (legacy, ещё используется кодом).
 *  Расширена всеми 11 override-полями (оставляется совместимость). */
export const updateProductOverrideSchema = z.object({
  productId: z.string().min(1, "productId обязателен"),
  field: z.enum([
    "drrOverridePct",
    "defectRateOverridePct",
    "deliveryCostRub",
    "buyoutOverridePct",
    "clubDiscountOverridePct",
    "walletOverridePct",
    "acquiringOverridePct",
    "commissionOverridePct",
    "jemOverridePct",
    "creditOverridePct",
    "overheadOverridePct",
    "taxOverridePct",
  ]),
  value: z.number().min(0).nullable(),
})
