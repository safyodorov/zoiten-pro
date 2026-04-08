// app/(dashboard)/employees/page.tsx
// Employees module — RSC page with server-side data fetching

import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { EmployeeFilters } from "@/components/employees/EmployeeFilters"
import { EmployeesTable } from "@/components/employees/EmployeesTable"

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    companies?: string
    q?: string
    group?: string
    dept?: string
  }>
}) {
  await requireSection("EMPLOYEES")

  const { status, companies: companiesParam, q, group, dept } = await searchParams

  const currentStatus = (status === "fired" || status === "all" ? status : "active") as
    | "active"
    | "fired"
    | "all"
  const selectedCompanyIds = companiesParam ? companiesParam.split(",").filter(Boolean) : []
  const currentGroup = group === "1"
  const currentDept = dept === "OFFICE" || dept === "WAREHOUSE" ? dept : null
  const currentSearch = q?.trim() ?? ""

  // Build where clause
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}

  if (currentStatus === "active") {
    where.fireDate = null
  } else if (currentStatus === "fired") {
    where.fireDate = { not: null }
  }
  // "all" — no fireDate filter

  if (selectedCompanyIds.length > 0) {
    where.companies = {
      some: {
        companyId: { in: selectedCompanyIds },
      },
    }
  }

  if (currentDept) {
    where.department = currentDept
  }

  if (currentSearch) {
    where.OR = [
      { lastName: { contains: currentSearch, mode: "insensitive" } },
      { firstName: { contains: currentSearch, mode: "insensitive" } },
      { middleName: { contains: currentSearch, mode: "insensitive" } },
    ]
  }

  const [employees, allCompanies] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: {
        companies: {
          include: { company: true },
          orderBy: { company: { name: "asc" } },
        },
        phones: true,
        emails: true,
        passes: true,
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.company.findMany({ orderBy: { name: "asc" } }),
  ])

  // Serialize for client components — Decimal is not serializable
  const serializedEmployees = employees.map((emp) => ({
    ...emp,
    companies: emp.companies.map((ec) => ({
      ...ec,
      rate: Number(ec.rate),
    })),
  }))

  const companiesForFilters = allCompanies.map((c) => ({ id: c.id, name: c.name }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Сотрудники</h1>
        <span className="text-sm text-muted-foreground">{employees.length} чел.</span>
      </div>

      <EmployeeFilters
        companies={companiesForFilters}
        selectedCompanyIds={selectedCompanyIds}
        currentStatus={currentStatus}
        currentGroup={currentGroup}
        currentDept={currentDept}
        currentSearch={currentSearch}
        allCompanies={companiesForFilters}
      />

      <EmployeesTable
        employees={serializedEmployees}
        allCompanies={companiesForFilters}
        grouped={currentGroup}
      />
    </div>
  )
}
