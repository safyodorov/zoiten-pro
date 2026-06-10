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
import type { BankDashboardData, CompanyRow } from "@/components/bank/BankDashboard"

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
      // ── Dashboard: все счета с остатками + банк/номер (для разбивки) ──
      prisma.bankAccount.findMany({
        select: {
          number: true,
          currency: true,
          closingBalance: true,
          balanceDate: true,
          companyId: true,
          company: { select: { name: true } },
          bank: { select: { name: true } },
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

  // 2. Инфо по всем счетам (для разбивки «развернуть счета»)
  type AcctInfo = {
    bankName: string
    accountNumber: string
    currency: string
    companyName: string
    closingBalance: number | null
  }
  const acctInfo = new Map<string, AcctInfo>() // accountNumber → info
  for (const acc of dashboardAccounts) {
    acctInfo.set(acc.number, {
      bankName: acc.bank.name,
      accountNumber: acc.number,
      currency: acc.currency ?? "RUR",
      companyName: acc.company.name,
      closingBalance: acc.closingBalance != null ? Number(acc.closingBalance) : null,
    })
  }

  // 3. Приход/расход за 7 и 30 дней — только RUR, per-счёт, ТОЛЬКО внешние контрагенты
  //    Окна: (anchor - N days, anchor]
  type Flow = { income7d: number; expense7d: number; income30d: number; expense30d: number }
  const zeroFlow = (): Flow => ({ income7d: 0, expense7d: 0, income30d: 0, expense30d: 0 })
  const flowByAccount = new Map<string, Flow>() // accountNumber → flow

  if (anchorDate) {
    const anchor = anchorDate

    // ── Детектор внутренних переводов (между нашими компаниями/счетами) ──
    // Приход/расход учитывает ТОЛЬКО внешних контрагентов. Операция внутренняя,
    // если счёт контрагента входит в наши счета ИЛИ ИНН контрагента — наш
    // (бутстрап: ИНН со счётом из наших + Company.inn наших компаний).
    const ourAccountNumbers = new Set(allAccounts.map((a) => a.number))

    const [innFromOurAccounts, ownCompanyInns] = await Promise.all([
      prisma.bankTransaction.findMany({
        where: { counterpartyAccount: { in: Array.from(ourAccountNumbers) } },
        select: { counterpartyInn: true },
        distinct: ["counterpartyInn"],
      }),
      prisma.company.findMany({
        where: { accounts: { some: {} }, inn: { not: null } },
        select: { inn: true },
      }),
    ])
    const ourInns = new Set<string>()
    for (const r of innFromOurAccounts) if (r.counterpartyInn) ourInns.add(r.counterpartyInn)
    for (const c of ownCompanyInns) if (c.inn) ourInns.add(c.inn)

    const isInternal = (counterpartyAccount: string | null, counterpartyInn: string | null) =>
      (counterpartyAccount != null && ourAccountNumbers.has(counterpartyAccount)) ||
      (counterpartyInn != null && ourInns.has(counterpartyInn))

    const cutoff30 = new Date(anchor)
    cutoff30.setDate(cutoff30.getDate() - 30)
    const cutoff7 = new Date(anchor)
    cutoff7.setDate(cutoff7.getDate() - 7)

    const recentTxs = await prisma.bankTransaction.findMany({
      where: { currency: "RUR", date: { gt: cutoff30, lte: anchor } },
      select: {
        date: true,
        direction: true,
        amount: true,
        counterpartyAccount: true,
        counterpartyInn: true,
        account: { select: { number: true } },
      },
    })

    for (const tx of recentTxs) {
      if (isInternal(tx.counterpartyAccount, tx.counterpartyInn)) continue // внутренний перевод

      const acctNum = tx.account.number
      const amount = Number(tx.amount)
      const isCredit = tx.direction === "CREDIT"
      const in7 = tx.date > cutoff7

      let f = flowByAccount.get(acctNum)
      if (!f) { f = zeroFlow(); flowByAccount.set(acctNum, f) }
      if (isCredit) { f.income30d += amount; if (in7) f.income7d += amount }
      else { f.expense30d += amount; if (in7) f.expense7d += amount }
    }
  }

  // 4. Собираем CompanyRow[] с разбивкой по счетам (accounts)
  const companyMap = new Map<string, CompanyRow>()
  for (const info of acctInfo.values()) {
    let row = companyMap.get(info.companyName)
    if (!row) {
      row = {
        companyName: info.companyName,
        balancesByCurrency: {},
        income7d: 0, expense7d: 0, income30d: 0, expense30d: 0,
        accounts: [],
      }
      companyMap.set(info.companyName, row)
    }
    const f = flowByAccount.get(info.accountNumber) ?? zeroFlow()
    if (info.closingBalance != null) {
      row.balancesByCurrency[info.currency] =
        (row.balancesByCurrency[info.currency] ?? 0) + info.closingBalance
    }
    row.income7d += f.income7d
    row.expense7d += f.expense7d
    row.income30d += f.income30d
    row.expense30d += f.expense30d
    row.accounts.push({
      bankName: info.bankName,
      accountNumber: info.accountNumber,
      currency: info.currency,
      closingBalance: info.closingBalance,
      ...f,
    })
  }

  const companies: CompanyRow[] = Array.from(companyMap.values()).sort((a, b) =>
    a.companyName.localeCompare(b.companyName, "ru"),
  )
  for (const c of companies) {
    c.accounts.sort(
      (a, b) => a.bankName.localeCompare(b.bankName, "ru") || a.accountNumber.localeCompare(b.accountNumber),
    )
  }

  // Grand totals
  const grandTotalByCurrency: Partial<Record<string, number>> = {}
  for (const c of companies) {
    for (const [cur, v] of Object.entries(c.balancesByCurrency)) {
      if (v === undefined) continue
      grandTotalByCurrency[cur] = (grandTotalByCurrency[cur] ?? 0) + v
    }
  }
  const grandFlow = {
    income7d: companies.reduce((s, c) => s + c.income7d, 0),
    expense7d: companies.reduce((s, c) => s + c.expense7d, 0),
    income30d: companies.reduce((s, c) => s + c.income30d, 0),
    expense30d: companies.reduce((s, c) => s + c.expense30d, 0),
  }

  const dashboardData: BankDashboardData = {
    anchorDate: anchorDate ? anchorDate.toISOString().slice(0, 10) : null,
    companies,
    grandTotalByCurrency,
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
    comment: t.comment,
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
