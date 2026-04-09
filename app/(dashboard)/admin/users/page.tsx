// app/(dashboard)/admin/users/page.tsx
import { requireSuperadmin } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { UserTable } from "@/components/users/UserTable"
import type { UserRow, EmployeeOption } from "@/components/users/UserForm"

export default async function UsersPage() {
  await requireSuperadmin() // D-12: SUPERADMIN only

  const [users, availableEmployees] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        employeeId: true,
        email: true,
        role: true,
        allowedSections: true,
        plainPassword: true,
        isActive: true,
        createdAt: true,
        sectionRoles: {
          select: { section: true, role: true },
        },
      },
    }),
    prisma.employee.findMany({
      where: {
        user: null, // только сотрудники без учётной записи
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        emails: {
          select: { id: true, email: true, type: true },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ])

  const userRows: UserRow[] = users.map((u) => {
    const sectionRolesMap: Record<string, "VIEW" | "MANAGE"> = {}
    for (const sr of u.sectionRoles) {
      sectionRolesMap[sr.section] = sr.role as "VIEW" | "MANAGE"
    }

    return {
      id: u.id,
      name: u.name,
      firstName: u.firstName,
      lastName: u.lastName,
      employeeId: u.employeeId,
      email: u.email,
      role: u.role as UserRow["role"],
      allowedSections: u.allowedSections as string[],
      sectionRoles: sectionRolesMap,
      plainPassword: u.plainPassword,
      isActive: u.isActive,
      createdAt: u.createdAt,
    }
  })

  const employeeOptions: EmployeeOption[] = availableEmployees.map((e) => ({
    id: e.id,
    firstName: e.firstName,
    lastName: e.lastName,
    middleName: e.middleName,
    emails: e.emails,
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Пользователи</h1>
      </div>
      <UserTable users={userRows} availableEmployees={employeeOptions} />
    </div>
  )
}
