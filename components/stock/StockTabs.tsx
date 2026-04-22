"use client"

// components/stock/StockTabs.tsx
// Phase 14 (STOCK-21): 3 таба — Остатки / WB склады / Ozon.
// Паттерн: components/cards/CardsTabs.tsx (pathname.startsWith + border-primary).

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const TABS = [
  { href: "/stock", label: "Остатки", exact: true },
  { href: "/stock/wb", label: "WB склады", exact: false },
  { href: "/stock/ozon", label: "Ozon", exact: false },
] as const

export function StockTabs() {
  const pathname = usePathname()

  const isActive = (href: string, exact: boolean) => {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <div className="flex gap-1 border-b">
      {TABS.map((tab) => {
        const active = isActive(tab.href, tab.exact)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
