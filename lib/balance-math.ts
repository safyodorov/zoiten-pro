// lib/balance-math.ts
// Pure расчётный слой для управленческого баланса (Phase 24).
// Нет зависимостей от Prisma/Next — используется и на сервере (RSC), и на клиенте.
// D-16 (налоговое обязательство), D-06 (капитал = Активы−Пассивы), D-09 (дельта дат).

// ── Helper ───────────────────────────────────────────────────────────────────

/**
 * Округление до копеек (2 знака после запятой).
 * "round half away from zero" через Math.round — стандартный бухгалтерский подход.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── computeQuarterAccrual (D-16 начисление за ОДИН квартал) ─────────────────

/**
 * Начисление налога за один квартал: (НДС% + налог%) × база выкупов квартала.
 *
 * ВАЖНО (B3): эта функция считает ТОЛЬКО начисление — БЕЗ вычитания уплаченных
 * налогов. Вычитание уплаченного делается ЕДИНОЖДЫ, глобально, в
 * computeTaxLiability — не здесь и не per-квартально (иначе платежи, попавшие
 * внутрь факт-квартала, теряются и обязательство завышается, дефект B3).
 */
export function computeQuarterAccrual(
  buyoutsSumRub: number,
  vatPct: number,
  incomeTaxPct: number
): number {
  return round2(((vatPct + incomeTaxPct) / 100) * buyoutsSumRub)
}

// ── computeTaxLiability (B3/M4 — вычитание платежей ЕДИНОЖДЫ) ───────────────

export interface TaxLiabilityInputs {
  /** Σ по кварталам: FinanceTaxPeriodActual факт ?? computeQuarterAccrual(base_q, …) */
  accruedTotal: number
  /** Σ ВСЕ уплаченные налоги (BankTransaction TAX + CashEntry «Налоги/банк/сборы») за [taxWindowStart, asOf] */
  taxesPaidTotal: number
}

/**
 * Налоговое обязательство на дату = accruedTotal − taxesPaidTotal.
 *
 * B3: вычитание уплаченных налогов делается ОДИН РАЗ, глобально — вне
 * ветвления «факт закрытого квартала / расчёт текущего квартала». Если бы
 * вычитание происходило внутри пер-квартальной ветки, платёж, датированный
 * внутри уже закрытого (фактического) квартала, «терялся» бы и не уменьшал
 * итоговое обязательство → завышение суммы к уплате.
 *
 * Результат может быть отрицательным (переплата) — это допустимо.
 */
export function computeTaxLiability(inputs: TaxLiabilityInputs): number {
  return round2(inputs.accruedTotal - inputs.taxesPaidTotal)
}

// ── computeCapital (D-06 — балансирующая строка) ────────────────────────────

/**
 * Капитал = Активы − Пассивы (балансирующая строка баланса, D-06).
 * Может быть отрицательным.
 */
export function computeCapital(totalAssets: number, totalLiabilities: number): number {
  return round2(totalAssets - totalLiabilities)
}

// ── computeDelta (D-09 — дельта между двумя датами) ─────────────────────────

export interface Delta {
  abs: number
  pct: number | null
}

/**
 * Дельта между текущим значением и значением сравнения (D-09).
 *
 * - abs = current − compare
 * - pct = (abs / |compare|) × 100, guard: compare === 0 → pct = null
 *   (деление на ноль не определено, отображается как «—» на UI)
 * - При отрицательном compare pct считается по модулю |compare|, чтобы знак
 *   pct совпадал со знаком реального изменения (а не переворачивался).
 */
export function computeDelta(current: number, compare: number): Delta {
  const abs = round2(current - compare)
  const pct = compare === 0 ? null : round2((abs / Math.abs(compare)) * 100)
  return { abs, pct }
}
