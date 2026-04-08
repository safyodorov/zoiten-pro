"use client"

import { useState } from "react"
import { EmployeeModal } from "@/components/employees/EmployeeModal"

// ── Types ──────────────────────────────────────────────────────────

interface Company {
  id: string
  name: string
}

interface EmployeePhone {
  id: string
  number: string
  type: "PERSONAL" | "WORK"
}

interface EmployeeEmail {
  id: string
  email: string
  type: "PERSONAL" | "WORK"
}

interface EmployeePass {
  id: string
  number: string
}

interface EmployeeCompanyEntry {
  id: string
  companyId: string
  company: Company
  rate: number | string
  salary: number | null
  trudovoyDogovor: boolean
  prikazPriema: boolean
  soglasiePersDannyh: boolean
  nda: boolean
  lichnayaKartochka: boolean
  zayavlenieUvolneniya: boolean
  prikazUvolneniya: boolean
}

interface Employee {
  id: string
  lastName: string
  firstName: string
  middleName: string | null
  position: string | null
  birthDate: Date | string | null
  hireDate: Date | string | null
  fireDate: Date | string | null
  companies: EmployeeCompanyEntry[]
  phones: EmployeePhone[]
  emails: EmployeeEmail[]
  passes: EmployeePass[]
}

interface EmployeesTableProps {
  employees: Employee[]
  allCompanies: Company[]
  grouped?: boolean
}

// ── Helpers ────────────────────────────────────────────────────────

function formatDate(val: Date | string | null | undefined): string {
  if (!val) return "—"
  const d = typeof val === "string" ? new Date(val) : val
  if (isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function calcAge(birthDate: Date | string | null | undefined): number | null {
  if (!birthDate) return null
  const d = typeof birthDate === "string" ? new Date(birthDate) : birthDate
  if (isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const monthDiff = now.getMonth() - d.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d.getDate())) {
    age--
  }
  return age
}

/**
 * Returns number of days until next birthday (0 = today, negative if passed this year and next year counts).
 */
function daysUntilBirthday(birthDate: Date | string | null | undefined): number | null {
  if (!birthDate) return null
  const d = typeof birthDate === "string" ? new Date(birthDate) : birthDate
  if (isNaN(d.getTime())) return null

  const now = new Date()
  // Moscow timezone offset = UTC+3
  const moscowNow = new Date(now.getTime() + 3 * 60 * 60 * 1000)
  const todayYear = moscowNow.getUTCFullYear()
  const todayMonth = moscowNow.getUTCMonth()
  const todayDay = moscowNow.getUTCDate()

  // Next birthday this year
  let nextBirthday = new Date(Date.UTC(todayYear, d.getMonth(), d.getDate()))
  // If already passed this year, use next year
  if (
    nextBirthday.getUTCMonth() < todayMonth ||
    (nextBirthday.getUTCMonth() === todayMonth && nextBirthday.getUTCDate() < todayDay)
  ) {
    nextBirthday = new Date(Date.UTC(todayYear + 1, d.getMonth(), d.getDate()))
  }

  const todayMidnight = new Date(Date.UTC(todayYear, todayMonth, todayDay))
  const diffMs = nextBirthday.getTime() - todayMidnight.getTime()
  return Math.round(diffMs / 86400000)
}

function getWorkPhone(phones: EmployeePhone[]): string {
  const work = phones.find((p) => p.type === "WORK")
  return work?.number ?? "—"
}

function getWorkEmail(emails: EmployeeEmail[]): string {
  const work = emails.find((e) => e.type === "WORK")
  return work?.email ?? "—"
}

function getCompanyNames(companies: EmployeeCompanyEntry[]): string {
  if (companies.length === 0) return "—"
  return companies.map((c) => c.company.name).join(", ")
}

// ── Row component ──────────────────────────────────────────────────

function EmployeeRow({
  employee,
  onClick,
}: {
  employee: Employee
  onClick: (e: Employee) => void
}) {
  const days = daysUntilBirthday(employee.birthDate)
  const isBirthday = days === 0
  const nearBirthday = days !== null && days > 0 && days <= 10
  const isFired = employee.fireDate !== null

  const age = calcAge(employee.birthDate)
  const bdStr = employee.birthDate
    ? `${formatDate(employee.birthDate)}${age !== null ? ` (${age} лет)` : ""}`
    : "—"

  return (
    <tr
      onClick={() => onClick(employee)}
      className={[
        "cursor-pointer transition-colors hover:bg-muted/50",
        isBirthday ? "ring-2 ring-inset ring-amber-400 bg-amber-50/30 dark:bg-amber-900/10" : "",
        nearBirthday && !isBirthday ? "ring-1 ring-inset ring-amber-300" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <td className="px-3 py-2 text-sm whitespace-nowrap">
        {isBirthday && <span className="mr-1">🎉</span>}
        {employee.lastName}
      </td>
      <td className="px-3 py-2 text-sm whitespace-nowrap">{employee.firstName}</td>
      <td className="px-3 py-2 text-sm whitespace-nowrap text-muted-foreground">
        {employee.middleName ?? ""}
      </td>
      <td className="px-3 py-2 text-sm">{getCompanyNames(employee.companies)}</td>
      <td className="px-3 py-2 text-sm text-muted-foreground">{employee.position ?? "—"}</td>
      <td className="px-3 py-2 text-sm whitespace-nowrap">{bdStr}</td>
      <td className="px-3 py-2 text-sm whitespace-nowrap">{getWorkPhone(employee.phones)}</td>
      <td className="px-3 py-2 text-sm">{getWorkEmail(employee.emails)}</td>
      <td className="px-3 py-2">
        {isFired ? (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
            Уволен
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            Активен
          </span>
        )}
      </td>
    </tr>
  )
}

// ── Table header ───────────────────────────────────────────────────

function TableHeader() {
  return (
    <thead>
      <tr className="border-b bg-muted/30">
        <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Фамилия</th>
        <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Имя</th>
        <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Отчество</th>
        <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Компания</th>
        <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Должность</th>
        <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
          Дата рождения
        </th>
        <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Раб.телефон</th>
        <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Раб.email</th>
        <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Статус</th>
      </tr>
    </thead>
  )
}

// ── Main table ─────────────────────────────────────────────────────

export function EmployeesTable({ employees, allCompanies, grouped = false }: EmployeesTableProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)

  function handleRowClick(emp: Employee) {
    setSelectedEmployee(emp)
    setModalOpen(true)
  }

  if (employees.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
        Нет сотрудников
      </div>
    )
  }

  // Sort: by first company name asc, then lastName asc
  const sorted = [...employees].sort((a, b) => {
    const aCompany = a.companies[0]?.company.name ?? ""
    const bCompany = b.companies[0]?.company.name ?? ""
    if (aCompany !== bCompany) return aCompany.localeCompare(bCompany, "ru")
    return a.lastName.localeCompare(b.lastName, "ru")
  })

  return (
    <>
      <div className="rounded-lg border overflow-x-auto">
        {grouped ? (
          <GroupedTable employees={sorted} onRowClick={handleRowClick} />
        ) : (
          <table className="w-full text-sm">
            <TableHeader />
            <tbody className="divide-y">
              {sorted.map((emp) => (
                <EmployeeRow key={emp.id} employee={emp} onClick={handleRowClick} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <EmployeeModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        employee={selectedEmployee}
        companies={allCompanies}
      />
    </>
  )
}

// ── Grouped table ──────────────────────────────────────────────────

function GroupedTable({
  employees,
  onRowClick,
}: {
  employees: Employee[]
  onRowClick: (e: Employee) => void
}) {
  // Group by first company name
  const groups = new Map<string, Employee[]>()
  for (const emp of employees) {
    const companyName = emp.companies[0]?.company.name ?? "Без компании"
    if (!groups.has(companyName)) groups.set(companyName, [])
    groups.get(companyName)!.push(emp)
  }

  return (
    <table className="w-full text-sm">
      <TableHeader />
      <tbody className="divide-y">
        {[...groups.entries()].map(([companyName, emps]) => (
          <>
            <tr key={`group-${companyName}`} className="bg-muted/50">
              <td colSpan={9} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {companyName}
              </td>
            </tr>
            {emps.map((emp) => (
              <EmployeeRow key={emp.id} employee={emp} onClick={onRowClick} />
            ))}
          </>
        ))}
      </tbody>
    </table>
  )
}
