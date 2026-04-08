"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ChevronDown, X, Search, LayoutList } from "lucide-react"
import { EmployeeModal } from "@/components/employees/EmployeeModal"

// ── Types ──────────────────────────────────────────────────────────

interface FilterOption {
  id: string
  name: string
}

interface EmployeeFiltersProps {
  companies: FilterOption[]
  selectedCompanyIds: string[]
  currentStatus: string
  currentGroup: boolean
  currentDept: string | null
  currentSearch: string
  allCompanies: FilterOption[]
}

// ── MultiSelectDropdown ────────────────────────────────────────────

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
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Нет данных</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Status tabs ────────────────────────────────────────────────────

const STATUS_TABS = [
  { value: "active", label: "Актуальная база" },
  { value: "fired", label: "Уволенные" },
  { value: "all", label: "Все" },
]

// ── Main component ─────────────────────────────────────────────────

export function EmployeeFilters({
  companies,
  selectedCompanyIds,
  currentStatus,
  currentGroup,
  currentDept,
  currentSearch,
  allCompanies,
}: EmployeeFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(currentSearch)
  const [addModalOpen, setAddModalOpen] = useState(false)

  function buildUrl(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(overrides)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    const qs = params.toString()
    return `/employees${qs ? `?${qs}` : ""}`
  }

  function setStatus(status: string) {
    router.push(buildUrl({ status }))
  }

  function setCompanies(values: string[]) {
    router.push(buildUrl({ companies: values.join(",") }))
  }

  function toggleGroup() {
    router.push(buildUrl({ group: currentGroup ? undefined : "1" }))
  }

  function setDept(dept: string | null) {
    router.push(buildUrl({ dept: dept ?? undefined }))
  }

  // Debounced search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearch = useCallback(
    (val: string) => {
      setSearch(val)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        router.push(buildUrl({ q: val.trim() || undefined }))
      }, 350)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchParams]
  )

  function clearFilters() {
    setSearch("")
    router.push(buildUrl({ companies: undefined, q: undefined }))
  }

  const hasFilters = selectedCompanyIds.length > 0 || currentSearch

  return (
    <div className="space-y-3">
      {/* Status tabs */}
      <div className="flex items-center gap-1 border-b">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatus(tab.value)}
            className={[
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              currentStatus === tab.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Поиск по ФИО..."
            className="h-8 pl-8 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring w-48"
          />
        </div>

        {/* Company filter */}
        <MultiSelectDropdown
          label="Компания"
          options={companies}
          selected={selectedCompanyIds}
          onChange={setCompanies}
        />

        {/* Group toggle */}
        <Button
          variant={currentGroup ? "default" : "outline"}
          size="sm"
          onClick={toggleGroup}
          className="gap-1.5"
        >
          <LayoutList className="h-3.5 w-3.5" />
          Разбить по компаниям
        </Button>

        {/* Department filter */}
        <div className="flex items-center gap-0.5 border rounded-md">
          <button
            onClick={() => setDept(null)}
            className={`px-3 py-1 text-xs font-medium rounded-l-md transition-colors ${!currentDept ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            Все
          </button>
          <button
            onClick={() => setDept("OFFICE")}
            className={`px-3 py-1 text-xs font-medium transition-colors ${currentDept === "OFFICE" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            Офис
          </button>
          <button
            onClick={() => setDept("WAREHOUSE")}
            className={`px-3 py-1 text-xs font-medium rounded-r-md transition-colors ${currentDept === "WAREHOUSE" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            Склад
          </button>
        </div>

        {/* Clear filters */}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-xs">
            <X className="h-3 w-3" />
            Сбросить
          </Button>
        )}

        {/* Add button */}
        <div className="ml-auto">
          <Button size="sm" onClick={() => setAddModalOpen(true)}>
            + Добавить сотрудника
          </Button>
        </div>
      </div>

      {/* Add employee modal */}
      <EmployeeModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        employee={null}
        companies={allCompanies}
      />
    </div>
  )
}
