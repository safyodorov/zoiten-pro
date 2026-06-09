// lib/procurement-math.ts
// Pure расчётный слой для закупок (платежи депозит/баланс + percent↔amount).
// Нет зависимостей от Prisma/Next — используется и на сервере (createPurchase, 20-06),
// и на клиенте (multi-payment модалка с realtime пересчётом).
// Phase 20 (Procurement) — implements D-08 (даты депозита/баланса + percent↔amount recompute).

// ── Даты платежей (D-08) ──────────────────────────────────────────────────────

/**
 * Дата платежа депозита = дата создания закупки + 3 календарных дня.
 *
 * Мутируется копия Date через setDate(getDate()+3) — корректно переходит границу месяца:
 *   "2026-06-09" → "2026-06-12"; "2026-06-29" → "2026-07-02".
 */
export function computeDepositDueDate(createdAt: Date): Date {
  const d = new Date(createdAt)
  d.setDate(d.getDate() + 3)
  return d
}

/**
 * Дата платежа баланса = дата депозита + срок производства/поставки (leadTimeDays).
 *
 *   ("2026-06-12", 30) → "2026-07-12".
 */
export function computeBalanceDueDate(depositDueDate: Date, leadTimeDays: number): Date {
  const d = new Date(depositDueDate)
  d.setDate(d.getDate() + leadTimeDays)
  return d
}

// ── percent ↔ amount recompute (D-08) ──────────────────────────────────────────

/**
 * Пользователь вводит percent (0-100) → вычислить amount.
 * totalAmount = Σ(PurchaseItem.quantity × unitPrice).
 * amount = totalAmount × percent / 100, округление до 2 знаков (копеек).
 *
 *   (5000, 30)    → 1500
 *   (3000, 33.33) ≈ 999.9
 */
export function recomputeAmountFromPercent(
  totalAmount: number,
  percent: number
): number {
  return Math.round(totalAmount * percent) / 100
}

/**
 * Пользователь вводит amount → вычислить percent.
 * percent = amount / totalAmount × 100, округление до 2 знаков.
 * Guard: totalAmount === 0 → return 0 (защита от деления на ноль).
 *
 *   (5000, 1500) → 30
 *   (0, 100)     → 0
 */
export function recomputePercentFromAmount(
  totalAmount: number,
  amount: number
): number {
  if (totalAmount === 0) return 0
  return Math.round((amount / totalAmount) * 10000) / 100
}

// ── Итог закупки ────────────────────────────────────────────────────────────────

/**
 * Сумма всех позиций закупки = Σ(quantity × unitPrice).
 *
 *   [{ quantity: 10, unitPrice: 500 }] → 5000
 */
export function computePurchaseTotal(
  items: Array<{ quantity: number; unitPrice: number }>
): number {
  return items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
}
