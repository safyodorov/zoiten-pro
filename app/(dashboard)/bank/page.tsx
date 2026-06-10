// app/(dashboard)/bank/page.tsx
// Phase 22 (22-05): RSC страница банковских операций.
// RBAC: requireSection("BANK"); canManage через getSectionRole.
// 6-мерный where-builder: companies/accounts/banks/direction/category/date + search.

import { requireSection, getSectionRole } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { BankImportButton } from "@/components/bank/BankImportButton"
import { BankFilters } from "@/components/bank/BankFilters"
import { BankTransactionsTable } from "@/components/bank/BankTransactionsTable"
import type { BankTxRow } from "@/components/bank/BankTransactionsTable"

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

  const [transactions, allCompanies, allAccounts, allBanks] = await Promise.all([
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
  ])

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
