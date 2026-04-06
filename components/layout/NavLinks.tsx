// components/layout/NavLinks.tsx
// Client component for navigation links with active state highlighting
// Uses usePathname to detect current route and apply primary color + border indicator
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

interface NavItem {
  section: string
  href: string
  label: string
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
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center px-4 py-2 text-sm transition-colors",
              isActive
                ? "bg-primary/10 text-primary font-medium border-r-2 border-primary"
                : "hover:bg-gray-50 text-gray-700"
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </>
  )
}
