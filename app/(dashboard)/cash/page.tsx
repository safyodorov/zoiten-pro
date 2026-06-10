// app/(dashboard)/cash/page.tsx
// Phase 23 (23-04): RSC страница кассы.
// Заменяет стаб из 23-02.
// RBAC: requireSection("CASH"); canManage через getSectionRole("CASH") === "MANAGE".
// Where-builder: year/direction/department/categories/responsibles/search.
// Итоги приход/расход/баланс через groupBy (реагируют на фильтры).
// totalCount через count(where) — для индикатора усечения в CashTable.
// take:1000 (касса может быть большой).

import { requireSection, getSectionRole } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { CashEntryForm } from "@/components/cash/CashEntryForm"
import { CashFilters } from "@/components/cash/CashFilters"
import { CashTable } from "@/components/cash/CashTable"
import type { CashRow } from "@/components/cash/CashTable"

export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<{
    fund?: string          // "yulya" (по умолч.) | "pavel" | "all" — касса/фонд
    year?: string
    dateFrom?: string
    dateTo?: string
    direction?: string
    department?: string
    categories?: string
    responsibles?: string
    search?: string
  }>
}) {
  await requireSection("CASH")
  const canManage = (await getSectionRole("CASH")) === "MANAGE"

  const sp = await searchParams

  // ── Парсинг фильтров ────────────────────────────────────────────────────

  const year = sp.year ? parseInt(sp.year, 10) : undefined
  const dateFrom = sp.dateFrom ? new Date(sp.dateFrom + "T00:00:00.000Z") : undefined
  const dateTo = sp.dateTo ? new Date(sp.dateTo + "T23:59:59.999Z") : undefined
  const direction = sp.direction as "INCOME" | "EXPENSE" | undefined
  const department = sp.department?.trim()
  const categoryIds = sp.categories?.split(",").filter(Boolean) ?? []
  const responsibleIds = sp.responsibles?.split(",").filter(Boolean) ?? []
  const search = sp.search?.trim()

  // ── Where-builder ────────────────────────────────────────────────────────

  const where: Prisma.CashEntryWhereInput = {}

  // Касса/фонд: по умолчанию «Юля» (офис-касса) — чтобы обороты не раздувались
  // фондом Павла. yulya = budget-yulya + ручные; pavel = budget-pavel; all = всё.
  const fund = sp.fund ?? "yulya"
  if (fund === "yulya") {
    where.source = { in: ["budget-yulya", "manual"] }
  } else if (fund === "pavel") {
    where.source = "budget-pavel"
  }
  // fund === "all" — без фильтра по source

  // Диапазон дат (календарь) имеет приоритет; иначе — быстрый фильтр по году
  if (dateFrom || dateTo) {
    where.date = {}
    if (dateFrom) (where.date as Prisma.DateTimeFilter).gte = dateFrom
    if (dateTo) (where.date as Prisma.DateTimeFilter).lte = dateTo
  } else if (year) {
    where.date = {
      gte: new Date(Date.UTC(year, 0, 1)),
      lt: new Date(Date.UTC(year + 1, 0, 1)),
    }
  }

  if (direction) {
    where.direction = direction
  }

  if (department) {
    where.department = department
  }

  if (categoryIds.length > 0) {
    where.categoryId = { in: categoryIds }
  }

  if (responsibleIds.length > 0) {
    where.responsibleEmployeeId = { in: responsibleIds }
  }

  if (search) {
    where.purpose = { contains: search, mode: "insensitive" }
  }

  // ── Параллельная загрузка данных ────────────────────────────────────────

  const [entries, totalCount, allCategories, allEmployees, activeEmployees, depRows, dateRows, totalsGroups] =
    await Promise.all([
      // Операции кассы (до 1000, по where)
      prisma.cashEntry.findMany({
        where,
        include: {
          category: true,
          responsibleEmployee: true,
        },
        orderBy: { date: "desc" },
        take: 1000,
      }),

      // Полное число записей по тому же where — для индикатора усечения
      prisma.cashEntry.count({ where }),

      // Справочник категорий (для фильтров + форма + inline CategoryCell)
      prisma.cashCategory.findMany({
        select: { id: true, name: true },
        orderBy: { sortOrder: "asc" },
      }),

      // Все сотрудники (для ФИЛЬТРА — включая уволенных, у них есть историч. операции)
      prisma.employee.findMany({
        select: { id: true, lastName: true, firstName: true },
        orderBy: { lastName: "asc" },
      }),

      // Только ДЕЙСТВУЮЩИЕ сотрудники (для формы добавления/редактирования) — fireDate null
      prisma.employee.findMany({
        where: { fireDate: null },
        select: { id: true, lastName: true, firstName: true },
        orderBy: { lastName: "asc" },
      }),

      // Уникальные подразделения (для фильтров + форма)
      prisma.cashEntry.findMany({
        where: { department: { not: null } },
        select: { department: true },
        distinct: ["department"],
        orderBy: { department: "asc" },
      }),

      // Годы (для фильтра год) — берём все даты, JS-distinct по году
      prisma.cashEntry.findMany({
        select: { date: true },
        orderBy: { date: "desc" },
      }),

      // Итоги приход/расход по тому же where (реагируют на фильтры)
      prisma.cashEntry.groupBy({
        by: ["direction"],
        where,
        _sum: { amount: true },
      }),
    ])

  // ── Вычисление итогов ────────────────────────────────────────────────────

  let income = 0
  let expense = 0
  for (const g of totalsGroups) {
    const sum = g._sum.amount != null ? Number(g._sum.amount) : 0
    if (g.direction === "INCOME") income = sum
    else if (g.direction === "EXPENSE") expense = sum
  }
  const totals = { income, expense, balance: income - expense }

  // ── Уникальные годы (JS distinct, по убыванию) ───────────────────────────

  const yearsSet = new Set<number>()
  for (const r of dateRows) {
    yearsSet.add(r.date.getUTCFullYear())
  }
  const years = Array.from(yearsSet).sort((a, b) => b - a)

  // ── Уникальные подразделения ─────────────────────────────────────────────

  const departments = depRows
    .map((r) => r.department)
    .filter((d): d is string => d !== null)

  // ── Маппинг в CashRow[] ──────────────────────────────────────────────────

  const rows: CashRow[] = entries.map((e) => ({
    id: e.id,
    date: e.date.toISOString().slice(0, 10),
    direction: e.direction,
    amount: Number(e.amount),
    department: e.department,
    categoryId: e.categoryId,
    categoryName: e.category?.name ?? null,
    purpose: e.purpose,
    responsibleEmployeeId: e.responsibleEmployeeId,
    responsibleName: e.responsibleEmployee
      ? `${e.responsibleEmployee.lastName} ${e.responsibleEmployee.firstName}`
      : e.responsibleNameRaw ?? null,
    comment: e.comment,
    fund: e.source === "budget-pavel" ? ("pavel" as const) : ("yulya" as const),
  }))

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Шапка: счётчик + кнопка добавления (только MANAGE) */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Операций: {totalCount}
        </div>
        {canManage && (
          <CashEntryForm
            categories={allCategories}
            employees={activeEmployees}
            departments={departments}
            defaultFund={fund === "pavel" ? "pavel" : "yulya"}
          />
        )}
      </div>

      {/* Фильтры */}
      <CashFilters
        categories={allCategories}
        employees={allEmployees}
        departments={departments}
        years={years}
      />

      {/* Таблица — flex-1 min-h-0 обязателен для sticky header (CLAUDE.md) */}
      <div className="flex-1 min-h-0">
        <CashTable
          rows={rows}
          categories={allCategories}
          employees={activeEmployees}
          departments={departments}
          canManage={canManage}
          totals={totals}
          totalCount={totalCount}
        />
      </div>
    </div>
  )
}
