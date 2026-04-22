// lib/stock-math.ts
// Pure functions для расчёта показателей остатков: оборачиваемость (Об) и дефицит (Д).
// Не имеет внешних зависимостей — используется и на сервере (RSC), и на клиенте.
// Source: REQUIREMENTS.md STOCK-02, STOCK-19; Phase 14 Research Pattern 3.

export interface StockMetricsInput {
  stock: number | null        // О: остаток (шт)
  ordersPerDay: number | null // З: заказы в день (avgSalesSpeed7d)
  turnoverNormDays: number    // из AppSetting stock.turnoverNormDays
}

export interface StockMetricsOutput {
  turnoverDays: number | null  // Об = О / З (дни до нуля)
  deficit: number | null       // Д = (norm × З) − О (шт дефицита; без буферного коэф.)
}

/**
 * Рассчитывает показатели остатков: оборачиваемость и дефицит.
 *
 * Формулы:
 *   Об = О / З (дней до нуля при текущих продажах)
 *   Д = (norm × З) − О (дефицит в штуках; < 0 = профицит, ≥ 0 = дефицит)
 *
 * Null-guards:
 *   - О = null → {null, null} (нет данных об остатке)
 *   - normDays ≤ 0 → {null, null} (некорректная норма)
 *   - З = null → Об = null, Д = null (нет данных о продажах)
 *   - З = 0 → Об = null (нет продаж — бесконечная оборачиваемость), Д = −О (−остаток)
 */
export function calculateStockMetrics(input: StockMetricsInput): StockMetricsOutput {
  const { stock, ordersPerDay, turnoverNormDays } = input

  // Guard: О = null → не считаем ничего
  if (stock === null) return { turnoverDays: null, deficit: null }

  // Guard: normDays <= 0 → Д нельзя посчитать
  if (turnoverNormDays <= 0) return { turnoverDays: null, deficit: null }

  // Об = О / З. Если З = 0 или null → Об = null (нет продаж, нет оборачиваемости)
  const turnoverDays =
    ordersPerDay === null || ordersPerDay === 0
      ? null
      : stock / ordersPerDay

  // Д = (norm × З) − О. Если З = null → Д = null
  // (буферный коэффициент 0.3 убран 2026-04-22 — не нужен)
  const deficit =
    ordersPerDay === null
      ? null
      : turnoverNormDays * ordersPerDay - stock

  // Infinity/NaN guard
  return {
    turnoverDays: turnoverDays !== null && isFinite(turnoverDays) ? turnoverDays : null,
    deficit: deficit !== null && isFinite(deficit) ? deficit : null,
  }
}

/**
 * Порог для цветовой кодировки жёлтого (0 < Д < threshold).
 *
 * threshold = norm × З
 *
 * Используется для определения цвета ячейки Д:
 *   Д ≤ 0            → зелёный (остаток покрывает ≥ нормы дней продаж)
 *   0 < Д < threshold → жёлтый (остаток < нормы, но > 0)
 *   Д ≥ threshold    → красный (остатка нет совсем, О ≤ 0 или близко к 0)
 */
export function deficitThreshold(turnoverNormDays: number, ordersPerDay: number | null): number | null {
  if (ordersPerDay === null || ordersPerDay === 0) return null
  return turnoverNormDays * ordersPerDay
}
