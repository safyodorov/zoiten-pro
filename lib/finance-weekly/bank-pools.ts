// lib/finance-weekly/bank-pools.ts
//
// Quick 260710-lmb (W3a): pure-хелперы авто-пулов недельного фин-отчёта из
// тегированных банковских операций (BankTransaction.weeklyCostTag).
//
// Гибрид (решение пользователя §7-1):
//   ручное значение недели > 0 → приоритетно («вручную»);
//   ручное = 0 («не задано» — существующая семантика manualPools) →
//   Σ|amount| DEBIT-операций недели с тегом → банк-авто;
//   обоих нет → 0.
//
// OPEX → пул «Общие расходы (бытовая)»; DELIVERY_MP → пул «Доставка до МП»;
// CAPEX — только маркировка/исключение, НИ В ОДИН пул не суммируется.
//
// PURE-модуль: ноль runtime-импортов (паттерн attribution.ts / realization.ts —
// vitest-изоляция без Prisma/Next). Prisma-запрос и Decimal→number — в data.ts.

// ── Типы ───────────────────────────────────────────────────────────────────────

/** Авто-суммы пулов из банка за неделю, ₽. */
export interface BankPoolAutos {
  /** Σ|amount| DEBIT-операций с тегом OPEX → «Общие расходы (бытовая)». */
  opexRub: number
  /** Σ|amount| DEBIT-операций с тегом DELIVERY_MP → «Доставка до МП». */
  deliveryMpRub: number
}

/** Минимальная проекция банковской операции для суммирования пулов. */
export interface BankTxForPools {
  direction: string // "DEBIT" | "CREDIT"
  amountRub: number // Decimal → number конвертирует вызывающий (data.ts)
  weeklyCostTag: string | null // "OPEX" | "CAPEX" | "DELIVERY_MP" | null
}

/** Источник значения гибрид-пула (бейдж в редакторе пулов). */
export type HybridPoolSource = "manual" | "bank" | "none"

// ── Функции ────────────────────────────────────────────────────────────────────

/**
 * Σ|amount| исходящих (DEBIT) операций по тегам OPEX / DELIVERY_MP.
 * CREDIT, CAPEX и операции без тега игнорируются полностью.
 */
export function sumBankPoolAutos(rows: readonly BankTxForPools[]): BankPoolAutos {
  let opexRub = 0
  let deliveryMpRub = 0
  for (const row of rows) {
    if (row.direction !== "DEBIT") continue
    if (row.weeklyCostTag === "OPEX") opexRub += Math.abs(row.amountRub)
    else if (row.weeklyCostTag === "DELIVERY_MP") deliveryMpRub += Math.abs(row.amountRub)
    // CAPEX / null → игнор
  }
  return { opexRub, deliveryMpRub }
}

/**
 * Гибрид: manual > 0 → manual («вручную»); иначе bankAuto > 0 → банк; иначе 0.
 * 0 в manual = «не задано» — существующая семантика manualPools СОХРАНЯЕТСЯ.
 */
export function resolveHybridPool(
  manual: number,
  bankAuto: number,
): { total: number; source: HybridPoolSource } {
  if (manual > 0) return { total: manual, source: "manual" }
  if (bankAuto > 0) return { total: bankAuto, source: "bank" }
  return { total: 0, source: "none" }
}
