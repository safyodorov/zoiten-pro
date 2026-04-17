"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ChevronDown, X } from "lucide-react"

interface Option {
  value: string
  label: string
}

interface Props {
  channelOptions: Option[]
  statusOptions: Option[]
  assigneeOptions: Option[]
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: Option[]
  selected: string[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function click(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", click)
    return () => document.removeEventListener("mousedown", click)
  }, [])

  function toggle(v: string) {
    onChange(
      selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]
    )
  }

  const display = selected.length > 0 ? `${label} (${selected.length})` : label
  return (
    <div ref={ref} className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
        className={`gap-1.5 ${
          selected.length > 0 ? "border-primary text-primary" : ""
        }`}
      >
        {display}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </Button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] max-h-[300px] overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {options.map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
            >
              <Checkbox
                checked={selected.includes(o.value)}
                onCheckedChange={() => toggle(o.value)}
              />
              <span className="truncate">{o.label}</span>
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

export function SupportFilters({
  channelOptions,
  statusOptions,
  assigneeOptions,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const channels = (sp.get("channels") ?? "").split(",").filter(Boolean)
  const statuses = (sp.get("statuses") ?? "").split(",").filter(Boolean)
  const assignees = (sp.get("assignees") ?? "").split(",").filter(Boolean)
  const nmId = sp.get("nmId") ?? ""
  const dateFrom = sp.get("dateFrom") ?? ""
  const dateTo = sp.get("dateTo") ?? ""
  const unansweredOnly = sp.get("unanswered") === "1"

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(sp.toString())
      if (!value) next.delete(key)
      else next.set(key, value)
      next.delete("page") // сброс пагинации при смене фильтра
      router.push(`${pathname}?${next.toString()}`)
    },
    [sp, pathname, router]
  )

  const hasFilters =
    channels.length ||
    statuses.length ||
    assignees.length ||
    nmId ||
    dateFrom ||
    dateTo ||
    unansweredOnly

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelectDropdown
        label="Канал"
        options={channelOptions}
        selected={channels}
        onChange={(v) => updateParam("channels", v.join(","))}
      />
      <MultiSelectDropdown
        label="Статус"
        options={statusOptions}
        selected={statuses}
        onChange={(v) => updateParam("statuses", v.join(","))}
      />
      <MultiSelectDropdown
        label="Менеджер"
        options={assigneeOptions}
        selected={assignees}
        onChange={(v) => updateParam("assignees", v.join(","))}
      />
      <input
        type="text"
        inputMode="numeric"
        placeholder="Артикул nmId"
        value={nmId}
        onChange={(e) => updateParam("nmId", e.target.value.replace(/\D/g, ""))}
        className="h-9 w-[140px] rounded-md border bg-transparent px-3 text-sm"
      />
      <input
        type="date"
        value={dateFrom}
        onChange={(e) => updateParam("dateFrom", e.target.value)}
        className="h-9 rounded-md border bg-transparent px-2 text-sm"
      />
      <input
        type="date"
        value={dateTo}
        onChange={(e) => updateParam("dateTo", e.target.value)}
        className="h-9 rounded-md border bg-transparent px-2 text-sm"
      />
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={unansweredOnly}
          onCheckedChange={(c) => updateParam("unanswered", c ? "1" : null)}
        />
        Только неотвеченные
      </label>
      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(pathname)}
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Сбросить
        </Button>
      ) : null}
    </div>
  )
}
