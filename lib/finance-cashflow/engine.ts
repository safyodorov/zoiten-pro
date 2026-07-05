// lib/finance-cashflow/engine.ts
//
// Pure функции для расчёта ПДДС.
// **Никаких side effects**: детерминированные, без импортов Prisma / React / Next.
// Golden test: tests/finance-cashflow-engine.test.ts
//
// Phase 28

import type {
  CashflowInputs,
  CashflowDay,
  CashflowBucket,
  CashflowResult,
} from "./types"
import type { Granularity } from "@/lib/date-buckets"
import { bucketKey, bucketLabel } from "@/lib/date-buckets"

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Количество дней в месяце (UTC) для даты в формате "YYYY-MM-DD" */
function daysInMonth(isoDate: string): number {
  const [y, m] = isoDate.split("-").map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Генератор ISO-строк [from..to] включительно (шаг 1 день UTC) */
function eachDayIso(from: string, to: string): string[] {
  const days: string[] = []
  let cur = new Date(from + "T00:00:00Z").getTime()
  const end = new Date(to + "T00:00:00Z").getTime()
  while (cur <= end) {
    days.push(new Date(cur).toISOString().slice(0, 10))
    cur += 86_400_000
  }
  return days
}

/** День прихода денег WB за выкупы в неделю, содержащую saleDateIso.
 * reportMonday = понедельник недели выкупа + 7д; cashDate = reportMonday + lagWeeks×7.
 * Формула скопирована из lib/finance-model/engine.ts:wbCashDay (legacy НЕ импортировать). */
function wbCashDay(saleDateIso: string, wbPayoutLagWeeks: number): string {
  const date = new Date(saleDateIso + "T00:00:00Z")
  const dow = date.getUTCDay()                          // 0=Вс..6=Сб
  const daysSinceMonday = (dow + 6) % 7
  const weekMondayMs = date.getTime() - daysSinceMonday * 86_400_000
  const reportMondayMs = weekMondayMs + 7 * 86_400_000
  const cashMs = reportMondayMs + wbPayoutLagWeeks * 7 * 86_400_000
  return new Date(cashMs).toISOString().slice(0, 10)
}

// ── PayoutFn ─────────────────────────────────────────────────────────────────

/**
 * Сменная payout-функция (D-1 — задел под v2 per-product).
 * v1: coefficient — (_d, rub) => rub × wbPayoutPct/100
 * v2: передать кастомную функцию 3-м аргументом computeCashflow
 */
export type PayoutFn = (
  date: string,
  buyoutsRub: number,
  byProduct?: Array<{ productId: string; buyoutsRub: number }>,
) => number

// ── buildWbPayoutSchedule ────────────────────────────────────────────────────

/**
 * Агрегирует buyoutsRub по cashDate (понедельники) × effectivePayout.
 * Дневной ряд выкупов обязателен (не помесячный) — §8 Phase 25.
 */
function buildWbPayoutSchedule(
  revenueSeries: CashflowInputs["revenueSeries"],
  effectivePayout: PayoutFn,
): Map<string, number> {
  const schedule = new Map<string, number>()
  for (const row of revenueSeries) {
    const cashDate = wbCashDay(row.date, 1) // lagWeeks берётся из замыкания в computeCashflow
    schedule.set(cashDate, (schedule.get(cashDate) ?? 0) + effectivePayout(row.date, row.buyoutsRub, row.byProduct))
  }
  return schedule
}

// ── computeCashflow ──────────────────────────────────────────────────────────

/**
 * Дневная симуляция ПДДС за горизонт [horizonFrom..horizonTo].
 * Pure — без Prisma/React/Next.
 *
 * @param inputs     - CashflowInputs (сериализуемые)
 * @param granularity - гранулярность бакетов (default "month")
 * @param payoutFn    - v2 сменная payout-модель; v1 — undefined → coefficient
 */
export function computeCashflow(
  inputs: CashflowInputs,
  granularity: Granularity = "month",
  payoutFn?: PayoutFn,   // v2: per-product из pricing-math; v1 undefined → coefficient
): CashflowResult {
  const {
    horizonFrom,
    horizonTo,
    startingBalance,
    gapThresholdRub,
    revenueSeries,
    wbPayoutPct,
    wbPayoutLagWeeks,
    realPurchasePayments,
    virtualPayments,
    loanPayments,
    taxPayments,
    opexMonthlyRub,
    actualBalanceSeries,
    versionStale,
  } = inputs

  // v1: coefficient; v2 подключит per-product функцию без переписывания engine
  const effectivePayout: PayoutFn =
    payoutFn ?? ((_d, rub) => rub * (wbPayoutPct / 100))

  // 1. WB payout schedule: дата → сумма выплаты
  //    Строим отдельно с учётом wbPayoutLagWeeks
  const wbSchedule = new Map<string, number>()
  for (const row of revenueSeries) {
    const cashDate = wbCashDay(row.date, wbPayoutLagWeeks)
    wbSchedule.set(cashDate, (wbSchedule.get(cashDate) ?? 0) + effectivePayout(row.date, row.buyoutsRub, row.byProduct))
  }

  // 2. Индексы оттоков по дате
  function buildIndex(arr: Array<{ date: string; amountRub: number }>): Map<string, number> {
    const m = new Map<string, number>()
    for (const item of arr) {
      m.set(item.date, (m.get(item.date) ?? 0) + item.amountRub)
    }
    return m
  }

  const realPurchaseIdx = buildIndex(realPurchasePayments)
  const virtualIdx = buildIndex(virtualPayments)
  const loanIdx = buildIndex(loanPayments)
  const taxIdx = buildIndex(taxPayments)

  // 3. Факт-ряд остатка
  const actualMap = new Map<string, number>()
  if (actualBalanceSeries) {
    for (const item of actualBalanceSeries) {
      actualMap.set(item.date, item.balanceRub)
    }
  }

  // 4. Итерация по дням [horizonFrom..horizonTo]
  const days: CashflowDay[] = []
  let prevBalance = startingBalance
  let minBalance = startingBalance
  let firstGapDate: string | null = null
  let netTotal = 0

  const allDays = eachDayIso(horizonFrom, horizonTo)

  for (const d of allDays) {
    const wbPayoutRub = wbSchedule.get(d) ?? 0
    const realPurchaseRub = realPurchaseIdx.get(d) ?? 0
    const virtualPurchaseRub = virtualIdx.get(d) ?? 0
    const loanRub = loanIdx.get(d) ?? 0
    const taxRub = taxIdx.get(d) ?? 0
    // Опекс: равномерно по дням месяца
    const opexRub = opexMonthlyRub > 0 ? opexMonthlyRub / daysInMonth(d) : 0

    const totalInflow = wbPayoutRub
    const totalOutflow = realPurchaseRub + virtualPurchaseRub + loanRub + taxRub + opexRub
    const netFlow = totalInflow - totalOutflow
    const balanceEnd = prevBalance + netFlow

    const isGap = balanceEnd < gapThresholdRub
    if (firstGapDate === null && isGap) firstGapDate = d

    const actualBalance = actualMap.has(d) ? (actualMap.get(d) ?? null) : null

    days.push({
      date: d,
      wbPayoutRub,
      realPurchaseRub,
      virtualPurchaseRub,
      loanRub,
      taxRub,
      opexRub,
      totalInflow,
      totalOutflow,
      netFlow,
      balanceEnd,
      isGap,
      actualBalance,
    })

    prevBalance = balanceEnd
    if (balanceEnd < minBalance) minBalance = balanceEnd
    netTotal += netFlow
  }

  // 5. Агрегация бакетов
  const bucketMap = new Map<string, CashflowBucket>()

  for (const day of days) {
    const dateObj = new Date(day.date + "T00:00:00Z")
    const key = bucketKey(dateObj, granularity)

    const existing = bucketMap.get(key)
    if (!existing) {
      bucketMap.set(key, {
        key,
        label: bucketLabel(key, granularity),
        wbPayoutRub: day.wbPayoutRub,
        realPurchaseRub: day.realPurchaseRub,
        virtualPurchaseRub: day.virtualPurchaseRub,
        loanRub: day.loanRub,
        taxRub: day.taxRub,
        opexRub: day.opexRub,
        totalInflow: day.totalInflow,
        totalOutflow: day.totalOutflow,
        netFlow: day.netFlow,
        balanceEnd: day.balanceEnd,   // последний день бакета (перезаписывается)
        hasGap: day.isGap,
      })
    } else {
      existing.wbPayoutRub += day.wbPayoutRub
      existing.realPurchaseRub += day.realPurchaseRub
      existing.virtualPurchaseRub += day.virtualPurchaseRub
      existing.loanRub += day.loanRub
      existing.taxRub += day.taxRub
      existing.opexRub += day.opexRub
      existing.totalInflow += day.totalInflow
      existing.totalOutflow += day.totalOutflow
      existing.netFlow += day.netFlow
      existing.balanceEnd = day.balanceEnd  // последний день перезаписывает
      if (day.isGap) existing.hasGap = true
    }
  }

  const buckets = Array.from(bucketMap.values())

  return {
    days,
    buckets,
    granularity,
    startingBalance,
    minBalance,
    firstGapDate,
    netTotal,
    versionStale: versionStale ?? false,
  }
}
