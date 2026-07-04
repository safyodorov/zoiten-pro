"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const TABS = [
  { href: "/sales-plan", label: "Сводный" },
  { href: "/sales-plan/products", label: "Товары" },
  { href: "/sales-plan/purchases", label: "Пора заказывать" },
]

interface SalesPlanTabsProps {
  urgentCount?: number
}

export function SalesPlanTabs({ urgentCount }: SalesPlanTabsProps) {
  const pathname = usePathname()

  return (
    <div className="flex gap-1 border-b">
      {TABS.map((tab) => {
        const isActive =
          tab.href === "/sales-plan"
            ? pathname === "/sales-plan"
            : pathname.startsWith(tab.href)

        return (
          <Link
            key={tab.href}
            href={tab.href}
            prefetch={false}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.href === "/sales-plan/purchases" && urgentCount != null && urgentCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-semibold w-4 h-4">
                {urgentCount > 9 ? "9+" : urgentCount}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
