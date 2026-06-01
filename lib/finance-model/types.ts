// lib/finance-model/types.ts
//
// Типы финансовой модели денежных потоков и прибыли (раздел «Финансовые модели»).
// Pure data — без зависимостей от Prisma/React/Next.

/** Один товар к запуску на WB (строка из вводной.xlsx). */
export interface ProductInput {
  name: string
  /** Минимальная партия товара, шт (C) */
  batchQty: number
  /** Заказы на маркетплейсе, шт/день (D) */
  ordersPerDay: number
  /** Цена единицы на маркетплейсе, ₽ (E) */
  price: number
  /** Себестоимость ₽/шт — товар+логистика Китая+таможня (W) */
  costPerUnit: number

  // Лид-тайм, дни
  /** Срок производства (I) */
  productionDays: number
  /** Инспекция после производства, перед отгрузкой (J) */
  inspectionDays: number
  /** Логистика из Китая до таможни (K) */
  chinaLogisticsDays: number
  /** Доставка в Иваново с таможни (L) */
  customsToIvanovoDays: number
  /** Приёмка в Иваново (M) */
  ivanovoReceiveDays: number
  /** Отгрузка на маркетплейс (N) */
  shipToMpDays: number
  /** Приёмка на маркетплейсе (O) */
  mpReceiveDays: number

  /** Процент выкупа, доля (S, напр. 0.87) */
  buyoutRate: number
  /** Процент брака, доля (T, напр. 0.015) — уже учтён в марже, для справки */
  defectRate: number
  /** Рентабельность продаж (U), доля — all-in маржа */
  marginPct: number
  /** ROI (V), доля — для справки/проверки консистентности */
  roi: number
}

/** Глобальные параметры модели (общие для всех вариантов). */
export interface GlobalParams {
  /** Дата старта, ISO 'YYYY-MM-DD' */
  startDate: string
  /** Горизонт, месяцев */
  horizonMonths: number
  /** Отсрочка выплат WB, недель (после понедельника-отчёта) */
  wbPayoutWeeks: number
  /** Доля прибыли к удержанию в обороте (реинвест); остальное выводится собственнику */
  reinvestRate: number
  /** Ставка кредита, годовых (доля, напр. 0.25) */
  creditAnnualRate: number
  /** Минимальная сумма и шаг привлечения кредита, ₽ (транши кратны этому, напр. 5 млн) */
  creditStepRub: number
  /** Минимальный срок кредита, месяцев — в пределах этого срока досрочного гашения нет */
  creditMinTermMonths: number
  /** Дробление платежа поставщику; суммы долей должны давать 1 */
  paymentSplit: {
    /** при заказе */
    onOrder: number
    /** перед отгрузкой (после производства+инспекции) */
    beforeShip: number
    /** при прибытии на таможню (после логистики Китая) */
    atCustoms: number
  }
}

/** Конфигурация одного варианта финансирования. */
export interface VariantConfig {
  id: number
  label: string
  /** Собственные средства, ₽ (стартовый остаток) */
  ownFunds: number
  /** Дельта к рентабельности продаж, доля (+0.01 / 0 / −0.01) */
  marginDeltaPct: number
}

/** Строка модели прибыли за месяц (accrual — по месяцу продажи). */
export interface ProfitMonthRow {
  monthIndex: number
  monthLabel: string
  /** Выручка = Реализация × Цена */
  revenue: number
  /** Себестоимость проданного товара */
  cogs: number
  /** Операционные расходы = Выручка − Себест − Чистая прибыль */
  opex: number
  /** Чистая прибыль = U × Выручка */
  netProfit: number
  /** Реинвестировано (удержано) */
  reinvested: number
  /** Выведено собственнику */
  withdrawn: number
}

/** Строка модели денежных потоков за месяц (cash basis — по дате движения денег). */
export interface CashFlowMonthRow {
  monthIndex: number
  monthLabel: string
  /** Поступления от WB (возврат себестоимости + прибыль) */
  wbReceipts: number
  /** Платежи поставщикам за товар (20/50/30) */
  procurement: number
  /** Проценты по кредиту */
  interest: number
  /** Вывод прибыли собственнику (70%) */
  ownerWithdrawal: number
  /** Чистый денежный поток до финансирования */
  netCashFlow: number
  /** Привлечение кредита за месяц */
  creditDrawn: number
  /** Гашение кредита за месяц */
  creditRepaid: number
  /** Остаток кредита на конец месяца */
  creditBalanceEnd: number
  /** Остаток денежных средств на конец месяца */
  cashBalanceEnd: number
}

/** Итоговая оценка кредита по варианту. */
export interface CreditAssessment {
  /** Пиковая задолженность по кредиту, ₽ */
  peakCredit: number
  /** Индекс месяца пика (0..horizon-1) */
  peakMonthIndex: number
  /** Подпись месяца пика */
  peakMonthLabel: string
  /** Суммарные проценты за горизонт, ₽ */
  totalInterest: number
  /** Средний остаток долга, ₽ */
  avgCredit: number
  /** Остаток кредита на конец горизонта, ₽ */
  endingCredit: number
  /** Достаточно ли собственных средств (пик долга == 0) */
  ownFundsSufficient: boolean
  /** Пиковая совокупная потребность в капитале (собств. + кредит), ₽ */
  peakCapitalNeed: number
}

/** Результат симуляции одного варианта. */
export interface VariantResult {
  config: VariantConfig
  profit: ProfitMonthRow[]
  cashFlow: CashFlowMonthRow[]
  credit: CreditAssessment
  /** Годовые итоги модели прибыли */
  profitTotals: Omit<ProfitMonthRow, "monthIndex" | "monthLabel">
}

/** Метрики по одному товару за горизонт (база, маржа без дельты варианта). */
export interface ProductMetrics {
  name: string
  /** Рентабельность продаж (U), доля */
  marginPct: number
  /** ROI за цикл (V), доля */
  roi: number
  /** Денежный цикл (оплата поставщику → деньги от WB), дней */
  cashCycleDays: number
  /** Выручка за период, ₽ */
  annualRevenue: number
  /** Себестоимость проданного за период, ₽ */
  annualCogs: number
  /** Чистая прибыль за период, ₽ */
  annualProfit: number
  /** Пиковая потребность в оборотном капитале, ₽ */
  peakWorkingCapital: number
  /** Средняя потребность в оборотном капитале, ₽ */
  avgWorkingCapital: number
  /** Оборачиваемость капитала: себест. за период / средний оборотный капитал, раз/год */
  capitalTurnsPerYear: number
  /** Доходность оборотного капитала за период (прибыль / средний оборотный капитал), доля */
  returnOnWorkingCapital: number
}

/** Полный результат: все варианты + метрики по товарам + использованные параметры. */
export interface ModelResult {
  params: GlobalParams
  variants: VariantResult[]
  /** Метрики по каждому товару (на базовой марже) */
  productMetrics: ProductMetrics[]
}
