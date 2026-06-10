"use client"

// components/bank/BankFilters.tsx
// Phase 22 (22-05): URL-driven фильтры банковских операций.
// Каскад: Компания → Счёт → Банк (mirror ProductFilters.tsx).
// CLAUDE.md: native <select> для простых dropdown, MultiSelectDropdown с чекбоксами для multi-value.

import { useState, useRef, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ChevronDown, X } from "lucide-react"
import { CATEGORY_OPTIONS, DIRECTION_LABELS } from "@/lib/bank-labels"

// ── Types ──────────────────────────────────────────────────────────────────

interface CompanyOption {
  id: string
  name: string
}

interface AccountOption {
  id: string
  number: string
  companyId: string
  bankId: string
}

interface BankOption {
  id: string
  name: string
}

interface BankFiltersProps {
  companies: CompanyOption[]
  accounts: AccountOption[]
  banks: BankOption[]
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

export function BankFilters({ companies, accounts, banks }: BankFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Читаем текущие значения из URL
  const selectedCompanyIds = searchParams.get("companies")?.split(",").filter(Boolean) ?? []
  const selectedAccountIds = searchParams.get("accounts")?.split(",").filter(Boolean) ?? []
  const selectedBankIds = searchParams.get("banks")?.split(",").filter(Boolean) ?? []
  const directionFilter = searchParams.get("direction") ?? ""
  const categoryFilter = searchParams.get("category") ?? ""
  const dateFrom = searchParams.get("dateFrom") ?? ""
  const dateTo = searchParams.get("dateTo") ?? ""
  const searchValue = searchParams.get("search") ?? ""

  // Debounce ref для поиска
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Каскадная фильтрация (mirror ProductFilters.tsx) ──────────────────

  /** Счета, видимые при выбранных компаниях */
  const visibleAccounts =
    selectedCompanyIds.length > 0
      ? accounts.filter((a) => selectedCompanyIds.includes(a.companyId))
      : accounts

  /** Банки, видимые при выбранных компаниях / счетах */
  const visibleBankIds = new Set(
    (selectedAccountIds.length > 0
      ? visibleAccounts.filter((a) => selectedAccountIds.includes(a.id))
      : visibleAccounts
    ).map((a) => a.bankId),
  )
  const visibleBanks =
    selectedCompanyIds.length > 0 || selectedAccountIds.length > 0
      ? banks.filter((b) => visibleBankIds.has(b.id))
      : banks

  // ── URL builder ───────────────────────────────────────────────────────

  function buildUrl(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(overrides)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    const qs = params.toString()
    return `/bank${qs ? `?${qs}` : ""}`
  }

  // ── Обработчики с каскадной очисткой ─────────────────────────────────

  function setCompanies(values: string[]) {
    // При смене компаний — вычищаем невалидные счета и банки (cascade)
    const validAccounts = accounts
      .filter((a) => values.length === 0 || values.includes(a.companyId))
      .map((a) => a.id)
    const newAccounts = selectedAccountIds.filter((id) => validAccounts.includes(id))

    const validBankIds = new Set(
      accounts
        .filter((a) => newAccounts.length === 0 || newAccounts.includes(a.id))
        .filter((a) => values.length === 0 || values.includes(a.companyId))
        .map((a) => a.bankId),
    )
    const newBanks = selectedBankIds.filter((id) => validBankIds.has(id))

    router.push(
      buildUrl({
        companies: values.join(",") || undefined,
        accounts: newAccounts.join(",") || undefined,
        banks: newBanks.join(",") || undefined,
      }),
    )
  }

  function setAccounts(values: string[]) {
    // При смене счетов — вычищаем невалидные банки
    const validBankIds = new Set(
      accounts.filter((a) => values.length === 0 || values.includes(a.id)).map((a) => a.bankId),
    )
    const newBanks =
      values.length > 0 ? selectedBankIds.filter((id) => validBankIds.has(id)) : selectedBankIds

    router.push(
      buildUrl({
        accounts: values.join(",") || undefined,
        banks: newBanks.join(",") || undefined,
      }),
    )
  }

  function setBanks(values: string[]) {
    router.push(buildUrl({ banks: values.join(",") || undefined }))
  }

  function setDirection(value: string) {
    router.push(buildUrl({ direction: value || undefined }))
  }

  function setCategory(value: string) {
    router.push(buildUrl({ category: value || undefined }))
  }

  function setDateFrom(value: string) {
    router.push(buildUrl({ dateFrom: value || undefined }))
  }

  function setDateTo(value: string) {
    router.push(buildUrl({ dateTo: value || undefined }))
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
    router.push("/bank")
  }

  const hasFilters =
    selectedCompanyIds.length > 0 ||
    selectedAccountIds.length > 0 ||
    selectedBankIds.length > 0 ||
    !!directionFilter ||
    !!categoryFilter ||
    !!dateFrom ||
    !!dateTo ||
    !!searchValue

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Компания (MultiSelect) */}
      <MultiSelectDropdown
        label="Компания"
        options={companies}
        selected={selectedCompanyIds}
        onChange={setCompanies}
      />

      {/* Счёт (MultiSelect, каскад от Компании) */}
      <MultiSelectDropdown
        label="Счёт"
        options={visibleAccounts.map((a) => ({ id: a.id, name: a.number }))}
        selected={selectedAccountIds}
        onChange={setAccounts}
      />

      {/* Банк (MultiSelect, каскад от Компании+Счёта) */}
      <MultiSelectDropdown
        label="Банк"
        options={visibleBanks}
        selected={selectedBankIds}
        onChange={setBanks}
      />

      {/* Направление — native <select> (CLAUDE.md) */}
      <select
        value={directionFilter}
        onChange={(e) => setDirection(e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">Все направления</option>
        {Object.entries(DIRECTION_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {/* Категория — native <select> (CLAUDE.md) */}
      <select
        value={categoryFilter}
        onChange={(e) => setCategory(e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">Все категории</option>
        {CATEGORY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Дата от */}
      <input
        type="date"
        value={dateFrom}
        onChange={(e) => setDateFrom(e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        title="Дата с"
      />

      {/* Дата до */}
      <input
        type="date"
        value={dateTo}
        onChange={(e) => setDateTo(e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        title="Дата по"
      />

      {/* Поиск по назначению/контрагенту — debounced 300ms */}
      <input
        type="search"
        defaultValue={searchValue}
        placeholder="Поиск по назначению / контрагенту…"
        onChange={(e) => handleSearch(e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring w-64"
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
