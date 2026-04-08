// GET /api/employees-export — export active employees as XLSX
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import * as XLSX from "xlsx"

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 })
  }

  // Fetch active employees (fireDate is null)
  const employees = await prisma.employee.findMany({
    where: { fireDate: null },
    include: {
      companies: {
        include: { company: true },
        orderBy: { company: { name: "asc" } },
      },
      phones: true,
      emails: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  })

  // Build rows for Excel
  const rows = employees.map((emp) => {
    const activeCompanies = emp.companies.filter((c) => !c.fireDate)
    const workPhones = emp.phones.filter((p) => p.type === "WORK")
    const workEmails = emp.emails.filter((e) => e.type === "WORK")

    return {
      Фамилия: emp.lastName,
      Имя: emp.firstName,
      Отчество: emp.middleName ?? "",
      Компания: activeCompanies.map((c) => c.company.name).join(", "),
      Должность: activeCompanies.map((c) => c.position).filter(Boolean).join(", "),
      Подразделение: emp.department === "OFFICE" ? "Офис" : emp.department === "WAREHOUSE" ? "Склад" : "",
      Пол: emp.gender === "MALE" ? "М" : emp.gender === "FEMALE" ? "Ж" : "",
      "Номера пропусков": emp.passNumbers?.join(", ") ?? "",
      "Дата рождения": emp.birthDate
        ? emp.birthDate.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
        : "",
      "Дата приёма": emp.hireDate
        ? emp.hireDate.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
        : "",
      "Раб. телефон": workPhones.map((p) => p.number).join(", "),
      "Раб. email": workEmails.map((e) => e.email).join(", "),
      Ставка: activeCompanies.map((c) => Number(c.rate)).join(", "),
      Оклад: activeCompanies.map((c) => c.salary ?? "").join(", "),
    }
  })

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)

  // Auto-fit column widths
  const colWidths = Object.keys(rows[0] ?? {}).map((key) => ({
    wch: Math.max(key.length, ...rows.map((r) => String((r as Record<string, unknown>)[key] ?? "").length)) + 2,
  }))
  ws["!cols"] = colWidths

  XLSX.utils.book_append_sheet(wb, ws, "Сотрудники")

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="employees_${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  })
}
