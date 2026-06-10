// app/(dashboard)/bank/page.tsx
// Phase 22 (22-05): RSC страница банковских операций.
// RBAC: requireSection("BANK"); canManage через getSectionRole.
// 6-мерный where-builder: companies/accounts/banks/direction/category/date + search.
// Phase 22 (22-06): Dashboard-сводка сверху таблицы (остатки + приход/расход 7/30д).

import { requireSection, getSectionRole } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { BankImportButton } from "@/components/bank/BankImportButton"
import { BankFilters } from "@/components/bank/BankFilters"
import { BankTransactionsTable } from "@/components/bank/BankTransactionsTable"
import type { BankTxRow } from "@/components/bank/BankTransactionsTable"
import { BankDashboard } from "@/components/bank/BankDashboard"
import type { BankDashboardData, CompanyBalances, CompanyFlow } from "@/components/bank/BankDashboard"

export default async function BankPage({
  searchParams,
}: {
  searchParams: Promise<{
    companies?: string
    accounts?: string
    banks?: string
    direction?: string
    category?: string
    dateFrom?: string
    dateTo?: string
    search?: string
  }>
}) {
  await requireSection("BANK")
  const canManage = (await getSectionRole("BANK")) === "MANAGE"

  const sp = await searchParams

  // ── Парсинг фильтров ────────────────────────────────────────────────────

  const companyIds = sp.companies?.split(",").filter(Boolean) ?? []
  const accountIds = sp.accounts?.split(",").filter(Boolean) ?? []
  const bankIds = sp.banks?.split(",").filter(Boolean) ?? []
  const direction = sp.direction as "DEBIT" | "CREDIT" | undefined
  const category = sp.category
  const search = sp.search?.trim()
  const dateFrom = sp.dateFrom ? new Date(sp.dateFrom) : undefined
  const dateTo = sp.dateTo ? new Date(sp.dateTo + "T23:59:59.999Z") : undefined

  // ── Where-builder (6 измерений + search) ────────────────────────────────

  // Условия на account: companies + banks могут накладываться одновременно
  const accountWhere: Prisma.BankAccountWhereInput = {}
  if (companyIds.length > 0) {
    accountWhere.companyId = { in: companyIds }
  }
  if (bankIds.length > 0) {
    accountWhere.bankId = { in: bankIds }
  }

  const where: Prisma.BankTransactionWhereInput = {}

  if (accountIds.length > 0) {
    // Явно выбранные счета + ограничения компании/банка объединяются через AND
    where.AND = [
      { accountId: { in: accountIds } },
      ...(Object.keys(accountWhere).length > 0 ? [{ account: accountWhere }] : []),
    ]
  } else if (Object.keys(accountWhere).length > 0) {
    where.account = accountWhere
  }

  if (direction) {
    where.direction = direction
  }

  if (category) {
    where.category = category as "UNCATEGORIZED" | "INTERNAL_TRANSFER" | "BANK_FEE" | "SUPPLIER_PAYMENT" | "INCOME" | "TAX" | "LOAN" | "OTHER"
  }

  if (dateFrom || dateTo) {
    where.date = {}
    if (dateFrom) (where.date as Prisma.DateTimeFilter).gte = dateFrom
    if (dateTo) (where.date as Prisma.DateTimeFilter).lte = dateTo
  }

  if (search) {
    where.OR = [
      { purpose: { contains: search, mode: "insensitive" } },
      { counterpartyName: { contains: search, mode: "insensitive" } },
    ]
  }

  // ── Параллельная загрузка данных ────────────────────────────────────────

  const [transactions, allCompanies, allAccounts, allBanks, dashboardAccounts, dashboardTxAnchor] =
    await Promise.all([
      prisma.bankTransaction.findMany({
        where,
        include: {
          account: {
            include: {
              company: true,
              bank: true,
            },
          },
          counterparty: true,
        },
        orderBy: { date: "desc" },
        take: 500,
      }),
      prisma.company.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.bankAccount.findMany({
        select: { id: true, number: true, companyId: true, bankId: true },
        orderBy: { number: "asc" },
      }),
      prisma.bank.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      // ── Dashboard: все счета с остатками ────────────────────────────
      prisma.bankAccount.findMany({
        select: {
          currency: true,
          closingBalance: true,
          balanceDate: true,
          companyId: true,
          company: { select: { name: true } },
        },
      }),
      // ── Dashboard: MAX(tx.date) как запасной anchor ──────────────────
      prisma.bankTransaction.findFirst({
        select: { date: true },
        orderBy: { date: "desc" },
      }),
    ])

  // ── Dashboard: вычисление агрегатов ──────────────────────────────────────

  // 1. Anchor date = MAX(BankAccount.balanceDate) или MAX(tx.date)
  let anchorDate: Date | null = null
  for (const acc of dashboardAccounts) {
    if (acc.balanceDate) {
      if (!anchorDate || acc.balanceDate > anchorDate) {
        anchorDate = acc.balanceDate
      }
    }
  }
  if (!anchorDate && dashboardTxAnchor?.date) {
    anchorDate = dashboardTxAnchor.date
  }

  // 2. Остатки per-компания, разбитые по валютам
  //    (только счета с closingBalance != null)
  const balanceByCompany = new Map<string, Partial<Record<string, number>>>()
  for (const acc of dashboardAccounts) {
    if (acc.closingBalance === null || acc.closingBalance === undefined) continue
    const companyName = acc.company.name
    const cur = acc.currency ?? "RUR"
    const prev = balanceByCompany.get(companyName) ?? {}
    prev[cur] = (prev[cur] ?? 0) + Number(acc.closingBalance)
    balanceByCompany.set(companyName, prev)
  }

  // Grand total per-currency
  const grandTotalByCurrency: Partial<Record<string, number>> = {}
  for (const byCur of balanceByCompany.values()) {
    for (const [cur, v] of Object.entries(byCur)) {
      if (v === undefined) continue
      grandTotalByCurrency[cur] = (grandTotalByCurrency[cur] ?? 0) + v
    }
  }

  const companyBalances: CompanyBalances[] = Array.from(balanceByCompany.entries()).map(
    ([companyName, balancesByCurrency]) => ({ companyName, balancesByCurrency }),
  )

  // 3. Приход/расход за 7 и 30 дней — только RUR транзакции
  //    Примечание: CNY income/expense игнорируется для v1 (мало данных, нет смысла смешивать)
  //    Окна: (anchor - N days, anchor] — последние N дней включительно
  let income7dByCompany = new Map<string, number>()
  let expense7dByCompany = new Map<string, number>()
  let income30dByCompany = new Map<string, number>()
  let expense30dByCompany = new Map<string, number>()

  if (anchorDate) {
    const anchor = anchorDate
    // Fetching in-memory: берём все транзакции за последние 30 дней одним запросом,
    // потом in-memory делим на 7д vs 30д
    const cutoff30 = new Date(anchor)
    cutoff30.setDate(cutoff30.getDate() - 30)
    const cutoff7 = new Date(anchor)
    cutoff7.setDate(cutoff7.getDate() - 7)

    const recentTxs = await prisma.bankTransaction.findMany({
      where: {
        currency: "RUR",
        date: { gt: cutoff30, lte: anchor },
      },
      select: {
        date: true,
        direction: true,
        amount: true,
        account: {
          select: { company: { select: { name: true } } },
        },
      },
    })

    for (const tx of recentTxs) {
      const companyName = tx.account.company.name
      const amount = Number(tx.amount)
      const isCredit = tx.direction === "CREDIT"

      // 30d окно: все записи попадают (уже отфильтровано в WHERE)
      if (isCredit) {
        income30dByCompany.set(companyName, (income30dByCompany.get(companyName) ?? 0) + amount)
      } else {
        expense30dByCompany.set(companyName, (expense30dByCompany.get(companyName) ?? 0) + amount)
      }

      // 7d окно: только даты > cutoff7
      if (tx.date > cutoff7) {
        if (isCredit) {
          income7dByCompany.set(companyName, (income7dByCompany.get(companyName) ?? 0) + amount)
        } else {
          expense7dByCompany.set(companyName, (expense7dByCompany.get(companyName) ?? 0) + amount)
        }
      }
    }
  }

  // Список всех компаний из потоков
  const flowCompanyNames = new Set<string>([
    ...income7dByCompany.keys(),
    ...expense7dByCompany.keys(),
    ...income30dByCompany.keys(),
    ...expense30dByCompany.keys(),
  ])

  const companyFlows: CompanyFlow[] = Array.from(flowCompanyNames).map((companyName) => ({
    companyName,
    income7d: income7dByCompany.get(companyName) ?? 0,
    expense7d: expense7dByCompany.get(companyName) ?? 0,
    income30d: income30dByCompany.get(companyName) ?? 0,
    expense30d: expense30dByCompany.get(companyName) ?? 0,
  }))

  const grandFlow = {
    income7d: companyFlows.reduce((s, c) => s + c.income7d, 0),
    expense7d: companyFlows.reduce((s, c) => s + c.expense7d, 0),
    income30d: companyFlows.reduce((s, c) => s + c.income30d, 0),
    expense30d: companyFlows.reduce((s, c) => s + c.expense30d, 0),
  }

  const dashboardData: BankDashboardData = {
    anchorDate: anchorDate ? anchorDate.toISOString().slice(0, 10) : null,
    companyBalances,
    grandTotalByCurrency,
    companyFlows,
    grandFlow,
  }

  // ── Маппинг в BankTxRow[] ────────────────────────────────────────────────

  const rows: BankTxRow[] = transactions.map((t) => ({
    id: t.id,
    // date — @db.Date, ISO YYYY-MM-DD
    date: t.date.toISOString().slice(0, 10),
    direction: t.direction,
    amount: Number(t.amount), // Decimal → number
    currency: t.currency,
    docNumber: t.docNumber,
    operationType: t.operationType,
    purpose: t.purpose,
    counterpartyName: t.counterpartyName,
    counterpartyInn: t.counterpartyInn,
    category: t.category ?? "UNCATEGORIZED",
    companyName: t.account.company.name,
    accountNumber: t.account.number,
    bankName: t.account.bank.name,
  }))

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Шапка: заголовок + кнопка импорта (только MANAGE) */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Операций: {rows.length}{rows.length === 500 ? " (лимит 500)" : ""}
        </div>
        {canManage && <BankImportButton />}
      </div>

      {/* Дашборд-сводка: остатки + приход/расход (независим от фильтров) */}
      <BankDashboard data={dashboardData} />

      {/* Фильтры */}
      <BankFilters
        companies={allCompanies}
        accounts={allAccounts}
        banks={allBanks}
      />

      {/* Таблица — flex-1 min-h-0 обязателен для sticky header (CLAUDE.md) */}
      <div className="flex-1 min-h-0">
        <BankTransactionsTable rows={rows} canManage={canManage} />
      </div>
    </div>
  )
}
