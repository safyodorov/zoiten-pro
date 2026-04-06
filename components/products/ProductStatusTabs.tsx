// components/products/ProductStatusTabs.tsx
// Availability filter tabs — preserves brand/category filters when switching status
"use client"

import { useRouter, useSearchParams } from "next/navigation"

const TABS = [
  { value: "IN_STOCK", label: "Есть" },
  { value: "OUT_OF_STOCK", label: "Нет в наличии" },
  { value: "DISCONTINUED", label: "Выведен" },
  { value: "DELETED", label: "Удалено" },
  { value: "ALL", label: "Все" },
]

interface ProductStatusTabsProps {
  currentStatus: string
}

export function ProductStatusTabs({ currentStatus }: ProductStatusTabsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleClick(status: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("status", status)
    params.delete("page") // reset pagination
    params.delete("q") // reset search on status change
    const qs = params.toString()
    router.push(`/products${qs ? `?${qs}` : ""}`)
  }

  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((tab) => (
        <button
          key={tab.value}
          onClick={() => handleClick(tab.value)}
          className={
            currentStatus === tab.value
              ? "rounded-md px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground"
              : "rounded-md px-4 py-1.5 text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80"
          }
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
