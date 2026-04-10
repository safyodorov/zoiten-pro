// app/(dashboard)/layout.tsx
// Authenticated layout — delegates UI to client DashboardShell (collapsible sidebar + dynamic header)
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { DashboardShell } from "@/components/layout/DashboardShell"
import { LogoutForm } from "@/components/layout/LogoutForm"
import { NAV_ITEMS } from "@/components/layout/nav-items"

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
  const allowedSections = session.user.allowedSections ?? []

  const visibleItems = NAV_ITEMS.filter(
    (item) => isSuperadmin || allowedSections.includes(item.section)
  )

  return (
    <DashboardShell
      user={session.user}
      navItems={visibleItems}
      logoutForm={<LogoutForm />}
    >
      {children}
    </DashboardShell>
  )
}
