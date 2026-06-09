"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ChevronDown, X } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────

interface FilterOption {
  id: string
  name: string
}

interface CreditsFiltersProps {
  lenders: FilterOption[]
  companies: FilterOption[]
  selectedLenderIds: string[]
  selectedCompanyIds: string[]
  statusFilter: "active" | "paid" | null
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

// ── Main component ─────────────────────────────────────────────────

export function CreditsFilters({
  lenders,
  companies,
  selectedLenderIds,
  selectedCompanyIds,
  statusFilter,
}: CreditsFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function buildUrl(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(overrides)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    const qs = params.toString()
    return `/credits${qs ? `?${qs}` : ""}`
  }

  function setCompanies(values: string[]) {
    router.push(buildUrl({ companies: values.join(",") || undefined }))
  }

  function setLenders(values: string[]) {
    router.push(buildUrl({ lenders: values.join(",") || undefined }))
  }

  function setStatus(value: string | null) {
    router.push(buildUrl({ status: value ?? undefined }))
  }

  function clearFilters() {
    router.push("/credits")
  }

  const hasFilters =
    selectedCompanyIds.length > 0 || selectedLenderIds.length > 0 || statusFilter !== null

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Организация */}
      <MultiSelectDropdown
        label="Организация"
        options={companies}
        selected={selectedCompanyIds}
        onChange={setCompanies}
      />

      {/* Кредитор (U-03) */}
      <MultiSelectDropdown
        label="Кредитор"
        options={lenders}
        selected={selectedLenderIds}
        onChange={setLenders}
      />

      {/* Статус — native <select> (CLAUDE.md: native select для простых dropdown) */}
      <select
        value={statusFilter ?? ""}
        onChange={(e) => setStatus(e.target.value || null)}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">Все статусы</option>
        <option value="active">Активные</option>
        <option value="paid">Погашённые</option>
      </select>

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
