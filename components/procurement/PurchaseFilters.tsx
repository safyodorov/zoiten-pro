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

interface PurchaseFiltersProps {
  suppliers: FilterOption[]
  buyers: FilterOption[]
  selectedStatuses: string[]
  selectedSupplierIds: string[]
  selectedBuyerIds: string[]
  dateFrom: string | null
  dateTo: string | null
}

const STATUS_OPTIONS: FilterOption[] = [
  { id: "PLANNED", name: "Планируемая" },
  { id: "ACTIVE", name: "Текущая" },
  { id: "COMPLETED", name: "Завершённая" },
]

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

// ── Main component (D-13) ───────────────────────────────────────────

export function PurchaseFilters({
  suppliers,
  buyers,
  selectedStatuses,
  selectedSupplierIds,
  selectedBuyerIds,
  dateFrom,
  dateTo,
}: PurchaseFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function buildUrl(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(overrides)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    const qs = params.toString()
    return `/procurement/purchases${qs ? `?${qs}` : ""}`
  }

  function setStatuses(values: string[]) {
    router.push(buildUrl({ status: values.join(",") || undefined }))
  }

  function setSuppliers(values: string[]) {
    router.push(buildUrl({ suppliers: values.join(",") || undefined }))
  }

  function setBuyers(values: string[]) {
    router.push(buildUrl({ buyers: values.join(",") || undefined }))
  }

  function setDateFrom(value: string) {
    router.push(buildUrl({ dateFrom: value || undefined }))
  }

  function setDateTo(value: string) {
    router.push(buildUrl({ dateTo: value || undefined }))
  }

  function clearFilters() {
    router.push("/procurement/purchases")
  }

  const hasFilters =
    selectedStatuses.length > 0 ||
    selectedSupplierIds.length > 0 ||
    selectedBuyerIds.length > 0 ||
    Boolean(dateFrom) ||
    Boolean(dateTo)

  const inputCls =
    "h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Статус */}
      <MultiSelectDropdown
        label="Статус"
        options={STATUS_OPTIONS}
        selected={selectedStatuses}
        onChange={setStatuses}
      />

      {/* Поставщик */}
      <MultiSelectDropdown
        label="Поставщик"
        options={suppliers}
        selected={selectedSupplierIds}
        onChange={setSuppliers}
      />

      {/* Закупщик */}
      <MultiSelectDropdown
        label="Закупщик"
        options={buyers}
        selected={selectedBuyerIds}
        onChange={setBuyers}
      />

      {/* Период (по дате создания) */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">Период:</span>
        <input
          type="date"
          value={dateFrom ?? ""}
          onChange={(e) => setDateFrom(e.target.value)}
          className={inputCls}
        />
        <span className="text-xs text-muted-foreground">—</span>
        <input
          type="date"
          value={dateTo ?? ""}
          onChange={(e) => setDateTo(e.target.value)}
          className={inputCls}
        />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-xs">
          <X className="h-3 w-3" />
          Сбросить
        </Button>
      )}
    </div>
  )
}
