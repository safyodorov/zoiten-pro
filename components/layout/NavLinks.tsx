// components/layout/NavLinks.tsx
// Client component for navigation links with active state highlighting
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { ICON_MAP } from "@/components/layout/Sidebar"

interface NavItem {
  section: string
  href: string
  label: string
  icon?: string
}

interface NavLinksProps {
  items: NavItem[]
}

export function NavLinks({ items }: NavLinksProps) {
  const pathname = usePathname()

  return (
    <>
      {items.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(item.href + "/")
        const Icon = item.icon ? ICON_MAP[item.icon] : null
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 px-4 py-2 text-sm transition-colors",
              isActive
                ? "bg-primary/10 text-primary font-medium border-r-2 border-primary"
                : "hover:bg-accent text-muted-foreground hover:text-foreground"
            )}
          >
            {Icon && <Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-primary" : "")} />}
            {item.label}
          </Link>
        )
      })}
    </>
  )
}
