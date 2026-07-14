"use client"

// components/analytics/SortToggle.tsx
// Phase 30 (ANL-06) — единый переключатель сортировки топ-30 (выручка / конв. клик→заказ).
// Пишет `sort` в URL searchParams (паттерн PlanFactControls) — применяется идентично во ВСЕХ вкладках
// и наследуется кнопкой «Скачать PDF» (порядок PDF = экран).
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"

const OPTIONS: { value: "revenue" | "clickToOrder"; label: string }[] = [
  { value: "revenue", label: "По выручке" },
  { value: "clickToOrder", label: "По конв. клик→заказ" },
]

export function SortToggle() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const active = searchParams.get("sort") === "clickToOrder" ? "clickToOrder" : "revenue"

  const setSort = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("sort", value)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex items-center rounded-md border bg-muted/30 p-0.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setSort(opt.value)}
          className={cn(
            "px-3 py-1 text-sm rounded transition-colors",
            active === opt.value
              ? "bg-background text-foreground shadow-sm font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
