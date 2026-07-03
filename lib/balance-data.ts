// lib/balance-data.ts
// Phase 24 Plan 24-04 — point-in-time хелперы для отчёта «Баланс» (loadBalanceSheet, Plan 24-05).
//
// getBankBalanceAsOf — знак CREDIT=+ (приход) / DEBIT=− (расход); границы интервала
// (X, anchor] строгие по X (см. app/(dashboard)/bank/page.tsx — прецедент anchor=MAX(balanceDate)).
// getRateForDate — курс ЦБ РФ на дату X (не только «последний»); fallback на самый ранний
// доступный курс с флагом approximate=true (CurrencyRate — forward-only sync с 2026-06-09,
// см. 24-RESEARCH.md Pitfall 4).
// stageAsOf — этап закупки на дату X через pre-filter (date <= X) + существующий
// currentStageOf() (lib/purchase-stages.ts, D-12). m7: этап с progress.date=null считается
// достигнутым ТОЛЬКО когда asOf — текущая дата (паритет с /procurement, который дату игнорирует);
// на исторические даты undated-этап не учитывается (не завышаем прошлое).

import { prisma } from "@/lib/prisma"
import { currentStageOf } from "@/lib/purchase-stages"
import { startOfDayMsk } from "@/lib/date-periods"
import { computeLoanAggregates } from "@/lib/loan-math"
import { computeQuarterAccrual, computeTaxLiability, computeCapital } from "@/lib/balance-math"

/** Остаток банковского счёта на произвольную дату asOf (не только anchor = balanceDate). */
export async function getBankBalanceAsOf(accountId: string, asOf: Date): Promise<number | null> {
  const account = await prisma.bankAccount.findUnique({
    where: { id: accountId },
    select: { closingBalance: true, balanceDate: true },
  })
  if (!account?.closingBalance || !account.balanceDate) return null
  const closing = Number(account.closingBalance)
  const anchor = account.balanceDate
  if (asOf.getTime() >= anchor.getTime()) {
    // asOf в будущем (или равно anchor) относительно anchor: closing + транзакции (anchor, asOf]
    const txs = await prisma.bankTransaction.findMany({
      where: { accountId, date: { gt: anchor, lte: asOf } },
      select: { direction: true, amount: true },
    })
    const delta = txs.reduce((s, t) => s + (t.direction === "CREDIT" ? 1 : -1) * Number(t.amount), 0)
    return closing + delta
  }
  // asOf в прошлом относительно anchor: closing минус транзакции (asOf, anchor]
  const txs = await prisma.bankTransaction.findMany({
    where: { accountId, date: { gt: asOf, lte: anchor } },
    select: { direction: true, amount: true },
  })
  const delta = txs.reduce((s, t) => s + (t.direction === "CREDIT" ? 1 : -1) * Number(t.amount), 0)
  return closing - delta
}

export interface RateAsOf {
  rateToRub: number
  date: Date
  approximate: boolean
}

/** Курс ЦБ РФ на дату платежа asOf (point-in-time, не «последний известный»). */
export async function getRateForDate(code: string, asOf: Date): Promise<RateAsOf | null> {
  const exact = await prisma.currencyRate.findFirst({
    where: { code, date: { lte: asOf } },
    orderBy: { date: "desc" },
  })
  if (exact) return { rateToRub: Number(exact.rateToRub), date: exact.date, approximate: false }
  // fallback: самый ранний доступный курс (курсы forward-only с 2026-06-09), с флагом approximate
  const earliest = await prisma.currencyRate.findFirst({ where: { code }, orderBy: { date: "asc" } })
  return earliest ? { rateToRub: Number(earliest.rateToRub), date: earliest.date, approximate: true } : null
}

/**
 * Текущий этап закупки на дату asOf. Pre-filter достигнутых этапов (date <= asOf) →
 * делегирует в currentStageOf() (самый дальний по STAGE_ORDER).
 *
 * m7: этап с progress.date=null («достигнут, время неизвестно») учитывается достигнутым
 * ТОЛЬКО когда asOf соответствует текущей дате (паритет с /procurement currentStageOf,
 * который дату вообще игнорирует). Для исторических дат undated-этап во времени
 * разместить нельзя → не учитывается (не завышаем прошлое).
 */
export function stageAsOf(
  stages: Array<{ stage: string; date: Date | null }>,
  asOf: Date,
  now: Date = new Date()
): string | null {
  const asOfIsCurrent = asOf.getTime() >= startOfDayMsk(now).getTime()
  const reached = stages
    .filter(
      (s) =>
        (s.date != null && s.date.getTime() <= asOf.getTime()) ||
        (s.date == null && asOfIsCurrent) // undated → достигнут только «сейчас» (m7, паритет с /procurement)
    )
    .map((s) => s.stage)
  return currentStageOf(reached)
}

// ──────────────────────────────────────────────────────────────────
// Phase 24 Plan 24-05 — loadBalanceSheet(asOf): полный агрегатор баланса.
// D-05..D-17. Ретро-вычислимые статьи (банк/касса/кредиты/авансы/налоги) —
// на лету через date <= asOf; снапшот-статьи (запасы, дебиторка WB) — из
// таблиц Plan 24-01 (FinanceStockSnapshot/FinanceReceivablesSnapshot).
// ──────────────────────────────────────────────────────────────────

// ── Types ────────────────────────────────────────────────────────────────────

export interface BalanceLine {
  key: string
  label: string
  amountRub: number
  /** m4: currency==="CNY" — справочная строка, НЕ входит в рублёвый subtotal/total (Pitfall 2). */
  currency?: "RUB" | "CNY"
  approximate?: boolean
  note?: string
}

export interface BalanceGroup {
  key: string
  label: string
  lines: BalanceLine[]
  subtotalRub: number
}

export interface BalanceSection {
  key: "assets" | "liabilities"
  label: string
  groups: BalanceGroup[]
  totalRub: number
}

export interface UnvaluedStock {
  productCount: number
  qtySum: number
  products: Array<{ sku: string; name: string; qty: number }>
}

export interface BalanceSheet {
  date: Date
  assets: BalanceSection
  liabilities: BalanceSection
  capitalRub: number
  unvaluedStock: UnvaluedStock // D-11
}

// ── Local helpers ────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Σ строк группы БЕЗ CNY-справочных строк (m4/Pitfall 2 — не в рублёвых итогах). */
function sumRubLines(lines: BalanceLine[]): number {
  return round2(lines.filter((l) => l.currency !== "CNY").reduce((s, l) => s + l.amountRub, 0))
}

const STOCK_LOCATION_ORDER = ["WB_WAREHOUSE", "WB_IN_WAY_TO_CLIENT", "WB_IN_WAY_FROM_CLIENT", "IVANOVO"] as const

const STOCK_LOCATION_LABELS: Record<string, string> = {
  WB_WAREHOUSE: "Склады WB",
  WB_IN_WAY_TO_CLIENT: "WB в пути к клиенту",
  WB_IN_WAY_FROM_CLIENT: "WB в пути от клиента",
  IVANOVO: "Склад Иваново",
}

const STOCK_LOCATION_KEYS: Record<string, string> = {
  WB_WAREHOUSE: "stock-wb-warehouse",
  WB_IN_WAY_TO_CLIENT: "stock-wb-in-way-to-client",
  WB_IN_WAY_FROM_CLIENT: "stock-wb-in-way-from-client",
  IVANOVO: "stock-ivanovo",
}

/**
 * Начало квартала (МСК) для произвольной пары (year, quarter 1..4).
 * Формат идентичен startOfQuarterMsk (lib/date-periods.ts:41), но принимает
 * год/квартал напрямую (нужно для точки отсчёта taxCalcStartQuarter и итерации
 * по кварталам — startOfQuarterMsk даёт только квартал ТЕКУЩЕЙ даты).
 */
function quarterStartDate(year: number, quarter: number): Date {
  const month = (quarter - 1) * 3 + 1 // 1,4,7,10
  const mm = String(month).padStart(2, "0")
  return new Date(`${year}-${mm}-01T00:00:00+03:00`)
}

/** Парсит "YYYY-Qn" (AppSetting finance.taxCalcStartQuarter) → {year, quarter}. Fallback безопасный дефолт 2026-Q2 (M4). */
function parseQuarterKey(key: string): { year: number; quarter: number } {
  const m = /^(\d{4})-Q([1-4])$/.exec(key)
  if (!m) return { year: 2026, quarter: 2 }
  return { year: parseInt(m[1], 10), quarter: parseInt(m[2], 10) }
}

// ── loadBalanceSheet ──────────────────────────────────────────────────────────

/**
 * Собирает полный управленческий баланс на дату asOf (D-05..D-17).
 *
 * m6: asOf обозначает КОНЕЦ дня этой календарной даты. Снапшот-статьи читаются
 * по date=asOf; live-статьи — по date<=asOf. Обе конвенции согласованы.
 */
export async function loadBalanceSheet(asOf: Date): Promise<BalanceSheet> {
  // ── Денежные средства + Кредиты + Ручные статьи ─────────────────────────

  const [bankAccounts, cashGroups, loans, manualAdjustments] = await Promise.all([
    prisma.bankAccount.findMany({ select: { id: true, currency: true } }),
    prisma.cashEntry.groupBy({
      by: ["direction"],
      where: { date: { lte: asOf } },
      _sum: { amount: true },
    }),
    // deletedAt НЕ фильтруем в запросе — point-in-time фильтр по дате ниже (M3)
    prisma.loan.findMany({ include: { payments: true } }),
    prisma.financeManualAdjustment.findMany({
      where: {
        effectiveFrom: { lte: asOf },
        OR: [{ deletedAt: null }, { deletedAt: { gt: asOf } }],
      },
    }),
  ])

  // Банк: RUR-счета → рублёвая строка; CNY-счета → отдельная справочная строка (m4/Pitfall 2)
  const bankBalances = await Promise.all(
    bankAccounts.map(async (acc) => ({
      currency: acc.currency,
      balance: await getBankBalanceAsOf(acc.id, asOf),
    }))
  )
  let bankRurTotal = 0
  let bankCnyTotal = 0
  let hasCnyAccount = false
  for (const b of bankBalances) {
    if (b.balance == null) continue
    if (b.currency === "RUR") bankRurTotal += b.balance
    else if (b.currency === "CNY") {
      bankCnyTotal += b.balance
      hasCnyAccount = true
    }
  }

  // Касса: Σ INCOME − Σ EXPENSE, date <= asOf (паттерн app/(dashboard)/cash/page.tsx:155-164)
  let cashBalance = 0
  for (const g of cashGroups) {
    const sum = g._sum.amount != null ? Number(g._sum.amount) : 0
    cashBalance += g.direction === "INCOME" ? sum : -sum
  }

  const cashLines: BalanceLine[] = [
    { key: "bank-rub", label: "Банковские счета (₽)", amountRub: round2(bankRurTotal) },
  ]
  if (hasCnyAccount) {
    cashLines.push({
      key: "bank-cny",
      label: "Банковские счета (CNY)",
      amountRub: round2(bankCnyTotal),
      currency: "CNY",
      note: "справочно, не в итоге (валютная переоценка не выполняется, v1)",
    })
  }
  cashLines.push({ key: "cash", label: "Касса", amountRub: round2(cashBalance) })

  const cashGroup: BalanceGroup = {
    key: "cash",
    label: "Денежные средства",
    lines: cashLines,
    subtotalRub: sumRubLines(cashLines),
  }

  // Кредиты (M3 — point-in-time: не выдан на asOf → пропуск; soft-delete по дате удаления)
  let loansTotal = 0
  for (const loan of loans) {
    const issued = loan.issueDate ?? loan.createdAt
    if (issued.getTime() > asOf.getTime()) continue // M3: кредит ещё не выдан на asOf
    if (loan.deletedAt != null && loan.deletedAt.getTime() <= asOf.getTime()) continue // M3: удалён к asOf
    const amount = Number(loan.amount)
    const payments = loan.payments.map((p) => ({
      date: p.date,
      principal: Number(p.principal),
      interest: Number(p.interest),
    }))
    const agg = computeLoanAggregates(amount, payments, asOf)
    loansTotal += agg.currentBalance
  }

  const loansGroup: BalanceGroup = {
    key: "loans",
    label: "Кредиты и займы",
    lines: [{ key: "loans-balance", label: "Остаток по кредитам", amountRub: round2(loansTotal) }],
    subtotalRub: round2(loansTotal),
  }

  // Ручные статьи (D-08)
  const manualAssetLines: BalanceLine[] = manualAdjustments
    .filter((a) => a.type === "ASSET")
    .map((a) => ({
      key: `manual-${a.id}`,
      label: a.label,
      amountRub: Number(a.amountRub),
      note: a.comment ?? undefined,
    }))
  const manualLiabilityLines: BalanceLine[] = manualAdjustments
    .filter((a) => a.type === "LIABILITY")
    .map((a) => ({
      key: `manual-${a.id}`,
      label: a.label,
      amountRub: Number(a.amountRub),
      note: a.comment ?? undefined,
    }))

  // ── Запасы (снапшот) + Дебиторка WB ──────────────────────────────────────

  const [stockRows, receivablesSnapshot] = await Promise.all([
    prisma.financeStockSnapshot.findMany({ where: { date: asOf } }),
    prisma.financeReceivablesSnapshot.findUnique({ where: { date: asOf } }),
  ])

  const stockByLocation = new Map<string, number>()
  for (const loc of STOCK_LOCATION_ORDER) stockByLocation.set(loc, 0)
  const unvaluedMap = new Map<string, { sku: string; name: string; qty: number }>()
  let unvaluedQtySum = 0

  for (const row of stockRows) {
    if (row.costPriceAtDate == null) {
      // D-11: «без оценки» — НЕ включаем qty×null в сумму запасов
      unvaluedQtySum += row.qty
      const existing = unvaluedMap.get(row.productId)
      if (existing) existing.qty += row.qty
      else unvaluedMap.set(row.productId, { sku: row.sku, name: row.name, qty: row.qty })
      continue
    }
    const value = Number(row.valueRub ?? 0)
    stockByLocation.set(row.location, (stockByLocation.get(row.location) ?? 0) + value)
  }

  const unvaluedStock: UnvaluedStock = {
    productCount: unvaluedMap.size,
    qtySum: unvaluedQtySum,
    products: [...unvaluedMap.values()].sort((a, b) => b.qty - a.qty),
  }

  const stockLines: BalanceLine[] = STOCK_LOCATION_ORDER.map((loc) => ({
    key: STOCK_LOCATION_KEYS[loc],
    label: STOCK_LOCATION_LABELS[loc],
    amountRub: round2(stockByLocation.get(loc) ?? 0),
  }))
  // "Товар в пути из Китая" строка добавляется ниже, после классификации закупок (D-12)

  const receivablesLine: BalanceLine = receivablesSnapshot
    ? { key: "receivables-wb", label: "Дебиторка Wildberries", amountRub: Number(receivablesSnapshot.totalRub) }
    : {
        key: "receivables-wb",
        label: "Дебиторка Wildberries",
        amountRub: 0,
        note: "нет снапшота на дату",
        approximate: true,
      }

  const receivablesGroup: BalanceGroup = {
    key: "receivables",
    label: "Дебиторка",
    lines: [receivablesLine],
    subtotalRub: sumRubLines([receivablesLine]),
  }

  // ── Авансы поставщикам / Товар в пути из Китая (D-12, B1/B2) ─────────────

  const purchases = await prisma.purchase.findMany({
    include: { items: { include: { stages: true } }, payments: true },
  })

  let advancesTotal = 0
  let advancesApproximate = false
  let inTransitTotal = 0
  let inTransitApproximate = false

  for (const purchase of purchases) {
    // Уплачено в ₽ на asOf (B1): только PAID + paidDate!=null + paidDate<=asOf, курс на дату платежа.
    // НЕ фильтруем по текущему Purchase.status — закупка, закрытая ПОСЛЕ asOf, не должна исчезать
    // ретроактивно (B1); классификация ниже идёт по этапу на asOf, не по статусу.
    let paidRub = 0
    let paidApproximate = false
    for (const p of purchase.payments) {
      if (p.status !== "PAID") continue
      if (p.paidDate == null) continue
      if (p.paidDate.getTime() > asOf.getTime()) continue
      const amount = Number(p.amount)
      if (p.currency === "RUB" || p.currency === "RUR") {
        paidRub += amount
        continue
      }
      const rate = await getRateForDate(p.currency, p.paidDate)
      if (rate == null) continue // курса вообще нет — консервативно не учитываем (нет данных)
      paidRub += amount * rate.rateToRub
      if (rate.approximate) paidApproximate = true
    }
    if (paidRub <= 0) continue // ничего не уплачено на asOf — закупка не участвует в балансе

    // Этап на asOf (B2) — классификация по stageAsOf, НЕ по currentStageOf-без-фильтра
    const allStages = purchase.items.flatMap((item) => item.stages.map((s) => ({ stage: s.stage, date: s.date })))
    const stage = stageAsOf(allStages, asOf)

    if (stage === "WAREHOUSE") {
      continue // B2: уже принят на складе — покрыт снапшотом остатков, исключаем полностью (не двойной счёт)
    } else if (stage === "SHIPMENT" || stage === "TRANSIT") {
      inTransitTotal += paidRub
      if (paidApproximate) inTransitApproximate = true
    } else {
      // null | PRODUCTION | INSPECTION (до отгрузки)
      advancesTotal += paidRub
      if (paidApproximate) advancesApproximate = true
    }
  }

  stockLines.push({
    key: "stock-in-transit-china",
    label: "Товар в пути из Китая",
    amountRub: round2(inTransitTotal),
    approximate: inTransitApproximate || undefined,
  })

  const inventoryGroup: BalanceGroup = {
    key: "inventory",
    label: "Запасы",
    lines: stockLines,
    subtotalRub: sumRubLines(stockLines),
  }

  const advancesLines: BalanceLine[] = [
    {
      key: "advances-suppliers",
      label: "Авансы поставщикам",
      amountRub: round2(advancesTotal),
      approximate: advancesApproximate || undefined,
    },
  ]
  const advancesGroup: BalanceGroup = {
    key: "advances",
    label: "Авансы поставщикам",
    lines: advancesLines,
    subtotalRub: sumRubLines(advancesLines),
  }

  // ── Налоги (D-15/16/17, B3/M4) ────────────────────────────────────────────

  const [settingsRows, taxActuals] = await Promise.all([
    prisma.appSetting.findMany({
      where: { key: { in: ["finance.vatPct", "finance.incomeTaxPct", "finance.taxCalcStartQuarter"] } },
    }),
    prisma.financeTaxPeriodActual.findMany(),
  ])
  const settingsMap = new Map(settingsRows.map((r) => [r.key, r.value]))
  const vatPct = Number(settingsMap.get("finance.vatPct") ?? "7")
  const incomeTaxPct = Number(settingsMap.get("finance.incomeTaxPct") ?? "1")
  const { year: startYear, quarter: startQuarter } = parseQuarterKey(
    settingsMap.get("finance.taxCalcStartQuarter") ?? "2026-Q2"
  )
  const startOfCalcDate = quarterStartDate(startYear, startQuarter)

  // Перечисляем кварталы [startOfCalc .. текущий (содержащий asOf)] включительно (M4)
  const quarters: Array<{ year: number; quarter: number; start: Date }> = []
  let qy = startYear
  let qq = startQuarter
  while (quarterStartDate(qy, qq).getTime() <= asOf.getTime()) {
    quarters.push({ year: qy, quarter: qq, start: quarterStartDate(qy, qq) })
    qq += 1
    if (qq > 4) {
      qq = 1
      qy += 1
    }
  }

  const actualMap = new Map(taxActuals.map((r) => [`${r.year}-${r.quarter}`, r]))

  let accruedTotal = 0
  for (let i = 0; i < quarters.length; i++) {
    const { year, quarter, start } = quarters[i]
    const isLast = i === quarters.length - 1 // текущий (незакрытый) квартал относительно asOf — ВСЕГДА начисление
    const fact = !isLast ? actualMap.get(`${year}-${quarter}`) : undefined
    if (fact && (fact.vatActualRub != null || fact.incomeTaxActualRub != null)) {
      accruedTotal += Number(fact.vatActualRub ?? 0) + Number(fact.incomeTaxActualRub ?? 0) // D-17
      continue
    }
    // Начисление (D-16, БЕЗ вычитания платежей — B3, вычитание делается ниже, глобально, один раз)
    const rangeEnd = isLast ? asOf : new Date(quarters[i + 1].start.getTime() - 1)
    const buyoutAgg = await prisma.wbCardFunnelDaily.aggregate({
      where: { date: { gte: start, lte: rangeEnd } },
      _sum: { buyoutsSumRub: true },
    })
    const buyouts = buyoutAgg._sum.buyoutsSumRub ?? 0
    accruedTotal += computeQuarterAccrual(buyouts, vatPct, incomeTaxPct)
  }

  // Факты за кварталы ДО startOfCalc (fact-only — нет базы WbCardFunnelDaily до 01.04.2026, M4)
  let earliestFactStart: Date | null = null
  for (const r of taxActuals) {
    if (r.vatActualRub == null && r.incomeTaxActualRub == null) continue
    const rStart = quarterStartDate(r.year, r.quarter)
    if (rStart.getTime() < startOfCalcDate.getTime()) {
      accruedTotal += Number(r.vatActualRub ?? 0) + Number(r.incomeTaxActualRub ?? 0)
    }
    if (earliestFactStart == null || rStart.getTime() < earliestFactStart.getTime()) {
      earliestFactStart = rStart
    }
  }

  // taxesPaidTotal — вычитание ЕДИНОЖДЫ, глобально, вне ветвления факт/расчёт (B3)
  const taxWindowStart =
    earliestFactStart != null && earliestFactStart.getTime() < startOfCalcDate.getTime()
      ? earliestFactStart
      : startOfCalcDate

  const [taxBankAgg, taxCashCategory] = await Promise.all([
    prisma.bankTransaction.aggregate({
      where: { category: "TAX", date: { gte: taxWindowStart, lte: asOf } },
      _sum: { amount: true },
    }),
    prisma.cashCategory.findUnique({ where: { name: "Налоги/банк/сборы" } }),
  ])

  let taxCashTotal = 0
  if (taxCashCategory) {
    const taxCashAgg = await prisma.cashEntry.aggregate({
      where: { categoryId: taxCashCategory.id, direction: "EXPENSE", date: { gte: taxWindowStart, lte: asOf } },
      _sum: { amount: true },
    })
    taxCashTotal = Number(taxCashAgg._sum.amount ?? 0)
  }

  const taxesPaidTotal = Number(taxBankAgg._sum.amount ?? 0) + taxCashTotal

  const taxLiability = computeTaxLiability({
    accruedTotal: round2(accruedTotal),
    taxesPaidTotal: round2(taxesPaidTotal),
  })

  const taxLines: BalanceLine[] = [
    {
      key: "taxes-deferred",
      label: "Отложенные налоги (расчётно)",
      amountRub: taxLiability,
      note:
        "Приближённая оценка: категоризация уплаченных налогов (BankTransaction category=TAX + касса " +
        "«Налоги/банк/сборы») может быть неполной. Для закрытых кварталов вводите факт (D-17).",
    },
  ]
  const taxesGroup: BalanceGroup = {
    key: "taxes",
    label: "Налоговые обязательства",
    lines: taxLines,
    subtotalRub: sumRubLines(taxLines),
  }

  // ── Assembly ──────────────────────────────────────────────────────────────

  const assetGroups: BalanceGroup[] = [cashGroup, receivablesGroup, inventoryGroup, advancesGroup]
  if (manualAssetLines.length > 0) {
    assetGroups.push({
      key: "manual",
      label: "Ручные статьи",
      lines: manualAssetLines,
      subtotalRub: sumRubLines(manualAssetLines),
    })
  }

  const liabilityGroups: BalanceGroup[] = [loansGroup, taxesGroup]
  if (manualLiabilityLines.length > 0) {
    liabilityGroups.push({
      key: "manual",
      label: "Ручные статьи",
      lines: manualLiabilityLines,
      subtotalRub: sumRubLines(manualLiabilityLines),
    })
  }

  const assets: BalanceSection = {
    key: "assets",
    label: "Активы",
    groups: assetGroups,
    totalRub: round2(assetGroups.reduce((s, g) => s + g.subtotalRub, 0)),
  }
  const liabilities: BalanceSection = {
    key: "liabilities",
    label: "Пассивы",
    groups: liabilityGroups,
    totalRub: round2(liabilityGroups.reduce((s, g) => s + g.subtotalRub, 0)),
  }

  const capitalRub = computeCapital(assets.totalRub, liabilities.totalRub)

  return { date: asOf, assets, liabilities, capitalRub, unvaluedStock }
}
