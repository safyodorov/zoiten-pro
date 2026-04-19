// components/layout/NavLinks.tsx
// Client component for navigation links with active state highlighting
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { ICON_MAP, type NavItem } from "@/components/layout/nav-items"

interface NavLinksProps {
  items: NavItem[]
  collapsed?: boolean
  badgeCounts?: Record<string, number>
}

export function NavLinks({
  items,
  collapsed = false,
  badgeCounts,
}: NavLinksProps) {
  const pathname = usePathname()

  return (
    <>
      {items.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(item.href + "/")
        const Icon = item.icon ? ICON_MAP[item.icon] : null
        const count = badgeCounts?.[item.href] ?? 0
        const showBadge = count > 0
        const badgeLabelExpanded = count > 99 ? "99+" : String(count)
        const badgeLabelCollapsed = count > 9 ? "9+" : String(count)
        return (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed ? item.label : undefined}
            className={cn(
              "flex items-center text-sm transition-colors relative",
              collapsed
                ? "justify-center px-2 py-2.5 mx-1 my-0.5 rounded-md"
                : "gap-2.5 px-4 py-2",
              isActive
                ? collapsed
                  ? "bg-primary/10 text-primary font-medium"
                  : "bg-primary/10 text-primary font-medium border-r-2 border-primary"
                : "hover:bg-accent text-muted-foreground hover:text-foreground"
            )}
          >
            {Icon && (
              <Icon
                className={cn(
                  "shrink-0",
                  collapsed ? "w-5 h-5" : "w-4 h-4",
                  isActive ? "text-primary" : ""
                )}
              />
            )}
            {!collapsed && <span className="truncate">{item.label}</span>}
            {showBadge && !collapsed && (
              <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-medium">
                {badgeLabelExpanded}
              </span>
            )}
            {showBadge && collapsed && (
              <span className="absolute top-1 right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-red-500 text-white text-[9px] font-medium flex items-center justify-center">
                {badgeLabelCollapsed}
              </span>
            )}
          </Link>
        )
      })}
    </>
  )
}
