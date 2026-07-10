// lib/finance-weekly/credit-accrual.ts
//
// W2d (quick 260710-hkj, Фикс 4): недельное НАЧИСЛЕНИЕ процентов по кредитам
// для пула creditInterest /finance/weekly.
//
// Формула: остаток тела на weekStart × ставка/100 × 7/365 per кредит, Σ по всем.
// Заменяет прежний источник (платежи по дате из графика loadSummarySchedule) —
// большинство недель платежей не имело → пул был 0, что не отражает
// экономическую нагрузку кредита на неделю.
//
// computeAccruedInterest из lib/loan-math НЕ подходит: он пропорционирует
// interest СЛЕДУЮЩЕГО планового платежа графика; здесь простой accrual от тела.
// Разрыв с Excel экономиста U331 (~24%: 393 624 vs ≈299 091) — предмет сверки
// реестра кредитов, НЕ баг формулы (решение пользователя 2026-07-10).
//
// Pure — ноль импортов Prisma; round2 из @/lib/loan-math (pure модуль).

import { round2 } from "@/lib/loan-math"

export interface AccrualLoanInput {
  /** Тело кредита, ₽. */
  amount: number
  /** Годовая ставка, %. */
  annualRatePct: number
  /**
   * Дата выдачи (Loan.issueDate — ручное поле, nullable).
   * Guard: issueDate >= weekEnd (эксклюзивно, weekStart+7д) → кредит не существовал
   * в эту неделю → вклад 0 (иначе листание в прошлое давало бы фантомное начисление).
   * null/undefined → кредит ВКЛЮЧАЕТСЯ (дата выдачи неизвестна — считаем действующим).
   */
  issueDate?: Date | string | null
  /**
   * ПОЛНЫЙ график платежей (прошлое + будущее плановое, паттерн LoanPayment).
   * Учитываются только principal с date СТРОГО < weekStart.
   * interest-поля игнорируются (формула от тела, не от графика процентов).
   */
  payments: { date: Date | string; principal: number }[]
}

/** UTC-полночь календарной даты (mirror lib/loan-math). */
function utcMidnightMs(val: Date | string): number {
  const d = val instanceof Date ? val : new Date(val)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/**
 * Недельное начисление процентов: Σ per кредит balance(weekStart) × rate/100 × 7/365.
 *
 * - balance = amount − Σ principal(date < weekStart) — СТРОГО раньше weekStart
 *   (платёж в день weekStart относится к текущей неделе, остаток ещё не уменьшен).
 * - balance <= 0 → кредит погашен, вклад 0.
 * - issueDate >= weekStart+7д (эксклюзивный конец недели) → вклад 0 (см. AccrualLoanInput).
 * - Результат = round2(Σ вкладов), ₽.
 */
export function weeklyAccruedInterest(
  loans: AccrualLoanInput[],
  weekStart: Date,
): number {
  const weekStartMs = utcMidnightMs(weekStart)
  const weekEndExclusiveMs = weekStartMs + 7 * 86_400_000

  let total = 0
  for (const loan of loans) {
    // Guard: кредит выдан после (эксклюзивного) конца недели → не существовал
    if (loan.issueDate != null && utcMidnightMs(loan.issueDate) >= weekEndExclusiveMs) {
      continue
    }

    let principalPaid = 0
    for (const p of loan.payments) {
      if (utcMidnightMs(p.date) < weekStartMs) principalPaid += p.principal
    }
    const balance = loan.amount - principalPaid
    if (balance <= 0) continue // погашен

    total += balance * (loan.annualRatePct / 100) * (7 / 365)
  }
  return round2(total)
}
