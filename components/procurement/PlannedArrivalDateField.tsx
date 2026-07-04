"use client"

// Поле «Плановая дата прихода в Иваново» в карточке закупки.
// Используется в detail page RSC через client-компонент (чтобы page оставался RSC).
// Требует canManage=true (PROCUREMENT MANAGE) для редактирования.

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { savePlannedArrivalDate } from "@/app/actions/procurement"

interface PlannedArrivalDateFieldProps {
  purchaseId: string
  /** ISO дата "YYYY-MM-DD" или null */
  plannedArrivalDate: string | null
  /** Расчётный дефолт (createdAt + leadTimeDays) — показывается как хинт если дата не задана */
  estimatedDateLabel?: string | null
  canManage: boolean
}

export function PlannedArrivalDateField({
  purchaseId,
  plannedArrivalDate,
  estimatedDateLabel,
  canManage,
}: PlannedArrivalDateFieldProps) {
  const [value, setValue] = useState(plannedArrivalDate ?? "")
  const [, startTransition] = useTransition()

  function handleChange(newValue: string) {
    setValue(newValue)
  }

  function handleBlur() {
    const dateToSave = value.trim() === "" ? null : value
    // Не сохраняем если значение не изменилось
    if ((dateToSave ?? "") === (plannedArrivalDate ?? "")) return

    startTransition(async () => {
      const result = await savePlannedArrivalDate({
        purchaseId,
        date: dateToSave,
      })
      if (!result.ok) {
        toast.error(result.error)
        setValue(plannedArrivalDate ?? "")
      } else {
        toast.success("Дата прихода сохранена")
      }
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">
        Плановая дата прихода в Иваново
      </label>
      {canManage ? (
        <div className="flex flex-col gap-0.5">
          <input
            type="date"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={handleBlur}
            className="h-8 rounded border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            lang="ru"
          />
          {!value && estimatedDateLabel && (
            <span className="text-xs text-muted-foreground">
              расчётно: {estimatedDateLabel}
            </span>
          )}
          <span className="text-xs text-muted-foreground/70">
            приоритетный источник дат для плана продаж; без неё — эвристика createdAt+45
          </span>
        </div>
      ) : (
        <div className="text-sm">
          {value ? (
            value.split("-").reverse().join(".")
          ) : estimatedDateLabel ? (
            <span className="text-muted-foreground">расчётно: {estimatedDateLabel}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      )}
    </div>
  )
}
