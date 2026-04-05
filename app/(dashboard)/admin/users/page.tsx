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
      isActive: true,
      createdAt: true,
    },
  })

  // Cast to UserRow[] — allowedSections comes back as ERP_SECTION[], compatible as string[]
  const userRows: UserRow[] = users.map((u) => ({
    ...u,
    role: u.role as UserRow["role"],
    allowedSections: u.allowedSections as string[],
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Пользователи</h1>
      </div>
      <UserTable users={userRows} />
    </div>
  )
}
