// components/products/ProductStatusTabs.tsx
// Availability filter tabs for the product list page
"use client"

import { useRouter } from "next/navigation"

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

  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((tab) => (
        <button
          key={tab.value}
          onClick={() => router.push(`/products?status=${tab.value}`)}
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
