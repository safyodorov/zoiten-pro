// components/prices/PricesFilters.tsx
// Phase 7 (Feature Request): Фильтры для раздела /prices/wb
//   - MultiSelect: Бренд, Категория, Подкатегория
//   - Toggle: Товар с остатком / Весь товар
//   - Toggle: Карточки с остатком / Карточки без остатка
// Состояние хранится в URL searchParams (RSC-friendly).
"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ChevronDown, X } from "lucide-react"

interface FilterOption {
  id: string
  name: string
}

interface PricesFiltersProps {
  brands: FilterOption[]
  categories: FilterOption[]
  subcategories: FilterOption[]
  selectedBrandIds: string[]
  selectedCategoryIds: string[]
  selectedSubcategoryIds: string[]
  productsInStockOnly: boolean
  cardsInStockOnly: boolean
}

// ── Dropdown с чекбоксами (общий паттерн с ProductFilters) ──────

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: FilterOption[]
  selected: string[]
  onChange: (values: string[]) => void
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
        onClick={() => setOpen(!open)}
        className={`gap-1.5 ${selected.length > 0 ? "border-primary text-primary" : ""}`}
      >
        {displayLabel}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </Button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[220px] max-h-[320px] overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
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
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Нет данных</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────

export function PricesFilters({
  brands,
  categories,
  subcategories,
  selectedBrandIds,
  selectedCategoryIds,
  selectedSubcategoryIds,
  productsInStockOnly,
  cardsInStockOnly,
}: PricesFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function buildUrl(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(overrides)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    const qs = params.toString()
    return `/prices/wb${qs ? `?${qs}` : ""}`
  }

  function setMulti(key: string, values: string[]) {
    router.push(buildUrl({ [key]: values.join(",") || undefined }))
  }

  function setProductsInStock(value: boolean) {
    // Default = false (Весь товар). Only add param when true.
    router.push(buildUrl({ stock: value ? "1" : undefined }))
  }

  function setCardsInStock(value: boolean) {
    // Default = false (Карточки без остатка = все). Only add param when true.
    router.push(buildUrl({ cardStock: value ? "1" : undefined }))
  }

  function clearFilters() {
    router.push("/prices/wb")
  }

  const hasFilters =
    selectedBrandIds.length > 0 ||
    selectedCategoryIds.length > 0 ||
    selectedSubcategoryIds.length > 0 ||
    productsInStockOnly ||
    cardsInStockOnly

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <MultiSelectDropdown
        label="Бренд"
        options={brands}
        selected={selectedBrandIds}
        onChange={(v) => setMulti("brands", v)}
      />
      <MultiSelectDropdown
        label="Категория"
        options={categories}
        selected={selectedCategoryIds}
        onChange={(v) => setMulti("categories", v)}
      />
      <MultiSelectDropdown
        label="Подкатегория"
        options={subcategories}
        selected={selectedSubcategoryIds}
        onChange={(v) => setMulti("subcategories", v)}
      />

      {/* Toggle: Товар с остатком / Весь товар */}
      <div className="flex items-center rounded-md border border-input overflow-hidden">
        <button
          type="button"
          onClick={() => setProductsInStock(true)}
          className={`px-3 h-8 text-xs font-medium transition-colors ${
            productsInStockOnly
              ? "bg-primary text-primary-foreground"
              : "bg-background hover:bg-muted"
          }`}
        >
          Товар с остатком
        </button>
        <button
          type="button"
          onClick={() => setProductsInStock(false)}
          className={`px-3 h-8 text-xs font-medium transition-colors border-l border-input ${
            !productsInStockOnly
              ? "bg-primary text-primary-foreground"
              : "bg-background hover:bg-muted"
          }`}
        >
          Весь товар
        </button>
      </div>

      {/* Toggle: Карточки с остатком / Карточки без остатка */}
      <div className="flex items-center rounded-md border border-input overflow-hidden">
        <button
          type="button"
          onClick={() => setCardsInStock(true)}
          className={`px-3 h-8 text-xs font-medium transition-colors ${
            cardsInStockOnly
              ? "bg-primary text-primary-foreground"
              : "bg-background hover:bg-muted"
          }`}
        >
          Карточки с остатком
        </button>
        <button
          type="button"
          onClick={() => setCardsInStock(false)}
          className={`px-3 h-8 text-xs font-medium transition-colors border-l border-input ${
            !cardsInStockOnly
              ? "bg-primary text-primary-foreground"
              : "bg-background hover:bg-muted"
          }`}
        >
          Карточки без остатка
        </button>
      </div>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className="gap-1 text-xs"
        >
          <X className="h-3 w-3" />
          Сбросить
        </Button>
      )}
    </div>
  )
}
