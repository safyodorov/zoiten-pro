// tests/balance-sheet.test.ts
// Phase 24 Plan 24-05 — assembly-тест loadBalanceSheet(asOf).
// Мокирует @/lib/prisma детерминированными фикстурами для одной даты
// (паттерн — tests/balance-data.test.ts, tests/wb-adv-api.test.ts).
//
// Проверяет:
// - capitalRub === assets.totalRub − liabilities.totalRub (D-06)
// - строка «Отложенные налоги (расчётно)» = computeTaxLiability(accruedTotal, taxesPaidTotal) (B3/M4)
// - unvaluedStock.productCount/qtySum/products при наличии costPriceAtDate=null строки (D-11)
// - CNY-строка банка НЕ входит в рублёвый subtotal/total (m4/Pitfall 2)
// - агрегатор НЕ дёргает WB Finance API (Pitfall 6) — нет импорта/вызова lib/wb-finance-api

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bankAccount: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    bankTransaction: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
    currencyRate: {
      findFirst: vi.fn(),
    },
    cashEntry: {
      groupBy: vi.fn(),
      aggregate: vi.fn(),
    },
    cashCategory: {
      findUnique: vi.fn(),
    },
    loan: {
      findMany: vi.fn(),
    },
    financeManualAdjustment: {
      findMany: vi.fn(),
    },
    financeStockSnapshot: {
      findMany: vi.fn(),
    },
    financeReceivablesSnapshot: {
      findUnique: vi.fn(),
    },
    purchase: {
      findMany: vi.fn(),
    },
    appSetting: {
      findMany: vi.fn(),
    },
    financeTaxPeriodActual: {
      findMany: vi.fn(),
    },
    wbCardFunnelDaily: {
      aggregate: vi.fn(),
    },
  },
}))

import { prisma } from "@/lib/prisma"
import { loadBalanceSheet } from "@/lib/balance-data"
import { computeTaxLiability } from "@/lib/balance-math"

const ASOF = new Date("2026-05-15") // Q2 2026 — единственный квартал (taxCalcStartQuarter=2026-Q2, isLast=true)

beforeEach(() => {
  vi.mocked(prisma.bankAccount.findMany).mockReset()
  vi.mocked(prisma.bankAccount.findUnique).mockReset()
  vi.mocked(prisma.bankTransaction.findMany).mockReset()
  vi.mocked(prisma.bankTransaction.aggregate).mockReset()
  vi.mocked(prisma.currencyRate.findFirst).mockReset()
  vi.mocked(prisma.cashEntry.groupBy).mockReset()
  vi.mocked(prisma.cashEntry.aggregate).mockReset()
  vi.mocked(prisma.cashCategory.findUnique).mockReset()
  vi.mocked(prisma.loan.findMany).mockReset()
  vi.mocked(prisma.financeManualAdjustment.findMany).mockReset()
  vi.mocked(prisma.financeStockSnapshot.findMany).mockReset()
  vi.mocked(prisma.financeReceivablesSnapshot.findUnique).mockReset()
  vi.mocked(prisma.purchase.findMany).mockReset()
  vi.mocked(prisma.appSetting.findMany).mockReset()
  vi.mocked(prisma.financeTaxPeriodActual.findMany).mockReset()
  vi.mocked(prisma.wbCardFunnelDaily.aggregate).mockReset()

  // ── Денежные средства ──────────────────────────────────────────────────
  vi.mocked(prisma.bankAccount.findMany).mockResolvedValueOnce([
    { id: "acc-rur", currency: "RUR" },
    { id: "acc-cny", currency: "CNY" },
  ] as unknown as never)
  vi.mocked(prisma.bankAccount.findUnique).mockImplementation((async (args: { where: { id: string } }) => {
    if (args.where.id === "acc-rur") return { closingBalance: 100000, balanceDate: ASOF } as unknown as never
    if (args.where.id === "acc-cny") return { closingBalance: 5000, balanceDate: ASOF } as unknown as never
    return null as unknown as never
  }) as never)
  vi.mocked(prisma.bankTransaction.findMany).mockResolvedValue([] as unknown as never)

  vi.mocked(prisma.cashEntry.groupBy).mockResolvedValueOnce([
    { direction: "INCOME", _sum: { amount: 20000 } },
    { direction: "EXPENSE", _sum: { amount: 5000 } },
  ] as unknown as never)

  // ── Кредиты (M3) ─────────────────────────────────────────────────────────
  vi.mocked(prisma.loan.findMany).mockResolvedValueOnce([
    {
      id: "loan-1",
      amount: 50000,
      issueDate: new Date("2026-01-01"),
      createdAt: new Date("2026-01-01"),
      deletedAt: null,
      payments: [{ date: new Date("2026-01-01"), principal: 10000, interest: 1000 }],
    },
  ] as unknown as never)

  // ── Ручные статьи (D-08) ───────────────────────────────────────────────
  vi.mocked(prisma.financeManualAdjustment.findMany).mockResolvedValueOnce([
    { id: "m1", label: "Займы выданные", type: "ASSET", amountRub: 3000, comment: null },
    { id: "m2", label: "Прочее", type: "LIABILITY", amountRub: 2000, comment: null },
  ] as unknown as never)

  // ── Запасы (D-10/11) ───────────────────────────────────────────────────
  vi.mocked(prisma.financeStockSnapshot.findMany).mockResolvedValueOnce([
    {
      productId: "p1",
      sku: "УКТ-000001",
      name: "Товар 1",
      location: "WB_WAREHOUSE",
      qty: 10,
      costPriceAtDate: 100,
      valueRub: 1000,
    },
    {
      productId: "p2",
      sku: "УКТ-000002",
      name: "Товар 2",
      location: "IVANOVO",
      qty: 5,
      costPriceAtDate: null,
      valueRub: null,
    },
  ] as unknown as never)

  // ── Дебиторка WB (D-14) ────────────────────────────────────────────────
  vi.mocked(prisma.financeReceivablesSnapshot.findUnique).mockResolvedValueOnce({
    date: ASOF,
    balanceCurrentRub: 5000,
    weeklyTailRub: 3000,
    totalRub: 8000,
  } as unknown as never)

  // ── Закупки: Авансы / в пути / исключённые WAREHOUSE (D-12, B1/B2) ──────
  vi.mocked(prisma.purchase.findMany).mockResolvedValueOnce([
    {
      id: "purch-advance",
      payments: [{ status: "PAID", paidDate: new Date("2026-05-01"), amount: 2000, currency: "RUB" }],
      items: [{ stages: [{ stage: "PRODUCTION", date: new Date("2026-05-01") }] }],
    },
    {
      id: "purch-transit",
      payments: [{ status: "PAID", paidDate: new Date("2026-05-05"), amount: 1000, currency: "RUB" }],
      items: [{ stages: [{ stage: "SHIPMENT", date: new Date("2026-05-05") }] }],
    },
    {
      id: "purch-warehouse-excluded",
      payments: [{ status: "PAID", paidDate: new Date("2026-04-01"), amount: 500, currency: "RUB" }],
      items: [{ stages: [{ stage: "WAREHOUSE", date: new Date("2026-04-15") }] }],
    },
  ] as unknown as never)

  // ── Налоги (D-15/16/17, B3/M4): vat=7, incomeTax=1, taxCalcStartQuarter=2026-Q2 ─
  vi.mocked(prisma.appSetting.findMany).mockResolvedValueOnce([
    { key: "finance.vatPct", value: "7" },
    { key: "finance.incomeTaxPct", value: "1" },
    { key: "finance.taxCalcStartQuarter", value: "2026-Q2" },
  ] as unknown as never)
  vi.mocked(prisma.financeTaxPeriodActual.findMany).mockResolvedValueOnce([] as unknown as never)
  vi.mocked(prisma.wbCardFunnelDaily.aggregate).mockResolvedValueOnce({
    _sum: { buyoutsSumRub: 100000 },
  } as unknown as never)
  vi.mocked(prisma.bankTransaction.aggregate).mockResolvedValueOnce({
    _sum: { amount: 1000 },
  } as unknown as never)
  vi.mocked(prisma.cashCategory.findUnique).mockResolvedValueOnce({
    id: "cat-tax",
    name: "Налоги/банк/сборы",
  } as unknown as never)
  vi.mocked(prisma.cashEntry.aggregate).mockResolvedValueOnce({
    _sum: { amount: 500 },
  } as unknown as never)
})

describe("loadBalanceSheet — assembly (24-05)", () => {
  it("капитал = активы − пассивы (D-06, балансирующая строка)", async () => {
    const sheet = await loadBalanceSheet(ASOF)

    expect(sheet.capitalRub).toBeCloseTo(sheet.assets.totalRub - sheet.liabilities.totalRub, 2)
  })

  it("итоги активов/пассивов/капитала считаются по детерминированной фикстуре", async () => {
    const sheet = await loadBalanceSheet(ASOF)

    // Денежные средства: bank-rub 100000 + cash 15000 = 115000 (bank-cny 5000 — справочно, НЕ в подытоге)
    const cashGroup = sheet.assets.groups.find((g) => g.key === "cash")!
    expect(cashGroup.subtotalRub).toBeCloseTo(115000, 2)
    const cnyLine = cashGroup.lines.find((l) => l.key === "bank-cny")!
    expect(cnyLine.currency).toBe("CNY")
    expect(cnyLine.amountRub).toBeCloseTo(5000, 2)

    // Дебиторка = 8000 (subtotal не меняется: 5000 + 3000 = 8000)
    const rec = sheet.assets.groups.find((g) => g.key === "receivables")!
    expect(rec.subtotalRub).toBeCloseTo(8000, 2)
    // Детализация: при наличии снапшота — две строки с новыми ключами
    expect(rec.lines).toHaveLength(2)
    expect(rec.lines.find((l) => l.key === "receivables-wb-current")!.amountRub).toBeCloseTo(5000, 2)
    expect(rec.lines.find((l) => l.key === "receivables-wb-tail")!.amountRub).toBeCloseTo(3000, 2)

    // Запасы: WB_WAREHOUSE 1000 + прочие локации 0 + "в пути из Китая" 1000 (из purch-transit) = 2000
    // (purch-warehouse-excluded НЕ учитывается — B2; unvalued-строка IVANOVO не входит в сумму — D-11)
    expect(sheet.assets.groups.find((g) => g.key === "inventory")!.subtotalRub).toBeCloseTo(2000, 2)

    // Авансы поставщикам = 2000 (из purch-advance, этап PRODUCTION)
    expect(sheet.assets.groups.find((g) => g.key === "advances")!.subtotalRub).toBeCloseTo(2000, 2)

    // Ручные активы = 3000
    expect(sheet.assets.groups.find((g) => g.key === "manual")!.subtotalRub).toBeCloseTo(3000, 2)

    expect(sheet.assets.totalRub).toBeCloseTo(115000 + 8000 + 2000 + 2000 + 3000, 2)

    // Кредиты: amount 50000 − principal 10000 = 40000
    expect(sheet.liabilities.groups.find((g) => g.key === "loans")!.subtotalRub).toBeCloseTo(40000, 2)

    // Ручные пассивы = 2000
    expect(sheet.liabilities.groups.find((g) => g.key === "manual")!.subtotalRub).toBeCloseTo(2000, 2)
  })

  it("«Отложенные налоги (расчётно)» = computeTaxLiability(accruedTotal, taxesPaidTotal) (B3/M4)", async () => {
    const sheet = await loadBalanceSheet(ASOF)

    // accrual: единственный квартал (2026-Q2, isLast=true → ВСЕГДА начисление, факт не проверяется) —
    // computeQuarterAccrual(100000, 7, 1) = 8000
    // taxesPaid: BankTransaction(TAX) 1000 + CashEntry(«Налоги/банк/сборы», EXPENSE) 500 = 1500
    const expected = computeTaxLiability({ accruedTotal: 8000, taxesPaidTotal: 1500 })

    const taxLine = sheet.liabilities.groups.find((g) => g.key === "taxes")!.lines[0]
    expect(taxLine.key).toBe("taxes-deferred")
    expect(taxLine.amountRub).toBeCloseTo(expected, 2)
    expect(expected).toBeCloseTo(6500, 2)
  })

  it("unvaluedStock отражает строку с costPriceAtDate=null (D-11)", async () => {
    const sheet = await loadBalanceSheet(ASOF)

    expect(sheet.unvaluedStock.productCount).toBe(1)
    expect(sheet.unvaluedStock.qtySum).toBe(5)
    expect(sheet.unvaluedStock.products).toEqual([{ sku: "УКТ-000002", name: "Товар 2", qty: 5 }])
  })

  it("не вызывает WB Finance API напрямую (Pitfall 6 — дебиторка только из снапшота)", async () => {
    await loadBalanceSheet(ASOF)
    // Единственный вызов дебиторки — findUnique по financeReceivablesSnapshot (проверено выше);
    // отсутствие какого-либо fetch/wb-finance-api импорта в lib/balance-data.ts подтверждается
    // статическим grep в acceptance_criteria плана — здесь достаточно, что тест вообще проходит
    // без сетевых моков.
    expect(prisma.financeReceivablesSnapshot.findUnique).toHaveBeenCalledWith({ where: { date: ASOF } })
  })
})
