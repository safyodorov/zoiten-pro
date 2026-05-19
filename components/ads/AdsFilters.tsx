// Phase 19 / Plan 19-05: фильтры для раздела /ads/wb.
// Каскадные фильтры Направление → Бренд → Категория → Подкатегория + multi-select
// тип кампании + native status select + native period select.
// Паттерн — components/products/ProductFilters.tsx (бережная очистка детей при смене родителя).
"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ChevronDown, X } from "lucide-react"

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

interface AdsFiltersProps {
  directions: DirectionOption[]
  brands: BrandOption[]
  categories: CategoryOption[]
  subcategories: SubcategoryOption[]
  campaignTypes: number[]
  selectedDirectionIds: string[]
  selectedBrandIds: string[]
  selectedCategoryIds: string[]
  selectedSubcategoryIds: string[]
  selectedCampaignTypes: number[]
  status: string
  period: number
}

// Подписи типов кампаний WB (см. 19-RESEARCH.md секция 2)
const CAMPAIGN_TYPE_LABELS: Record<number, string> = {
  4: "Каталог",
  5: "Карточка",
  6: "Поиск",
  7: "Рекомендации",
  8: "Единая ставка",
  9: "Единая/Ручная",
}

// ──────────────────────────────────────────────────────────────────
// MultiSelectDropdown — копия паттерна из ProductFilters.tsx
// ──────────────────────────────────────────────────────────────────

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: Array<{ id: string; name: string }>
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

// ──────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────

export function AdsFilters({
  directions,
  brands,
  categories,
  subcategories,
  campaignTypes,
  selectedDirectionIds,
  selectedBrandIds,
  selectedCategoryIds,
  selectedSubcategoryIds,
  selectedCampaignTypes,
  status,
  period,
}: AdsFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Cascade visibility
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

  function buildUrl(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(overrides)) {
      if (value && value.length > 0) params.set(key, value)
      else params.delete(key)
    }
    const qs = params.toString()
    return `${pathname}${qs ? `?${qs}` : ""}`
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
        if (values.length === 0) return true
        return brands.some(
          (b) =>
            b.id === c.brandId && b.directionId && values.includes(b.directionId),
        )
      }
      return newBrandIds.includes(c.brandId)
    })
    const newSubcategoryIds = selectedSubcategoryIds.filter((sId) => {
      const s = subcategories.find((x) => x.id === sId)
      return s && newCategoryIds.includes(s.categoryId)
    })
    router.push(
      buildUrl({
        direction: values.join(",") || undefined,
        brand: newBrandIds.join(",") || undefined,
        category: newCategoryIds.join(",") || undefined,
        subcategory: newSubcategoryIds.join(",") || undefined,
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
        brand: values.join(",") || undefined,
        category: newCategoryIds.join(",") || undefined,
        subcategory: newSubcategoryIds.join(",") || undefined,
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
        category: values.join(",") || undefined,
        subcategory: newSubcategoryIds.join(",") || undefined,
      }),
    )
  }

  function setSubcategories(values: string[]) {
    router.push(buildUrl({ subcategory: values.join(",") || undefined }))
  }

  function setCampaignTypeFilter(values: string[]) {
    router.push(buildUrl({ campaignType: values.join(",") || undefined }))
  }

  function setStatus(value: string) {
    router.push(buildUrl({ status: value === "active" ? undefined : value }))
  }

  function setPeriod(value: string) {
    router.push(buildUrl({ period: value === "7" ? undefined : value }))
  }

  function clearAll() {
    router.push(pathname)
  }

  const hasFilters =
    selectedDirectionIds.length > 0 ||
    selectedBrandIds.length > 0 ||
    selectedCategoryIds.length > 0 ||
    selectedSubcategoryIds.length > 0 ||
    selectedCampaignTypes.length > 0 ||
    status !== "active" ||
    period !== 7

  // Опции для MultiSelectDropdown типов кампаний — лейблы из CAMPAIGN_TYPE_LABELS.
  const campaignTypeOptions = campaignTypes
    .slice()
    .sort((a, b) => a - b)
    .map((t) => ({ id: String(t), name: CAMPAIGN_TYPE_LABELS[t] ?? `Тип ${t}` }))

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
      <MultiSelectDropdown
        label="Тип РК"
        options={campaignTypeOptions}
        selected={selectedCampaignTypes.map(String)}
        onChange={setCampaignTypeFilter}
      />

      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        aria-label="Статус"
      >
        <option value="active">Активные</option>
        <option value="paused">На паузе</option>
        <option value="all">Все</option>
      </select>

      <select
        value={String(period)}
        onChange={(e) => setPeriod(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        aria-label="Период"
      >
        <option value="7">7 дней</option>
        <option value="14">14 дней</option>
        <option value="28">28 дней</option>
      </select>

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
