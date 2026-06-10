"use client"

// components/cash/CashFilters.tsx
// Phase 23 (23-04): URL-driven фильтры кассовых операций.
// Зеркало BankFilters.tsx: useSearchParams + router.push + buildUrl.
// Фильтры: год, направление, подразделение + MultiSelect категории/ответственные + поиск.
// CLAUDE.md: native <select> для одиночных, MultiSelectDropdown для multi-value.

import { useState, useRef, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ChevronDown, X } from "lucide-react"
import { DIRECTION_OPTIONS } from "@/lib/cash-labels"

// ── Types ──────────────────────────────────────────────────────────────────

interface CategoryOption {
  id: string
  name: string
}

interface EmployeeOption {
  id: string
  lastName: string
  firstName: string
}

interface CashFiltersProps {
  categories: CategoryOption[]
  employees: EmployeeOption[]
  departments: string[]
  years: number[]
}

// ── MultiSelectDropdown ────────────────────────────────────────────────────

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: { id: string; name: string }[]
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

  const displayLabel = selected.length > 0 ? `${label} (${selected.length})` : label

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
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[220px] max-h-[300px] overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
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

// ── Main component ─────────────────────────────────────────────────────────

export function CashFilters({ categories, employees, departments, years }: CashFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Читаем текущие значения из URL
  const fundFilter = searchParams.get("fund") ?? "yulya"
  const yearFilter = searchParams.get("year") ?? ""
  const dateFromFilter = searchParams.get("dateFrom") ?? ""
  const dateToFilter = searchParams.get("dateTo") ?? ""
  const directionFilter = searchParams.get("direction") ?? ""
  const departmentFilter = searchParams.get("department") ?? ""
  const selectedCategories =
    searchParams.get("categories")?.split(",").filter(Boolean) ?? []
  const selectedResponsibles =
    searchParams.get("responsibles")?.split(",").filter(Boolean) ?? []
  const searchValue = searchParams.get("search") ?? ""

  // Debounce ref для поиска
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── URL builder ───────────────────────────────────────────────────────

  function buildUrl(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(overrides)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    const qs = params.toString()
    return `/cash${qs ? `?${qs}` : ""}`
  }

  // ── Обработчики ─────────────────────────────────────────────────────

  function setFund(value: string) {
    // "yulya" — значение по умолчанию → чистим параметр (URL остаётся коротким)
    router.push(buildUrl({ fund: value === "yulya" ? undefined : value }))
  }

  function setYear(value: string) {
    // Год и диапазон дат взаимоисключающие — при выборе года чистим диапазон
    router.push(buildUrl({ year: value || undefined, dateFrom: undefined, dateTo: undefined }))
  }

  function setDateFrom(value: string) {
    // Диапазон дат имеет приоритет — чистим быстрый фильтр года
    router.push(buildUrl({ dateFrom: value || undefined, year: undefined }))
  }

  function setDateTo(value: string) {
    router.push(buildUrl({ dateTo: value || undefined, year: undefined }))
  }

  function setDirection(value: string) {
    router.push(buildUrl({ direction: value || undefined }))
  }

  function setDepartment(value: string) {
    router.push(buildUrl({ department: value || undefined }))
  }

  function setCategories(values: string[]) {
    router.push(buildUrl({ categories: values.join(",") || undefined }))
  }

  function setResponsibles(values: string[]) {
    router.push(buildUrl({ responsibles: values.join(",") || undefined }))
  }

  const handleSearch = useCallback(
    (value: string) => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      searchTimerRef.current = setTimeout(() => {
        router.push(buildUrl({ search: value || undefined }))
      }, 300)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchParams],
  )

  function clearFilters() {
    router.push("/cash")
  }

  const hasFilters =
    fundFilter !== "yulya" ||
    !!yearFilter ||
    !!dateFromFilter ||
    !!dateToFilter ||
    !!directionFilter ||
    !!departmentFilter ||
    selectedCategories.length > 0 ||
    selectedResponsibles.length > 0 ||
    !!searchValue

  const selectCls =
    "h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"

  // Подготовка опций для MultiSelect
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }))
  const employeeOptions = employees.map((e) => ({
    id: e.id,
    name: `${e.lastName} ${e.firstName}`,
  }))

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Касса/фонд — Юля (офис-касса) по умолчанию, Павел отдельно */}
      <select
        value={fundFilter}
        onChange={(e) => setFund(e.target.value)}
        className={`${selectCls} ${fundFilter !== "yulya" ? "border-primary text-primary" : ""}`}
        title="Касса / фонд"
      >
        <option value="yulya">Касса: Юля</option>
        <option value="pavel">Касса: Павел</option>
        <option value="all">Касса: все</option>
      </select>

      {/* Год — native <select> (CLAUDE.md) */}
      <select
        value={yearFilter}
        onChange={(e) => setYear(e.target.value)}
        className={selectCls}
      >
        <option value="">Все годы</option>
        {years.map((y) => (
          <option key={y} value={String(y)}>
            {y}
          </option>
        ))}
      </select>

      {/* Диапазон дат — календарь (точность до дня/месяца) */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">с</span>
        <input
          type="date"
          value={dateFromFilter}
          onChange={(e) => setDateFrom(e.target.value)}
          className={selectCls}
          title="Дата с"
        />
        <span className="text-xs text-muted-foreground">по</span>
        <input
          type="date"
          value={dateToFilter}
          onChange={(e) => setDateTo(e.target.value)}
          className={selectCls}
          title="Дата по"
        />
      </div>

      {/* Направление — native <select> (CLAUDE.md) */}
      <select
        value={directionFilter}
        onChange={(e) => setDirection(e.target.value)}
        className={selectCls}
      >
        <option value="">Все направления</option>
        {DIRECTION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Подразделение — native <select> (CLAUDE.md) */}
      <select
        value={departmentFilter}
        onChange={(e) => setDepartment(e.target.value)}
        className={selectCls}
      >
        <option value="">Все подразделения</option>
        {departments.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>

      {/* Категория (MultiSelect) */}
      <MultiSelectDropdown
        label="Категория"
        options={categoryOptions}
        selected={selectedCategories}
        onChange={setCategories}
      />

      {/* Ответственный (MultiSelect) */}
      <MultiSelectDropdown
        label="Ответственный"
        options={employeeOptions}
        selected={selectedResponsibles}
        onChange={setResponsibles}
      />

      {/* Поиск по назначению — debounced 300ms */}
      <input
        type="search"
        defaultValue={searchValue}
        placeholder="Поиск по назначению…"
        onChange={(e) => handleSearch(e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring w-56"
      />

      {/* Сбросить фильтры */}
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-xs">
          <X className="h-3 w-3" />
          Сбросить
        </Button>
      )}
    </div>
  )
}
