// Phase 19 / Plan 19-05: вкладки внутри раздела «Управление рекламой».
// Паттерн скопирован с components/prices/PricesTabs.tsx.
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const TABS = [
  { href: "/ads/wb", label: "WB" },
  { href: "/ads/ozon", label: "Ozon" },
] as const

export function AdsTabs() {
  const pathname = usePathname()

  return (
    <div className="flex gap-1 border-b">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            pathname.startsWith(tab.href)
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}
