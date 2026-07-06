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
import {
  CASHFLOW_SETTING_KEYS,
  CASHFLOW_SETTING_DEFAULTS,
  type CashflowSettingKey,
} from "@/lib/cashflow-schemas"
import { eachDayIso } from "./engine"
import type { CashflowInputs } from "./types"

// ── Параметры загрузчика ────────────────────────────────────────────────────

export interface LoadCashflowParams {
  versionId: string
  horizonFrom: string   // "2026-07-01"
  horizonTo: string     // "2026-12-31"
}

// ── Ключи AppSetting ────────────────────────────────────────────────────────

// IN-01: канонический список и дефолты — lib/cashflow-schemas.ts. Здесь только
// расширение налоговыми ключами (они не редактируются через AssumptionsBar).
const LOADER_SETTING_KEYS = [
  ...CASHFLOW_SETTING_KEYS,
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
 * 5. realPurchasePayments — PurchasePayment PLANNED + OVERDUE (отток = max(dueDate,
 *    сегодня МСК, horizonFrom)), amountRub-приоритет
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
    where: { key: { in: [...LOADER_SETTING_KEYS] } },
  })
  const settingsMap = new Map(settingRows.map((r) => [r.key, r.value]))

  // WR-04: NaN-guard — повреждённое значение AppSetting (нечисловая/пустая
  // строка после ручного SQL или сбоя импорта) не должно утекать в симуляцию:
  // NaN каскадом рушит balanceEnd на всех днях, KPI и график.
  const settingNum = (raw: string | undefined, def: number): number => {
    if (raw == null || raw.trim() === "") return def
    const n = Number(raw)
    return Number.isFinite(n) ? n : def
  }
  const settingOrDefault = (key: CashflowSettingKey): number =>
    settingNum(settingsMap.get(key), CASHFLOW_SETTING_DEFAULTS[key])

  const wbPayoutPct = settingOrDefault("finance.cashflow.wbPayoutPct")
  const wbPayoutLagWeeks = settingOrDefault("finance.cashflow.wbPayoutLagWeeks")
  const opexMonthlyRub = settingOrDefault("finance.cashflow.opexMonthlyRub")
  const gapThresholdRub = settingOrDefault("finance.cashflow.gapThresholdRub")
  const vatPct = settingNum(settingsMap.get("finance.vatPct"), 7)
  const incomeTaxPct = settingNum(settingsMap.get("finance.incomeTaxPct"), 1)

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

  // WR-09: счёт без анкера (closingBalance/balanceDate) даёт null и НЕ входит
  // в стартовый баланс. Его транзакции исключаются и из факт-ряда (шаг 8) —
  // единый набор счетов, иначе дельты двигают линию факта от якоря,
  // в котором этого счёта нет (систематический перекос план/факт).
  const anchoredAccountIds = bankAccounts
    .filter((_, i) => bankBalances[i] != null)
    .map((acc) => acc.id)

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

  // ── 5. realPurchasePayments (PLANNED в горизонте + OVERDUE) ───────────────

  // Сегодня по МСК (согласованно с finance/balance); используется и в шаге 8
  const todayIsoMsk = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)

  const purchasePaymentRows = await db.purchasePayment.findMany({
    where: {
      OR: [
        { status: "PLANNED", dueDate: { gte: horizonFromDate, lte: horizonToDate } },
        // WR-07: просроченные, но не оплаченные — отток всё ещё впереди
        { status: "OVERDUE", dueDate: { lte: horizonToDate } },
      ],
    },
    select: {
      amount: true,
      amountRub: true,
      currency: true,
      dueDate: true,
      status: true,
    },
  })

  // amountRub-приоритет (паттерн D-3 / balance-data B1 / quick-260704-go2)
  // поле курса getRateForDate = rateToRub (НЕ rate)
  // WR-05: курсы резолвятся последовательно с кэшем per (валюта, дата) —
  // вместо залпа параллельных запросов в пул соединений на каждый платёж
  const rateCache = new Map<string, number>()
  const realPurchasePayments: Array<{ date: string; amountRub: number }> = []

  for (const payment of purchasePaymentRows) {
    const dueIso = payment.dueDate.toISOString().slice(0, 10)
    // WR-07: просроченный платёж уплачивается не раньше сегодня
    // (и не раньше старта горизонта — иначе движок его молча отбросит)
    const outflowIso =
      payment.status === "OVERDUE"
        ? [dueIso, todayIsoMsk, horizonFrom].reduce((a, b) => (a > b ? a : b))
        : dueIso
    let amountRub: number
    if (payment.amountRub != null) {
      amountRub = Number(payment.amountRub)
    } else {
      const cacheKey = `${payment.currency}:${dueIso}`
      let rateToRub = rateCache.get(cacheKey)
      if (rateToRub === undefined) {
        const rate = await getRateForDate(payment.currency, payment.dueDate)
        rateToRub = rate?.rateToRub ?? 1
        rateCache.set(cacheKey, rateToRub)
      }
      amountRub = Number(payment.amount) * rateToRub
    }
    realPurchasePayments.push({ date: outflowIso, amountRub })
  }

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

  // Ограничиваем [horizonFrom .. min(horizonTo, сегодня МСК)]
  const actualTo = todayIsoMsk < horizonTo ? todayIsoMsk : horizonTo
  let actualBalanceSeries: Array<{ date: string; balanceRub: number }> = []

  if (horizonFrom <= actualTo) {
    const actualFromDate = horizonFromDate
    const actualToDate = parseUtcDate(actualTo)

    // BankTransaction за горизонт — только счета, вошедшие в стартовый баланс
    // (WR-09: тот же набор счетов, что и в шаге 2; bankAccounts уже RUR-only)
    const txRows = await db.bankTransaction.findMany({
      where: {
        date: { gte: actualFromDate, lte: actualToDate },
        accountId: { in: anchoredAccountIds },
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

    // Накопительный ряд от startingBalance с форвард-филлом (WR-03):
    // в день без движений остаток не «неизвестен» — он равен остатку
    // предыдущего дня, иначе линия факта на графике рвётся на сегменты.
    let runningBalance = startingBalance
    for (const d of eachDayIso(horizonFrom, actualTo)) {
      runningBalance += dayDeltaMap.get(d) ?? 0
      actualBalanceSeries.push({ date: d, balanceRub: runningBalance })
    }
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
