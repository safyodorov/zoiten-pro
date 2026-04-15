// components/prices/PricesFilters.tsx
// Phase 7 (Feature Request): Фильтры для раздела /prices/wb
//   - MultiSelect: Бренд, Категория, Подкатегория
//   - Dropdown (single choice): Товар, Карточки, Акции, Расчётные цены
// Состояние хранится в URL searchParams (RSC-friendly).
"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ChevronDown, X, Check } from "lucide-react"

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
  showPromos: boolean
  showCalculated: boolean
}

// ── Dropdown с чекбоксами (мульти-выбор) ────────────────────────

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

// ── Dropdown с одним выбором (single choice) ─────────────────────

interface ChoiceOption {
  value: string
  label: string
  /** Default-опция (не подсвечивается primary). */
  isDefault?: boolean
}

function SingleChoiceDropdown({
  options,
  value,
  onChange,
}: {
  options: ChoiceOption[]
  value: string
  onChange: (value: string) => void
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

  const current = options.find((o) => o.value === value) ?? options[0]
  const isNonDefault = !current.isDefault

  return (
    <div ref={ref} className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
        className={`gap-1.5 ${isNonDefault ? "border-primary text-primary" : ""}`}
      >
        {current.label}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </Button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] rounded-md border bg-popover p-1 shadow-md">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-sm text-left"
            >
              <Check
                className={`h-3.5 w-3.5 shrink-0 ${
                  opt.value === value ? "opacity-100 text-primary" : "opacity-0"
                }`}
              />
              <span className="truncate">{opt.label}</span>
            </button>
          ))}
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
  showPromos,
  showCalculated,
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

  function clearFilters() {
    router.push("/prices/wb")
  }

  const hasFilters =
    selectedBrandIds.length > 0 ||
    selectedCategoryIds.length > 0 ||
    selectedSubcategoryIds.length > 0 ||
    productsInStockOnly ||
    cardsInStockOnly ||
    !showPromos ||
    !showCalculated

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

      {/* Товар: весь / с остатком */}
      <SingleChoiceDropdown
        options={[
          { value: "all", label: "Весь товар", isDefault: true },
          { value: "in", label: "Товар с остатком" },
        ]}
        value={productsInStockOnly ? "in" : "all"}
        onChange={(v) =>
          router.push(buildUrl({ stock: v === "in" ? "1" : undefined }))
        }
      />

      {/* Карточки: без остатка / с остатком */}
      <SingleChoiceDropdown
        options={[
          { value: "all", label: "Карточки без фильтра", isDefault: true },
          { value: "in", label: "Карточки с остатком" },
        ]}
        value={cardsInStockOnly ? "in" : "all"}
        onChange={(v) =>
          router.push(buildUrl({ cardStock: v === "in" ? "1" : undefined }))
        }
      />

      {/* Акции: с акциями / без акций */}
      <SingleChoiceDropdown
        options={[
          { value: "on", label: "Акции", isDefault: true },
          { value: "off", label: "Без акций" },
        ]}
        value={showPromos ? "on" : "off"}
        onChange={(v) =>
          router.push(buildUrl({ promos: v === "off" ? "0" : undefined }))
        }
      />

      {/* Расчётные цены: с расчётными / без расчётных */}
      <SingleChoiceDropdown
        options={[
          { value: "on", label: "Расчётные цены", isDefault: true },
          { value: "off", label: "Без расчётных цен" },
        ]}
        value={showCalculated ? "on" : "off"}
        onChange={(v) =>
          router.push(buildUrl({ calc: v === "off" ? "0" : undefined }))
        }
      />

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
