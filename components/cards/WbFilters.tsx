"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ChevronDown, X } from "lucide-react"

interface WbFiltersProps {
  // Все distinct пары (brand, category) из WbCard — нужны для каскадной фильтрации.
  // Brand и Category в WB карточках — это просто строки (значения полей WbCard),
  // связь не через FK а через сосуществование в одной WbCard.
  brandCategoryPairs: Array<{ brand: string; category: string }>
  selectedBrands: string[]
  selectedCategories: string[]
  // Phase 260514-mci: фильтр по Ярлыку (WbCard.label, отдельное поле, не связано с brand/category)
  labelOptions: string[]
  selectedLabels: string[]
}

// ── Dropdown с чекбоксами ────────────────────────────────────────

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: string[]
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

  function toggle(value: string) {
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value]
    onChange(next)
  }

  const displayLabel = selected.length > 0
    ? `${label} (${selected.length})`
    : label

  return (
    <div ref={ref} className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
        className={`gap-1.5 ${selected.length > 0 ? "border-primary text-primary" : ""}`}
      >
        {displayLabel}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] max-h-[300px] overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {options.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
            >
              <Checkbox
                checked={selected.includes(opt)}
                onCheckedChange={() => toggle(opt)}
              />
              <span className="truncate">{opt}</span>
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

// ── Основной компонент фильтров ──────────────────────────────────

export function WbFilters({
  brandCategoryPairs,
  selectedBrands,
  selectedCategories,
  labelOptions,
  selectedLabels,
}: WbFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Все бренды (unique по строке)
  const allBrands = Array.from(new Set(brandCategoryPairs.map((p) => p.brand))).sort()

  // Категории, релевантные текущему выбору брендов:
  //   - selectedBrands пуст → все категории
  //   - selectedBrands заполнен → категории встречающиеся хотя бы в одном из выбранных брендов
  const visibleCategories = Array.from(
    new Set(
      brandCategoryPairs
        .filter((p) => selectedBrands.length === 0 || selectedBrands.includes(p.brand))
        .map((p) => p.category)
    )
  ).sort()

  function buildUrl(overrides: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("page")
    for (const [key, value] of Object.entries(overrides)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    const qs = params.toString()
    return `/cards/wb${qs ? `?${qs}` : ""}`
  }

  function setBrands(values: string[]) {
    // Бережно отфильтровать категории чтобы остались только валидные в новом контексте.
    // Если новый Brand всё ещё содержит старую Category — оставляем выбор.
    const newCategories =
      values.length === 0
        ? selectedCategories
        : selectedCategories.filter((c) =>
            brandCategoryPairs.some((p) => values.includes(p.brand) && p.category === c)
          )
    router.push(
      buildUrl({
        brands: values.join(","),
        categories: newCategories.join(","),
      })
    )
  }

  function setCategories(values: string[]) {
    router.push(buildUrl({ categories: values.join(",") }))
  }

  function setLabels(values: string[]) {
    router.push(buildUrl({ labels: values.join(",") }))
  }

  function clearAll() {
    router.push(buildUrl({ brands: "", categories: "", labels: "" }))
  }

  const hasFilters =
    selectedBrands.length > 0 ||
    selectedCategories.length > 0 ||
    selectedLabels.length > 0

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <MultiSelectDropdown
        label="Бренд"
        options={allBrands}
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
        label="Ярлык"
        options={labelOptions}
        selected={selectedLabels}
        onChange={setLabels}
      />
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1 text-xs">
          <X className="h-3 w-3" />
          Сбросить
        </Button>
      )}
    </div>
  )
}
