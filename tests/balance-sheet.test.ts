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
//
// 260704-cvz: добавлены тесты drill-down children (инвариант Σдетей=amountRub, сортировка desc)

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
    // Новый мок для product.findMany (drill-down 260704-cvz)
    product: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from "@/lib/prisma"
import { loadBalanceSheet } from "@/lib/balance-data"
import { computeTaxLiability } from "@/lib/balance-math"
import type { BalanceLine } from "@/lib/balance-data"

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
  vi.mocked(prisma.product.findMany).mockReset()

  // ── Денежные средства ──────────────────────────────────────────────────
  // 260704-cvz: два RUR-счёта (60000 + 40000 = 100000) для проверки ≥2 детей и сортировки.
  // bankRurTotal = 100000 → cashGroup.subtotalRub = 115000 (не изменился)
  vi.mocked(prisma.bankAccount.findMany).mockResolvedValueOnce([
    { id: "acc-rur", currency: "RUR", number: "40702810000000000001", bank: { name: "Сбербанк" } },
    { id: "acc-rur2", currency: "RUR", number: "40702810000000000002", bank: { name: "ВТБ" } },
    { id: "acc-cny", currency: "CNY", number: "40702840000000000001", bank: { name: "ВТБ" } },
  ] as unknown as never)
  vi.mocked(prisma.bankAccount.findUnique).mockImplementation((async (args: { where: { id: string } }) => {
    // acc-rur: 60000 на ASOF (без транзакций → closing=60000)
    if (args.where.id === "acc-rur") return { closingBalance: 60000, balanceDate: ASOF } as unknown as never
    // acc-rur2: 40000 на ASOF
    if (args.where.id === "acc-rur2") return { closingBalance: 40000, balanceDate: ASOF } as unknown as never
    if (args.where.id === "acc-cny") return { closingBalance: 5000, balanceDate: ASOF } as unknown as never
    return null as unknown as never
  }) as never)
  vi.mocked(prisma.bankTransaction.findMany).mockResolvedValue([] as unknown as never)

  vi.mocked(prisma.cashEntry.groupBy).mockResolvedValueOnce([
    { direction: "INCOME", _sum: { amount: 20000 } },
    { direction: "EXPENSE", _sum: { amount: 5000 } },
  ] as unknown as never)

  // ── Кредиты (M3) ─────────────────────────────────────────────────────────
  // 260704-cvz: два кредита (currentBalance 20000 + 20000 = 40000) для ≥2 детей.
  // loansTotal = 40000 → loans subtotal не изменился
  //   loan-1: amount=20000, нет платежей → currentBalance=20000
  //   loan-2: amount=25000, principal=5000 → currentBalance=20000
  vi.mocked(prisma.loan.findMany).mockResolvedValueOnce([
    {
      id: "loan-1",
      lenderId: "lender-jetlend",
      contractNumber: "№ 3702242101-23-1",
      lender: { name: "JetLend" },
      amount: 20000,
      issueDate: new Date("2026-01-01"),
      createdAt: new Date("2026-01-01"),
      deletedAt: null,
      payments: [],
    },
    {
      id: "loan-2",
      lenderId: "lender-jetlend",
      contractNumber: "№ 3702242101-23-2",
      lender: { name: "JetLend" },
      amount: 25000,
      issueDate: new Date("2026-02-01"),
      createdAt: new Date("2026-02-01"),
      deletedAt: null,
      payments: [{ date: new Date("2026-03-01"), principal: 5000, interest: 500 }],
    },
  ] as unknown as never)

  // ── Ручные статьи (D-08) ───────────────────────────────────────────────
  vi.mocked(prisma.financeManualAdjustment.findMany).mockResolvedValueOnce([
    { id: "m1", label: "Займы выданные", type: "ASSET", amountRub: 3000, comment: null },
    { id: "m2", label: "Прочее", type: "LIABILITY", amountRub: 2000, comment: null },
  ] as unknown as never)

  // ── Запасы (D-10/11) ───────────────────────────────────────────────────
  // 260704-cvz: два valued-товара в WB_WAREHOUSE (600 + 400 = 1000) для ≥2 детей.
  // stockByLocation[WB_WAREHOUSE] = 1000 → inventory subtotal не изменился
  vi.mocked(prisma.financeStockSnapshot.findMany).mockResolvedValueOnce([
    {
      productId: "p1",
      sku: "УКТ-000001",
      name: "Товар 1",
      location: "WB_WAREHOUSE",
      qty: 6,
      costPriceAtDate: 100,
      valueRub: 600,
    },
    {
      productId: "p3",
      sku: "УКТ-000003",
      name: "Товар 3",
      location: "WB_WAREHOUSE",
      qty: 4,
      costPriceAtDate: 100,
      valueRub: 400,
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
    weeklyTailRub: 3000, // справочно, НЕ суммируется в дебиторку
    totalRub: 5000, // = current (новая формула, weeklyTail исключён)
  } as unknown as never)

  // ── Закупки: Авансы / в пути / исключённые WAREHOUSE (D-12, B1/B2) ──────
  // 260704-cvz: добавлены productId/quantity/unitPrice для аллокации drill-down.
  // purch-advance: 2000 ₽ → два товара p1:1000 + p3:1000 (weight 5*200=1000 и 4*250=1000)
  // purch-transit: 1000 ₽ → два товара p1:600 + p3:400 (weight 6*100=600 и 4*100=400)
  vi.mocked(prisma.purchase.findMany).mockResolvedValueOnce([
    {
      id: "purch-advance",
      payments: [{ status: "PAID", paidDate: new Date("2026-05-01"), amount: 2000, currency: "RUB" }],
      items: [
        {
          productId: "p1",
          quantity: 5,
          unitPrice: { toNumber: () => 200 }, // Decimal-мок
          stages: [{ stage: "PRODUCTION", date: new Date("2026-05-01") }],
        },
        {
          productId: "p3",
          quantity: 4,
          unitPrice: { toNumber: () => 250 }, // Decimal-мок
          stages: [{ stage: "PRODUCTION", date: new Date("2026-05-01") }],
        },
      ],
    },
    {
      id: "purch-transit",
      payments: [{ status: "PAID", paidDate: new Date("2026-05-05"), amount: 1000, currency: "RUB" }],
      items: [
        {
          productId: "p1",
          quantity: 6,
          unitPrice: { toNumber: () => 100 }, // Decimal-мок
          stages: [{ stage: "SHIPMENT", date: new Date("2026-05-05") }],
        },
        {
          productId: "p3",
          quantity: 4,
          unitPrice: { toNumber: () => 100 }, // Decimal-мок
          stages: [{ stage: "SHIPMENT", date: new Date("2026-05-05") }],
        },
      ],
    },
    {
      id: "purch-warehouse-excluded",
      payments: [{ status: "PAID", paidDate: new Date("2026-04-01"), amount: 500, currency: "RUB" }],
      items: [
        {
          productId: "p1",
          quantity: 5,
          unitPrice: { toNumber: () => 100 },
          stages: [{ stage: "WAREHOUSE", date: new Date("2026-04-15") }],
        },
      ],
    },
  ] as unknown as never)

  // ── product.findMany мок (новый вызов для drill-down, 260704-cvz) ──────────
  // p1 и p3 — в одной категории, разных подкатегориях
  vi.mocked(prisma.product.findMany).mockResolvedValueOnce([
    {
      id: "p1",
      sku: "УКТ-000001",
      name: "Товар 1",
      category: { id: "cat-a", name: "Категория А" },
      subcategory: { id: "sub-a1", name: "Подкатегория А1" },
    },
    {
      id: "p3",
      sku: "УКТ-000003",
      name: "Товар 3",
      category: { id: "cat-a", name: "Категория А" },
      subcategory: { id: "sub-a2", name: "Подкатегория А2" },
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

    // Денежные средства: bank-rub 100000 (= 60000 + 40000) + cash 15000 = 115000
    // (bank-cny 5000 — справочно, НЕ в подытоге)
    const cashGroup = sheet.assets.groups.find((g) => g.key === "cash")!
    expect(cashGroup.subtotalRub).toBeCloseTo(115000, 2)
    const cnyLine = cashGroup.lines.find((l) => l.key === "bank-cny")!
    expect(cnyLine.currency).toBe("CNY")
    expect(cnyLine.amountRub).toBeCloseTo(5000, 2)

    // Дебиторка = current (5000). weeklyTail (3000) НЕ в сумме — двойной счёт (выкупы уже в current).
    const rec = sheet.assets.groups.find((g) => g.key === "receivables")!
    expect(rec.subtotalRub).toBeCloseTo(5000, 2)
    // Одна строка = balanceCurrentRub при наличии снапшота
    expect(rec.lines).toHaveLength(1)
    expect(rec.lines.find((l) => l.key === "receivables-wb")!.amountRub).toBeCloseTo(5000, 2)

    // Запасы: WB_WAREHOUSE 1000 (= 600 + 400) + прочие локации 0 + "в пути из Китая" 1000 = 2000
    // (purch-warehouse-excluded НЕ учитывается — B2; unvalued-строка IVANOVO не входит в сумму — D-11)
    expect(sheet.assets.groups.find((g) => g.key === "inventory")!.subtotalRub).toBeCloseTo(2000, 2)

    // Авансы поставщикам = 2000 (из purch-advance, этап PRODUCTION)
    expect(sheet.assets.groups.find((g) => g.key === "advances")!.subtotalRub).toBeCloseTo(2000, 2)

    // Ручные активы = 3000
    expect(sheet.assets.groups.find((g) => g.key === "manual")!.subtotalRub).toBeCloseTo(3000, 2)

    expect(sheet.assets.totalRub).toBeCloseTo(115000 + 5000 + 2000 + 2000 + 3000, 2)

    // Кредиты: loan-1 currentBalance 20000 + loan-2 currentBalance 20000 = 40000
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

// ── drill-down children (260704-cvz) ─────────────────────────────────────────

/**
 * Рекурсивно суммирует amountRub листовых узлов (узлы без children).
 * Инвариант: sumLeaves(line) === line.amountRub для всех разворачиваемых строк.
 */
function sumLeaves(line: BalanceLine): number {
  if (!line.children || line.children.length === 0) return line.amountRub
  return line.children.reduce((s, child) => s + sumLeaves(child), 0)
}

/**
 * Проверяет, что children отсортированы по убыванию amountRub (невозрастание).
 */
function assertSortedDesc(children: BalanceLine[]): void {
  for (let i = 0; i < children.length - 1; i++) {
    expect(children[i].amountRub).toBeGreaterThanOrEqual(children[i + 1].amountRub)
  }
}

describe("drill-down children (260704-cvz)", () => {
  it("инвариант Σ листьев = amountRub для stock-wb-warehouse", async () => {
    const sheet = await loadBalanceSheet(ASOF)

    const inv = sheet.assets.groups.find((g) => g.key === "inventory")!
    const stockWb = inv.lines.find((l) => l.key === "stock-wb-warehouse")!

    // Фикстура: p1(600) + p3(400) = 1000
    expect(stockWb.amountRub).toBeCloseTo(1000, 2)
    // Инвариант: Σ листьев === amountRub строки
    expect(sumLeaves(stockWb)).toBeCloseTo(stockWb.amountRub, 2)
    // Должны быть children
    expect(stockWb.children).toBeDefined()
    expect(stockWb.children!.length).toBeGreaterThan(0)
  })

  it("инвариант Σ листьев = amountRub для stock-in-transit-china", async () => {
    const sheet = await loadBalanceSheet(ASOF)

    const inv = sheet.assets.groups.find((g) => g.key === "inventory")!
    const transit = inv.lines.find((l) => l.key === "stock-in-transit-china")!

    // purch-transit: 1000 ₽ → p1:600 + p3:400
    expect(transit.amountRub).toBeCloseTo(1000, 2)
    expect(sumLeaves(transit)).toBeCloseTo(transit.amountRub, 2)
  })

  it("инвариант Σ листьев = amountRub для advances-suppliers", async () => {
    const sheet = await loadBalanceSheet(ASOF)

    const adv = sheet.assets.groups.find((g) => g.key === "advances")!
    const advLine = adv.lines.find((l) => l.key === "advances-suppliers")!

    // purch-advance: 2000 ₽ → p1:1000 + p3:1000
    expect(advLine.amountRub).toBeCloseTo(2000, 2)
    expect(sumLeaves(advLine)).toBeCloseTo(advLine.amountRub, 2)
  })

  it("инвариант Σ листьев = amountRub для bank-rub", async () => {
    const sheet = await loadBalanceSheet(ASOF)

    const cash = sheet.assets.groups.find((g) => g.key === "cash")!
    const bankRub = cash.lines.find((l) => l.key === "bank-rub")!

    // acc-rur(60000) + acc-rur2(40000) = 100000
    expect(bankRub.amountRub).toBeCloseTo(100000, 2)
    expect(sumLeaves(bankRub)).toBeCloseTo(bankRub.amountRub, 2)
    // Должно быть ровно 2 дочерних счёта
    expect(bankRub.children).toHaveLength(2)
  })

  it("инвариант Σ листьев = amountRub для loans-balance", async () => {
    const sheet = await loadBalanceSheet(ASOF)

    const loans = sheet.liabilities.groups.find((g) => g.key === "loans")!
    const loansBalance = loans.lines.find((l) => l.key === "loans-balance")!

    // loan-1(20000) + loan-2(20000) = 40000
    expect(loansBalance.amountRub).toBeCloseTo(40000, 2)
    expect(sumLeaves(loansBalance)).toBeCloseTo(loansBalance.amountRub, 2)
  })

  it("bank-rub children отсортированы по убыванию amountRub", async () => {
    const sheet = await loadBalanceSheet(ASOF)

    const cash = sheet.assets.groups.find((g) => g.key === "cash")!
    const bankRub = cash.lines.find((l) => l.key === "bank-rub")!

    expect(bankRub.children).toBeDefined()
    expect(bankRub.children!.length).toBeGreaterThanOrEqual(2)
    assertSortedDesc(bankRub.children!)
    // Первый = acc-rur (60000 > 40000 = acc-rur2)
    expect(bankRub.children![0].amountRub).toBeCloseTo(60000, 2)
    expect(bankRub.children![1].amountRub).toBeCloseTo(40000, 2)
  })

  it("stock-wb-warehouse children (категории) отсортированы по убыванию amountRub", async () => {
    const sheet = await loadBalanceSheet(ASOF)

    const inv = sheet.assets.groups.find((g) => g.key === "inventory")!
    const stockWb = inv.lines.find((l) => l.key === "stock-wb-warehouse")!

    // p1 и p3 в одной категории → один категорийный узел (cat-a с суммой 1000)
    // Инвариант Σ на уровне категорий
    expect(stockWb.children).toBeDefined()
    assertSortedDesc(stockWb.children!)

    // Проверяем сортировку на уровне подкатегорий (вложенно)
    for (const catNode of stockWb.children!) {
      if (catNode.children && catNode.children.length > 1) {
        assertSortedDesc(catNode.children)
      }
    }
  })

  it("loans-balance дерево Кредитор→Кредит отсортировано desc", async () => {
    const sheet = await loadBalanceSheet(ASOF)

    const loans = sheet.liabilities.groups.find((g) => g.key === "loans")!
    const loansBalance = loans.lines.find((l) => l.key === "loans-balance")!

    expect(loansBalance.children).toBeDefined()
    assertSortedDesc(loansBalance.children!)

    // Один кредитор (JetLend) с двумя кредитами
    const lenderNode = loansBalance.children![0]
    expect(lenderNode.children).toBeDefined()
    expect(lenderNode.children!.length).toBe(2)
    assertSortedDesc(lenderNode.children!)

    // Оба кредита по 20000 (могут быть равны — сортировка допускает равные)
    expect(lenderNode.children![0].amountRub).toBeCloseTo(20000, 2)
    expect(lenderNode.children![1].amountRub).toBeCloseTo(20000, 2)
  })

  it("товарные узлы drill-down имеют читаемый label sku+name", async () => {
    const sheet = await loadBalanceSheet(ASOF)

    const cash = sheet.assets.groups.find((g) => g.key === "cash")!
    const bankRub = cash.lines.find((l) => l.key === "bank-rub")!

    // bank-rub children: «Название банка · Номер счёта»
    expect(bankRub.children).toBeDefined()
    const sberChild = bankRub.children!.find((c) => c.key === "bank-rub/acct:acc-rur")
    expect(sberChild).toBeDefined()
    expect(sberChild!.label).toContain("Сбербанк")

    // stock-wb-warehouse → cat → sub → product: label должен содержать sku
    const inv = sheet.assets.groups.find((g) => g.key === "inventory")!
    const stockWb = inv.lines.find((l) => l.key === "stock-wb-warehouse")!
    const allProductNodes: BalanceLine[] = []
    const collectLeaves = (node: BalanceLine) => {
      if (!node.children || node.children.length === 0) {
        allProductNodes.push(node)
      } else {
        node.children.forEach(collectLeaves)
      }
    }
    if (stockWb.children) stockWb.children.forEach(collectLeaves)
    // Листовые узлы должны содержать sku в label
    expect(allProductNodes.some((n) => n.label.includes("УКТ-000001"))).toBe(true)
    expect(allProductNodes.some((n) => n.label.includes("УКТ-000003"))).toBe(true)
  })
})
