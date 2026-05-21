// app/(dashboard)/layout.tsx
// Authenticated layout — delegates UI to client DashboardShell (collapsible sidebar + dynamic header)
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { DashboardShell } from "@/components/layout/DashboardShell"
import { LogoutForm } from "@/components/layout/LogoutForm"
import { NAV_ITEMS } from "@/components/layout/nav-items"
import { getSidebarBadgeCounts } from "@/lib/support-badge"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  // Fallback auth check — middleware should catch this first
  if (!session?.user) {
    redirect("/login")
  }

  const isSuperadmin = session.user.role === "SUPERADMIN"
  // Источник прав в сессии — оба поля: sectionRoles (гранулярный, актуальный)
  // и allowedSections (legacy, fallback). Объединяем — так sidebar показывает
  // раздел, даже если синхронизация одного из полей пропущена (защита от
  // регрессии после миграции 20260409_section_roles).
  const allowedSections = session.user.allowedSections ?? []
  const sectionRoles = session.user.sectionRoles ?? {}
  const grantedSections = new Set<string>([
    ...allowedSections,
    ...Object.keys(sectionRoles),
  ])

  const visibleItems = NAV_ITEMS.filter(
    (item) => isSuperadmin || grantedSections.has(item.section)
  )

  const hasSupportAccess = isSuperadmin || grantedSections.has("SUPPORT")
  const badgeCounts = await getSidebarBadgeCounts(hasSupportAccess)

  return (
    <DashboardShell
      user={session.user}
      navItems={visibleItems}
      logoutForm={<LogoutForm />}
      badgeCounts={badgeCounts}
    >
      {children}
    </DashboardShell>
  )
}
