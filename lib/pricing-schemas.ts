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

/** Zod схема для сохранения расчётной цены. */
export const saveCalculatedPriceSchema = z.object({
  wbCardId: z.string().min(1, "wbCardId обязателен"),
  slot: slotSchema,
  name: z.string().min(1, "Название обязательно").max(100, "Название слишком длинное"),
  sellerPrice: z.number().positive("Цена продавца должна быть > 0"),
  sellerDiscountPct: z.number().min(0).max(100).nullable().optional(),
  drrPct: z.number().min(0).max(100).nullable().optional(),
  defectRatePct: z.number().min(0).max(100).nullable().optional(),
  deliveryCostRub: z.number().min(0).nullable().optional(),
  snapshot: z.record(z.string(), z.any()), // JSON полный слепок параметров
})

/** Zod схема для обновления product override полей. */
export const updateProductOverrideSchema = z.object({
  productId: z.string().min(1, "productId обязателен"),
  field: z.enum(["drrOverridePct", "defectRateOverridePct"]),
  value: z.number().min(0).max(100).nullable(),
})
