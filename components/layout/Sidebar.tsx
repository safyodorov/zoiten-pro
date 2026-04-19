// components/layout/Sidebar.tsx
// Client sidebar with collapsed/expanded mode via SidebarContext
"use client"

import { NavLinks } from "@/components/layout/NavLinks"
import { useSidebar } from "@/components/layout/DashboardShell"
import { cn } from "@/lib/utils"
import type { NavItem } from "@/components/layout/nav-items"

interface SidebarProps {
  items: NavItem[]
  badgeCounts?: Record<string, number>
}

export function Sidebar({ items, badgeCounts }: SidebarProps) {
  const { collapsed } = useSidebar()

  return (
    <aside
      className={cn(
        "bg-card border-r border-border flex flex-col shrink-0 transition-[width] duration-200 ease-out",
        collapsed ? "w-16" : "w-56"
      )}
    >
      <a
        href="/dashboard"
        className={cn(
          "h-14 flex items-center border-b border-border hover:bg-accent/50 transition-colors",
          collapsed ? "justify-center px-2" : "px-4"
        )}
        title={collapsed ? "Zoiten ERP" : undefined}
      >
        {collapsed ? (
          <span className="font-bold text-xl text-primary">Z</span>
        ) : (
          <>
            <span className="font-bold text-lg text-primary">Zoiten</span>
            <span className="font-light text-lg text-foreground ml-1">ERP</span>
          </>
        )}
      </a>
      <nav className="flex-1 py-2 overflow-y-auto">
        <NavLinks items={items} collapsed={collapsed} badgeCounts={badgeCounts} />
      </nav>
    </aside>
  )
}
