"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const TABS = [
  { href: "/credits", label: "Список" },
  { href: "/credits/schedule", label: "Сводный график" },
]

export function CreditsTabs() {
  const pathname = usePathname()

  return (
    <div className="flex gap-1 border-b">
      {TABS.map((tab) => {
        // /credits/schedule не должен подсвечивать «Список»
        const isActive =
          tab.href === "/credits/schedule"
            ? pathname.startsWith("/credits/schedule")
            : pathname === "/credits"

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              isActive
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
