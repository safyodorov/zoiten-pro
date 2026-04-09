// app/(dashboard)/admin/users/page.tsx
import { requireSuperadmin } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { UserTable } from "@/components/users/UserTable"
import type { UserRow } from "@/components/users/UserForm"

export default async function UsersPage() {
  await requireSuperadmin() // D-12: SUPERADMIN only

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
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
  })

  // Преобразуем sectionRoles из массива в Record для UI
  const userRows: UserRow[] = users.map((u) => {
    const sectionRolesMap: Record<string, "VIEW" | "MANAGE"> = {}
    for (const sr of u.sectionRoles) {
      sectionRolesMap[sr.section] = sr.role as "VIEW" | "MANAGE"
    }

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role as UserRow["role"],
      allowedSections: u.allowedSections as string[],
      sectionRoles: sectionRolesMap,
      plainPassword: u.plainPassword,
      isActive: u.isActive,
      createdAt: u.createdAt,
    }
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Пользователи</h1>
      </div>
      <UserTable users={userRows} />
    </div>
  )
}
