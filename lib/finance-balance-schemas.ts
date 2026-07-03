// lib/finance-balance-schemas.ts
// Phase 24 Plan 24-08 — чистые Zod-схемы управляющего слоя раздела «Финансы → Баланс».
//
// Вынесено из app/actions/finance-balance.ts, потому что "use server" файлы Next.js 15
// не могут экспортировать синхронные значения (только async-функции), и vitest не должен
// грузить auth/prisma runtime только чтобы проверить валидацию (паттерн lib/pricing-schemas.ts).

import { z } from "zod"

/** Ручная корректировочная статья баланса (D-08).
 *  id отсутствует → create. id задан → редактирование существующей (см. m8 —
 *  версионирование при смене amountRub/type/effectiveFrom в app/actions/finance-balance.ts). */
export const adjustmentSchema = z.object({
  id: z.string().optional(), // нет id → create
  label: z.string().min(1, "Название обязательно").max(200, "Название слишком длинное"),
  type: z.enum(["ASSET", "LIABILITY"], { message: "Тип: актив или пассив" }),
  amountRub: z.number().finite(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата должна быть в формате YYYY-MM-DD"),
  comment: z.string().max(1000, "Комментарий слишком длинный").optional().nullable(),
})

export type AdjustmentInput = z.infer<typeof adjustmentSchema>

/** Ставки НДС/налога на доходы (D-15) — AppSetting finance.vatPct / finance.incomeTaxPct. */
export const taxRatesSchema = z.object({
  vatPct: z.number().min(0).max(100),
  incomeTaxPct: z.number().min(0).max(100),
})

export type TaxRatesInput = z.infer<typeof taxRatesSchema>

/** Факт НДС/налога на доходы за закрытый квартал (D-17) — перекрывает расчёт в балансе. */
export const taxPeriodActualSchema = z.object({
  year: z.number().int().min(2024).max(2100),
  quarter: z.number().int().min(1).max(4),
  vatActualRub: z.number().finite().nullable(),
  incomeTaxActualRub: z.number().finite().nullable(),
})

export type TaxPeriodActualInput = z.infer<typeof taxPeriodActualSchema>
