// lib/cashflow-schemas.ts
// Phase 28-03: чистые Zod-схемы и whitelisted ключи для валидации допущений ПДДС.
//
// Вынесено из app/actions/cashflow.ts, потому что "use server" файлы Next.js 15
// не могут экспортировать синхронные значения (только async-функции).
// Этот модуль не содержит импортов prisma/auth — его можно безопасно импортировать
// из unit-тестов (vitest) без загрузки server runtime.
//
// Паттерн: lib/pricing-schemas.ts

import { z } from "zod"

// ──────────────────────────────────────────────────────────────────
// Whitelisted ключи AppSetting для ПДДС-допущений (Phase 28)
// ──────────────────────────────────────────────────────────────────

/** Whitelisted ключи AppSetting для настроек ПДДС. Защита от injection неизвестных ключей. */
export const CASHFLOW_SETTING_KEYS = [
  "finance.cashflow.wbPayoutPct",
  "finance.cashflow.wbPayoutLagWeeks",
  "finance.cashflow.opexMonthlyRub",
  "finance.cashflow.gapThresholdRub",
] as const

export type CashflowSettingKey = (typeof CASHFLOW_SETTING_KEYS)[number]

/** Дефолтные значения допущений ПДДС. Используются как fallback если AppSetting отсутствует.
 *  payout 55% — первое приближение (D-1), редактируемое через AssumptionsBar. */
export const CASHFLOW_SETTING_DEFAULTS: Record<CashflowSettingKey, number> = {
  "finance.cashflow.wbPayoutPct": 55,
  "finance.cashflow.wbPayoutLagWeeks": 1,
  "finance.cashflow.opexMonthlyRub": 0,
  "finance.cashflow.gapThresholdRub": 0,
}

/** Проверка валидности ключа допущения ПДДС. Используется защитой action'ов. */
export function isValidCashflowSettingKey(key: string): key is CashflowSettingKey {
  return (CASHFLOW_SETTING_KEYS as readonly string[]).includes(key)
}

// ──────────────────────────────────────────────────────────────────
// Числовые границы per-ключ (D-9)
// ──────────────────────────────────────────────────────────────────

const BOUNDS: Record<CashflowSettingKey, { min: number; max: number; int?: boolean }> = {
  "finance.cashflow.wbPayoutPct": { min: 0, max: 100 },
  "finance.cashflow.wbPayoutLagWeeks": { min: 0, max: 8, int: true },
  "finance.cashflow.opexMonthlyRub": { min: 0, max: 1_000_000_000 },
  "finance.cashflow.gapThresholdRub": { min: 0, max: 1_000_000_000 },
}

// ──────────────────────────────────────────────────────────────────
// Zod-схема
// ──────────────────────────────────────────────────────────────────

/**
 * Zod-схема для одного допущения ПДДС: {key, value:string}.
 * Валидирует allow-list ключей + per-ключ числовые границы.
 * Трансформирует value к нормализованной числовой строке.
 */
export const cashflowSettingSchema = z
  .object({ key: z.string(), value: z.string() })
  .superRefine((data, ctx) => {
    if (!isValidCashflowSettingKey(data.key)) {
      ctx.addIssue({ code: "custom", message: `Неизвестный ключ: ${data.key}` })
      return
    }
    const n = Number(data.value)
    const b = BOUNDS[data.key]
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: "Значение должно быть числом" })
      return
    }
    if (b.int && !Number.isInteger(n)) {
      ctx.addIssue({ code: "custom", message: "Значение должно быть целым" })
    }
    if (n < b.min || n > b.max) {
      ctx.addIssue({ code: "custom", message: `Диапазон ${b.min}–${b.max}` })
    }
  })
  .transform((data) => ({ key: data.key, value: String(Number(data.value)) }))
