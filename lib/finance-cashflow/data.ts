// lib/finance-cashflow/data.ts
//
// Prisma-загрузчик для ПДДС (мост между БД и computeCashflow).
// DI-паттерн: принимает `db: PrismaClient`, не импортирует глобальный prisma в сигнатуру.
// Ноль импортов React / Next.
//
// Phase 28

import type { PrismaClient } from "@prisma/client"
import { getPlannedRevenueSeries, getPlannedVirtualPayments } from "@/lib/sales-plan/pdds-feed"
import { getBankBalanceAsOf, getRateForDate } from "@/lib/balance-data"
import { computeQuarterAccrual } from "@/lib/balance-math"
import type { CashflowInputs } from "./types"

// ── Параметры загрузчика ────────────────────────────────────────────────────

export interface LoadCashflowParams {
  versionId: string
  horizonFrom: string   // "2026-07-01"
  horizonTo: string     // "2026-12-31"
}

// ── Ключи AppSetting ────────────────────────────────────────────────────────

const CASHFLOW_SETTING_KEYS = [
  "finance.cashflow.wbPayoutPct",
  "finance.cashflow.wbPayoutLagWeeks",
  "finance.cashflow.opexMonthlyRub",
  "finance.cashflow.gapThresholdRub",
  "finance.vatPct",
  "finance.incomeTaxPct",
] as const

// ── Helper: UTC ISO-строка → Date ───────────────────────────────────────────

function parseUtcDate(isoDate: string): Date {
  return new Date(isoDate + "T00:00:00Z")
}

// ── Helper: календарные кварталы, пересекающиеся с горизонтом ───────────────

/**
 * Кварталы любого года, пересекающиеся с [fromIso..toIso].
 * payDate = последний день квартала, обрезанный по toIso (частичный квартал
 * в конце горизонта платится в последний день горизонта — упрощение v1).
 */
function quartersInRange(
  fromIso: string,
  toIso: string,
): Array<{ from: string; to: string; payDate: string }> {
  const result: Array<{ from: string; to: string; payDate: string }> = []
  let year = Number(fromIso.slice(0, 4))
  let quarter = Math.ceil(Number(fromIso.slice(5, 7)) / 3)
  for (;;) {
    const from = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, "0")}-01`
    if (from > toIso) break
    const endMonth = quarter * 3
    const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate()
    const to = `${year}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
    result.push({ from, to, payDate: to < toIso ? to : toIso })
    if (quarter === 4) {
      quarter = 1
      year += 1
    } else {
      quarter += 1
    }
  }
  return result
}

// ── loadCashflowInputs ──────────────────────────────────────────────────────

/**
 * Собирает CashflowInputs для computeCashflow.
 *
 * Шаги:
 * 1. AppSetting — настройки (с дефолтами)
 * 2. Стартовый баланс — Σ getBankBalanceAsOf (RUR) + касса на КОНЕЦ дня перед horizonFrom
 *    (потоки первого дня горизонта входят в факт-ряд и симуляцию, не в старт — CR-01)
 * 3. revenueSeries — getPlannedRevenueSeries, фильтрация по горизонту
 * 4. virtualPayments + versionStale — getPlannedVirtualPayments
 * 5. realPurchasePayments — PurchasePayment PLANNED, amountRub-приоритет
 * 6. loanPayments — LoanPayment principal + interest
 * 7. taxPayments — computeQuarterAccrual per квартал H2-2026
 * 8. actualBalanceSeries — BankTransaction + CashEntry накопительно (≤ сегодня МСК)
 */
export async function loadCashflowInputs(
  db: PrismaClient,
  params: LoadCashflowParams,
): Promise<CashflowInputs> {
  const { versionId, horizonFrom, horizonTo } = params

  const horizonFromDate = parseUtcDate(horizonFrom)
  const horizonToDate = parseUtcDate(horizonTo)

  // ── 1. AppSetting ──────────────────────────────────────────────────────────

  const settingRows = await db.appSetting.findMany({
    where: { key: { in: [...CASHFLOW_SETTING_KEYS] } },
  })
  const settingsMap = new Map(settingRows.map((r) => [r.key, r.value]))

  const wbPayoutPct = Number(settingsMap.get("finance.cashflow.wbPayoutPct") ?? "55")
  const wbPayoutLagWeeks = Number(settingsMap.get("finance.cashflow.wbPayoutLagWeeks") ?? "1")
  const opexMonthlyRub = Number(settingsMap.get("finance.cashflow.opexMonthlyRub") ?? "0")
  const gapThresholdRub = Number(settingsMap.get("finance.cashflow.gapThresholdRub") ?? "0")
  const vatPct = Number(settingsMap.get("finance.vatPct") ?? "7")
  const incomeTaxPct = Number(settingsMap.get("finance.incomeTaxPct") ?? "1")

  // ── 2. Стартовый баланс (D-6): RUR BankAccount + Касса ────────────────────

  // Банк: все RUR-счета (валюта в БД = "RUR", НЕ "RUB")
  const bankAccounts = await db.bankAccount.findMany({
    where: { currency: "RUR" },
    select: { id: true },
  })

  // CR-01: якорь = конец дня, ПРЕДШЕСТВУЮЩЕГО horizonFrom. getBankBalanceAsOf
  // включает транзакции с date === asOf, поэтому asOf = horizonFrom дал бы
  // двойной счёт первого дня (те же записи снова входят в факт-ряд, шаг 8).
  const dayBeforeHorizon = new Date(horizonFromDate.getTime() - 86_400_000)

  const bankBalances = await Promise.all(
    bankAccounts.map((acc) => getBankBalanceAsOf(acc.id, dayBeforeHorizon)),
  )
  const bankRurTotal = bankBalances.reduce<number>((sum, b) => sum + (b ?? 0), 0)

  // Касса: накопительный остаток на конец дня перед horizonFrom (строго ДО — CR-01)
  const cashGroups = await db.cashEntry.groupBy({
    by: ["direction"],
    where: { date: { lt: horizonFromDate } },
    _sum: { amount: true },
  })
  let cashIncome = 0
  let cashExpense = 0
  for (const g of cashGroups) {
    const amt = Number(g._sum.amount ?? 0)
    if (g.direction === "INCOME") cashIncome = amt
    if (g.direction === "EXPENSE") cashExpense = amt
  }
  const cashTotal = cashIncome - cashExpense

  const startingBalance = bankRurTotal + cashTotal

  // ── 3. revenueSeries из getPlannedRevenueSeries ────────────────────────────

  const revenueAll = await getPlannedRevenueSeries(db, versionId)
  const revenueSeries = revenueAll
    .filter((r) => r.date >= horizonFrom && r.date <= horizonTo)
    .map((r) => ({
      date: r.date,
      buyoutsRub: r.buyoutsRub,
      byProduct: r.byProduct?.map((p) => ({ productId: p.productId, buyoutsRub: p.buyoutsRub })),
    }))

  // ── 4. virtualPayments + versionStale ─────────────────────────────────────

  const vpResult = await getPlannedVirtualPayments(db, versionId)
  const virtualPayments = vpResult.payments
    .filter((p) => p.dueDate >= horizonFrom && p.dueDate <= horizonTo)
    .map((p) => ({ date: p.dueDate, amountRub: p.amountRub }))
  const versionStale = vpResult.versionStale

  // ── 5. realPurchasePayments (PLANNED, в горизонте) ────────────────────────

  const purchasePaymentRows = await db.purchasePayment.findMany({
    where: {
      status: "PLANNED",
      dueDate: { gte: horizonFromDate, lte: horizonToDate },
    },
    select: {
      amount: true,
      amountRub: true,
      currency: true,
      dueDate: true,
    },
  })

  // amountRub-приоритет (паттерн D-3 / balance-data B1 / quick-260704-go2)
  // поле курса getRateForDate = rateToRub (НЕ rate)
  const realPurchasePayments = await Promise.all(
    purchasePaymentRows.map(async (payment) => {
      let amountRub: number
      if (payment.amountRub != null) {
        amountRub = Number(payment.amountRub)
      } else {
        const rate = await getRateForDate(payment.currency, payment.dueDate)
        amountRub = Number(payment.amount) * (rate?.rateToRub ?? 1)
      }
      return {
        date: payment.dueDate.toISOString().slice(0, 10),
        amountRub,
      }
    }),
  )

  // ── 6. loanPayments (в горизонте) ─────────────────────────────────────────

  const loanPaymentRows = await db.loanPayment.findMany({
    where: {
      date: { gte: horizonFromDate, lte: horizonToDate },
    },
    select: {
      date: true,
      principal: true,
      interest: true,
    },
  })

  const loanPayments = loanPaymentRows.map((p) => ({
    date: p.date.toISOString().slice(0, 10),
    amountRub: Number(p.principal) + Number(p.interest),
  }))

  // ── 7. taxPayments per квартал (конец квартала = дата уплаты, упрощение v1) ─

  // WR-02: кварталы вычисляются из горизонта (любой год), не захардкожены.
  // Для H2-2026: Q3 (уплата 2026-09-30) + Q4 (уплата 2026-12-31).
  const quarters = quartersInRange(horizonFrom, horizonTo)

  const taxPayments: Array<{ date: string; amountRub: number }> = []

  for (const qtr of quarters) {
    // Σ buyoutsRub за квартал из revenueSeries (уже обрезан по горизонту)
    const qtrBuyoutsRub = revenueSeries
      .filter((r) => r.date >= qtr.from && r.date <= qtr.to)
      .reduce((sum, r) => sum + r.buyoutsRub, 0)

    const taxAmount = computeQuarterAccrual(qtrBuyoutsRub, vatPct, incomeTaxPct)
    if (taxAmount > 0) {
      taxPayments.push({ date: qtr.payDate, amountRub: taxAmount })
    }
  }

  // ── 8. actualBalanceSeries (D-4): факт-ряд BankTransaction + CashEntry ─────

  // Сегодня по МСК (согласованно с finance/balance)
  const todayIsoMsk = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)

  // Ограничиваем [horizonFrom .. min(horizonTo, сегодня)]
  const actualTo = todayIsoMsk < horizonTo ? todayIsoMsk : horizonTo
  let actualBalanceSeries: Array<{ date: string; balanceRub: number }> = []

  if (horizonFrom <= actualTo) {
    const actualFromDate = horizonFromDate
    const actualToDate = parseUtcDate(actualTo)

    // BankTransaction по RUR-счетам за горизонт
    const txRows = await db.bankTransaction.findMany({
      where: {
        date: { gte: actualFromDate, lte: actualToDate },
        account: { currency: "RUR" },
      },
      select: { date: true, direction: true, amount: true },
    })

    // CashEntry за горизонт
    const cashRows = await db.cashEntry.findMany({
      where: {
        date: { gte: actualFromDate, lte: actualToDate },
      },
      select: { date: true, direction: true, amount: true },
    })

    // Агрегация дневных дельт
    const dayDeltaMap = new Map<string, number>()

    for (const tx of txRows) {
      const d = tx.date.toISOString().slice(0, 10)
      const delta = tx.direction === "CREDIT" ? Number(tx.amount) : -Number(tx.amount)
      dayDeltaMap.set(d, (dayDeltaMap.get(d) ?? 0) + delta)
    }

    for (const ce of cashRows) {
      const d = ce.date.toISOString().slice(0, 10)
      const delta = ce.direction === "INCOME" ? Number(ce.amount) : -Number(ce.amount)
      dayDeltaMap.set(d, (dayDeltaMap.get(d) ?? 0) + delta)
    }

    // Накопительный ряд от startingBalance
    const sortedDays = Array.from(dayDeltaMap.keys()).sort()
    let runningBalance = startingBalance
    const balanceByDay = new Map<string, number>()

    for (const d of sortedDays) {
      runningBalance += dayDeltaMap.get(d) ?? 0
      balanceByDay.set(d, runningBalance)
    }

    actualBalanceSeries = Array.from(balanceByDay.entries())
      .map(([date, balanceRub]) => ({ date, balanceRub }))
      .sort((a, b) => (a.date < b.date ? -1 : 1))
  }

  // ── Сборка результата ──────────────────────────────────────────────────────

  return {
    horizonFrom,
    horizonTo,
    startingBalance,
    gapThresholdRub,
    revenueSeries,
    wbPayoutPct,
    wbPayoutLagWeeks,
    payoutModel: "coefficient",
    realPurchasePayments,
    virtualPayments,
    loanPayments,
    taxPayments,
    opexMonthlyRub,
    actualBalanceSeries: actualBalanceSeries.length > 0 ? actualBalanceSeries : undefined,
    versionStale,
  }
}
