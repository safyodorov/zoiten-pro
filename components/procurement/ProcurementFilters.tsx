"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ChevronDown, X } from "lucide-react"

// Cascade-фильтрация: Направление → Бренд → Категория → Подкатегория.
// Полностью повторяет паттерн ProductFilters, но URL = /purchase-plan.

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

interface ProcurementFiltersProps {
  directions: DirectionOption[]
  brands: BrandOption[]
  categories: CategoryOption[]
  subcategories: SubcategoryOption[]
  selectedDirectionIds: string[]
  selectedBrandIds: string[]
  selectedCategoryIds: string[]
  selectedSubcategoryIds: string[]
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  disabled,
}: {
  label: string
  options: Array<{ id: string; name: string }>
  selected: string[]
  onChange: (values: string[]) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  function toggle(id: string) {
    const next = selected.includes(id)
      ? selected.filter((v) => v !== id)
      : [...selected, id]
    onChange(next)
  }

  const displayLabel =
    selected.length > 0 ? `${label} (${selected.length})` : label

  return (
    <div ref={ref} className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`gap-1.5 ${selected.length > 0 ? "border-primary text-primary" : ""}`}
      >
        {displayLabel}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </Button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] max-h-[300px] overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {options.map((opt) => (
            <label
              key={opt.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
            >
              <Checkbox
                checked={selected.includes(opt.id)}
                onCheckedChange={() => toggle(opt.id)}
              />
              <span className="truncate">{opt.name}</span>
            </label>
          ))}
          {options.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              Нет данных
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function ProcurementFilters({
  directions,
  brands,
  categories,
  subcategories,
  selectedDirectionIds,
  selectedBrandIds,
  selectedCategoryIds,
  selectedSubcategoryIds,
}: ProcurementFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const visibleBrands =
    selectedDirectionIds.length === 0
      ? brands
      : brands.filter(
          (b) => b.directionId && selectedDirectionIds.includes(b.directionId),
        )

  const visibleBrandIds = new Set(visibleBrands.map((b) => b.id))

  const visibleCategories =
    selectedBrandIds.length === 0
      ? categories.filter((c) => visibleBrandIds.has(c.brandId))
      : categories.filter((c) => selectedBrandIds.includes(c.brandId))

  const visibleCategoryIds = new Set(visibleCategories.map((c) => c.id))

  const visibleSubcategories =
    selectedCategoryIds.length === 0
      ? subcategories.filter((s) => visibleCategoryIds.has(s.categoryId))
      : subcategories.filter((s) => selectedCategoryIds.includes(s.categoryId))

  function buildUrl(overrides: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(overrides)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    const qs = params.toString()
    return `/purchase-plan${qs ? `?${qs}` : ""}`
  }

  function setDirections(values: string[]) {
    const newBrandIds =
      values.length === 0
        ? selectedBrandIds
        : selectedBrandIds.filter((bId) => {
            const b = brands.find((x) => x.id === bId)
            return b?.directionId && values.includes(b.directionId)
          })
    const newCategoryIds = selectedCategoryIds.filter((cId) => {
      const c = categories.find((x) => x.id === cId)
      if (!c) return false
      if (newBrandIds.length === 0) {
        const visibleAfter =
          values.length === 0
            ? true
            : brands.some(
                (b) =>
                  b.id === c.brandId &&
                  b.directionId &&
                  values.includes(b.directionId),
              )
        return visibleAfter
      }
      return newBrandIds.includes(c.brandId)
    })
    const newSubcategoryIds = selectedSubcategoryIds.filter((sId) => {
      const s = subcategories.find((x) => x.id === sId)
      return s && newCategoryIds.includes(s.categoryId)
    })

    router.push(
      buildUrl({
        directions: values.join(","),
        brands: newBrandIds.join(","),
        categories: newCategoryIds.join(","),
        subcategories: newSubcategoryIds.join(","),
      }),
    )
  }

  function setBrands(values: string[]) {
    const newCategoryIds =
      values.length === 0
        ? selectedCategoryIds
        : selectedCategoryIds.filter((cId) => {
            const c = categories.find((x) => x.id === cId)
            return c && values.includes(c.brandId)
          })
    const newSubcategoryIds = selectedSubcategoryIds.filter((sId) => {
      const s = subcategories.find((x) => x.id === sId)
      return s && newCategoryIds.includes(s.categoryId)
    })
    router.push(
      buildUrl({
        brands: values.join(","),
        categories: newCategoryIds.join(","),
        subcategories: newSubcategoryIds.join(","),
      }),
    )
  }

  function setCategories(values: string[]) {
    const newSubcategoryIds =
      values.length === 0
        ? selectedSubcategoryIds
        : selectedSubcategoryIds.filter((sId) => {
            const s = subcategories.find((x) => x.id === sId)
            return s && values.includes(s.categoryId)
          })
    router.push(
      buildUrl({
        categories: values.join(","),
        subcategories: newSubcategoryIds.join(","),
      }),
    )
  }

  function setSubcategories(values: string[]) {
    router.push(buildUrl({ subcategories: values.join(",") }))
  }

  function clearAll() {
    router.push(
      buildUrl({
        directions: "",
        brands: "",
        categories: "",
        subcategories: "",
      }),
    )
  }

  const hasFilters =
    selectedDirectionIds.length > 0 ||
    selectedBrandIds.length > 0 ||
    selectedCategoryIds.length > 0 ||
    selectedSubcategoryIds.length > 0

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <MultiSelectDropdown
        label="Направление"
        options={directions}
        selected={selectedDirectionIds}
        onChange={setDirections}
      />
      <MultiSelectDropdown
        label="Бренд"
        options={visibleBrands}
        selected={selectedBrandIds}
        onChange={setBrands}
      />
      <MultiSelectDropdown
        label="Категория"
        options={visibleCategories}
        selected={selectedCategoryIds}
        onChange={setCategories}
      />
      <MultiSelectDropdown
        label="Подкатегория"
        options={visibleSubcategories}
        selected={selectedSubcategoryIds}
        onChange={setSubcategories}
      />
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAll}
          className="gap-1 text-xs"
        >
          <X className="h-3 w-3" />
          Сбросить
        </Button>
      )}
    </div>
  )
}
