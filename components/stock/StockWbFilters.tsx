// components/stock/StockWbFilters.tsx
// 2026-05-11: каскадные фильтры для /stock/wb.
// Структура идентична StockFilters но без toggle «Только с дефицитом»
// (на /stock/wb он не релевантен — там кластерная разбивка остатков).

"use client"

import { useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { MultiSelectDropdown } from "@/components/ui/multi-select-dropdown"

interface DirectionOption {
  id: string
  name: string
}
interface BrandOption {
  id: string
  name: string
  directionId: string | null
}
interface CategoryOption {
  id: string
  name: string
  brandId: string
}
interface SubcategoryOption {
  id: string
  name: string
  categoryId: string
}

interface StockWbFiltersProps {
  directions: DirectionOption[]
  brands: BrandOption[]
  categories: CategoryOption[]
  subcategories: SubcategoryOption[]
}

export function StockWbFilters({
  directions,
  brands,
  categories,
  subcategories,
}: StockWbFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const selectedDirections = searchParams.get("directions")?.split(",").filter(Boolean) ?? []
  const selectedBrands = searchParams.get("brands")?.split(",").filter(Boolean) ?? []
  const selectedCategories = searchParams.get("categories")?.split(",").filter(Boolean) ?? []
  const selectedSubcategories = searchParams.get("subcategories")?.split(",").filter(Boolean) ?? []

  // Cascade: какие опции показываем
  const visibleBrands =
    selectedDirections.length === 0
      ? brands
      : brands.filter(
          (b) => b.directionId && selectedDirections.includes(b.directionId),
        )
  const visibleBrandIds = new Set(visibleBrands.map((b) => b.id))

  const visibleCategories =
    selectedBrands.length === 0
      ? categories.filter((c) => visibleBrandIds.has(c.brandId))
      : categories.filter((c) => selectedBrands.includes(c.brandId))
  const visibleCategoryIds = new Set(visibleCategories.map((c) => c.id))

  const visibleSubcategories =
    selectedCategories.length === 0
      ? subcategories.filter((s) => visibleCategoryIds.has(s.categoryId))
      : subcategories.filter((s) => selectedCategories.includes(s.categoryId))

  const pushUrl = useCallback(
    (overrides: Record<string, string[]>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, values] of Object.entries(overrides)) {
        if (values.length > 0) params.set(key, values.join(","))
        else params.delete(key)
      }
      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [searchParams, router],
  )

  function setDirections(values: string[]) {
    const newBrandIds =
      values.length === 0
        ? selectedBrands
        : selectedBrands.filter((bId) => {
            const b = brands.find((x) => x.id === bId)
            return b?.directionId && values.includes(b.directionId)
          })
    const newCategoryIds = selectedCategories.filter((cId) => {
      const c = categories.find((x) => x.id === cId)
      if (!c) return false
      if (newBrandIds.length === 0) {
        if (values.length === 0) return true
        return brands.some(
          (b) => b.id === c.brandId && b.directionId && values.includes(b.directionId),
        )
      }
      return newBrandIds.includes(c.brandId)
    })
    const newSubcategoryIds = selectedSubcategories.filter((sId) => {
      const s = subcategories.find((x) => x.id === sId)
      return s && newCategoryIds.includes(s.categoryId)
    })
    pushUrl({
      directions: values,
      brands: newBrandIds,
      categories: newCategoryIds,
      subcategories: newSubcategoryIds,
    })
  }

  function setBrands(values: string[]) {
    const newCategoryIds =
      values.length === 0
        ? selectedCategories
        : selectedCategories.filter((cId) => {
            const c = categories.find((x) => x.id === cId)
            return c && values.includes(c.brandId)
          })
    const newSubcategoryIds = selectedSubcategories.filter((sId) => {
      const s = subcategories.find((x) => x.id === sId)
      return s && newCategoryIds.includes(s.categoryId)
    })
    pushUrl({
      brands: values,
      categories: newCategoryIds,
      subcategories: newSubcategoryIds,
    })
  }

  function setCategories(values: string[]) {
    const newSubcategoryIds =
      values.length === 0
        ? selectedSubcategories
        : selectedSubcategories.filter((sId) => {
            const s = subcategories.find((x) => x.id === sId)
            return s && values.includes(s.categoryId)
          })
    pushUrl({ categories: values, subcategories: newSubcategoryIds })
  }

  function setSubcategories(values: string[]) {
    pushUrl({ subcategories: values })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelectDropdown
        label="Направление"
        options={directions}
        selected={selectedDirections}
        onChange={setDirections}
      />
      <MultiSelectDropdown
        label="Бренд"
        options={visibleBrands}
        selected={selectedBrands}
        onChange={setBrands}
      />
      <MultiSelectDropdown
        label="Категория"
        options={visibleCategories}
        selected={selectedCategories}
        onChange={setCategories}
      />
      <MultiSelectDropdown
        label="Подкатегория"
        options={visibleSubcategories}
        selected={selectedSubcategories}
        onChange={setSubcategories}
      />
    </div>
  )
}
