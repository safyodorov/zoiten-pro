// lib/finance-cashflow/types.ts
//
// Публичные интерфейсы движка ПДДС (Phase 28). Pure — ноль импортов Prisma/React/Next.
// Входы сериализуемые (string/number/boolean/null) — используются и на сервере (RSC) и на клиенте.

import type { Granularity } from "@/lib/date-buckets"

// Сменная payout-модель (D-1 из CONTEXT — v1 coefficient, v2 per-product из юнит-экономики)
export type PayoutModelType = "coefficient" | "per-product"

export interface CashflowInputs {
  horizonFrom: string        // "2026-07-01"
  horizonTo: string          // "2026-12-31"
  startingBalance: number    // банк(RUR) + касса на horizonFrom (₽)
  gapThresholdRub: number    // порог тревоги (дефолт 0)
  // byProduct — задел v2 per-product payout (D-1); v1 НЕ заполняет (undefined)
  revenueSeries: Array<{ date: string; buyoutsRub: number; byProduct?: Array<{ productId: string; buyoutsRub: number }> }>   // из getPlannedRevenueSeries
  wbPayoutPct: number        // 55 (% net-to-bank от buyoutsRub)
  wbPayoutLagWeeks: number   // 1
  payoutModel: PayoutModelType  // v1 = "coefficient"
  realPurchasePayments: Array<{ date: string; amountRub: number }>  // PurchasePayment PLANNED
  virtualPayments: Array<{ date: string; amountRub: number }>       // getPlannedVirtualPayments (CONVERTED/DISMISSED уже исключены)
  loanPayments: Array<{ date: string; amountRub: number }>          // principal + interest
  taxPayments: Array<{ date: string; amountRub: number }>           // computeQuarterAccrual per квартал → дата уплаты
  opexMonthlyRub: number     // раскладывается равномерно ÷ дни месяца
  actualBalanceSeries?: Array<{ date: string; balanceRub: number }> // факт-ряд остатка (D-4)
  versionStale?: boolean
}

export interface CashflowDay {
  date: string
  wbPayoutRub: number
  realPurchaseRub: number
  virtualPurchaseRub: number
  loanRub: number
  taxRub: number
  opexRub: number
  totalInflow: number
  totalOutflow: number
  netFlow: number
  balanceEnd: number
  isGap: boolean
  actualBalance: number | null   // факт-остаток за прошедшие дни, null для будущих (D-4)
}

export interface CashflowBucket {
  key: string
  label: string
  wbPayoutRub: number
  realPurchaseRub: number
  virtualPurchaseRub: number
  loanRub: number
  taxRub: number
  opexRub: number
  totalInflow: number
  totalOutflow: number
  netFlow: number
  balanceEnd: number       // остаток на конец последнего дня бакета
  hasGap: boolean
}

export interface CashflowResult {
  days: CashflowDay[]
  buckets: CashflowBucket[]
  granularity: Granularity
  startingBalance: number
  minBalance: number
  firstGapDate: string | null
  netTotal: number
  versionStale: boolean
}
