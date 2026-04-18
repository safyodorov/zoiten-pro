"use client"

// components/support/stats/StatsTabs.tsx
// Phase 13 — client tab navigation через URL searchParams (По товарам / По менеджерам).

import { useSearchParams, usePathname, useRouter } from "next/navigation"

export interface StatsTabsProps {
  currentTab: "products" | "managers"
}

export function StatsTabs({ currentTab }: StatsTabsProps) {
  const sp = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  function setTab(tab: "products" | "managers") {
    const newSp = new URLSearchParams(sp.toString())
    newSp.set("tab", tab)
    router.push(`${pathname}?${newSp.toString()}`)
  }

  const tabClass = (t: string) =>
    t === currentTab
      ? "border-b-2 border-primary text-foreground"
      : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"

  return (
    <div className="flex gap-6 border-b">
      <button
        type="button"
        onClick={() => setTab("products")}
        className={`${tabClass("products")} pb-2 text-sm font-medium`}
      >
        По товарам
      </button>
      <button
        type="button"
        onClick={() => setTab("managers")}
        className={`${tabClass("managers")} pb-2 text-sm font-medium`}
      >
        По менеджерам
      </button>
    </div>
  )
}
