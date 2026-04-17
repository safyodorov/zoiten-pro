// components/support/ReturnsFilters.tsx
// Phase 9 Plan 03: Фильтры для /support/returns — 6 полей через searchParams.
// Использует общий MultiSelectDropdown из @/components/ui/multi-select-dropdown
// (Plan 09-03 Task 0 — извлечён из PricesFilters).
"use client"

import { useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { MultiSelectDropdown } from "@/components/ui/multi-select-dropdown"
import { X } from "lucide-react"
import type { User } from "@prisma/client"

const RETURN_STATE_OPTIONS = [
  { id: "PENDING", name: "Ожидает" },
  { id: "APPROVED", name: "Одобрен" },
  { id: "REJECTED", name: "Отклонён" },
]

export interface ReturnsFiltersProps {
  supportUsers: Pick<User, "id" | "firstName" | "lastName" | "name">[]
}

export function ReturnsFilters({ supportUsers }: ReturnsFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value === null || value === "") params.delete(key)
      else params.set(key, value)
      params.delete("page") // сброс пагинации
      const qs = params.toString()
      router.push(`${pathname}${qs ? `?${qs}` : ""}`)
    },
    [router, pathname, searchParams]
  )

  const currentStates =
    searchParams.get("returnStates")?.split(",").filter(Boolean) ?? []
  const currentAssignees =
    searchParams.get("assignees")?.split(",").filter(Boolean) ?? []
  const nmId = searchParams.get("nmId") ?? ""
  const dateFrom = searchParams.get("dateFrom") ?? ""
  const dateTo = searchParams.get("dateTo") ?? ""
  const reconsideredOnly = searchParams.get("reconsideredOnly") === "1"

  const userOptions = supportUsers.map((u) => ({
    id: u.id,
    name:
      [u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
      u.name ||
      u.id.slice(-6),
  }))

  const hasFilters =
    currentStates.length > 0 ||
    currentAssignees.length > 0 ||
    nmId !== "" ||
    dateFrom !== "" ||
    dateTo !== "" ||
    reconsideredOnly

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelectDropdown
        label="Статус решения"
        options={RETURN_STATE_OPTIONS}
        selected={currentStates}
        onChange={(values) =>
          setParam("returnStates", values.length ? values.join(",") : null)
        }
      />
      <input
        type="text"
        inputMode="numeric"
        placeholder="Артикул nmId"
        defaultValue={nmId}
        onBlur={(e) => {
          const v = e.target.value.replace(/\D/g, "")
          setParam("nmId", v || null)
        }}
        className="h-9 w-[140px] rounded-md border bg-transparent px-3 text-sm"
      />
      <MultiSelectDropdown
        label="Менеджер"
        options={userOptions}
        selected={currentAssignees}
        onChange={(values) =>
          setParam("assignees", values.length ? values.join(",") : null)
        }
      />
      <input
        type="date"
        value={dateFrom}
        onChange={(e) => setParam("dateFrom", e.target.value || null)}
        className="h-9 rounded-md border bg-transparent px-2 text-sm"
        aria-label="Дата от"
      />
      <input
        type="date"
        value={dateTo}
        onChange={(e) => setParam("dateTo", e.target.value || null)}
        className="h-9 rounded-md border bg-transparent px-2 text-sm"
        aria-label="Дата до"
      />
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={reconsideredOnly}
          onCheckedChange={(c) =>
            setParam("reconsideredOnly", c ? "1" : null)
          }
        />
        Только пересмотренные
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
