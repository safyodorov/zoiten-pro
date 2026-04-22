// components/stock/StockFilters.tsx
// Phase 14 (STOCK-20): Фильтры для /stock — URL searchParams-driven.
//
// Фильтры:
//   - Бренд (MultiSelectDropdown)
//   - Категория (MultiSelectDropdown)
//   - Подкатегория (MultiSelectDropdown)
//   - Только с дефицитом (Switch)
//
// Паттерн: components/prices/PricesFilters.tsx — router.replace + new URLSearchParams.
// Компонент: components/ui/multi-select-dropdown.tsx (id/name props API).

"use client"

import { useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { MultiSelectDropdown } from "@/components/ui/multi-select-dropdown"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

interface FilterOption {
  id: string
  name: string
}

interface StockFiltersProps {
  brands: FilterOption[]
  categories: FilterOption[]
  subcategories: FilterOption[]
}

// ──────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────

export function StockFilters({ brands, categories, subcategories }: StockFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Читаем текущие значения из URL
  const selectedBrands = searchParams.get("brands")?.split(",").filter(Boolean) ?? []
  const selectedCategories = searchParams.get("categories")?.split(",").filter(Boolean) ?? []
  const selectedSubcategories = searchParams.get("subcategories")?.split(",").filter(Boolean) ?? []
  const onlyDeficit = searchParams.get("deficit") === "1"

  // Обновляем URL param (multi-value, comma-separated)
  const updateParam = useCallback(
    (key: string, values: string[]) => {
      const params = new URLSearchParams(searchParams.toString())
      if (values.length > 0) {
        params.set(key, values.join(","))
      } else {
        params.delete(key)
      }
      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [searchParams, router],
  )

  // Переключатель «Только с дефицитом»
  const toggleDeficit = useCallback(
    (checked: boolean) => {
      const params = new URLSearchParams(searchParams.toString())
      if (checked) {
        params.set("deficit", "1")
      } else {
        params.delete("deficit")
      }
      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [searchParams, router],
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Бренд */}
      <MultiSelectDropdown
        label="Бренд"
        options={brands}
        selected={selectedBrands}
        onChange={(v) => updateParam("brands", v)}
      />

      {/* Категория */}
      <MultiSelectDropdown
        label="Категория"
        options={categories}
        selected={selectedCategories}
        onChange={(v) => updateParam("categories", v)}
      />

      {/* Подкатегория */}
      <MultiSelectDropdown
        label="Подкатегория"
        options={subcategories}
        selected={selectedSubcategories}
        onChange={(v) => updateParam("subcategories", v)}
      />

      {/* Toggle: Только с дефицитом */}
      <div className="flex items-center gap-2 ml-2">
        <Switch
          id="deficit-toggle"
          checked={onlyDeficit}
          onCheckedChange={toggleDeficit}
        />
        <Label htmlFor="deficit-toggle" className="text-sm cursor-pointer">
          Только с дефицитом
        </Label>
      </div>
    </div>
  )
}
