"use client"

import { useCallback, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { saveModelParams } from "@/app/actions/sales-plan"
import type { ModelParams } from "@/lib/sales-plan/types"

// Описания полей параметров модели
type ParamKey = keyof ModelParams

interface ParamSpec {
  key: ParamKey
  label: string
  min: number
  max: number
}

const PARAMS: readonly ParamSpec[] = [
  { key: "defaultLeadTimeDays", label: "Lead time (дн)", min: 0, max: 365 },
  { key: "safetyStockDays",     label: "Страховой запас (дн)", min: 0, max: 365 },
  { key: "vpCoverDays",         label: "Покрытие VP (дн)", min: 0, max: 365 },
  { key: "transitDays",         label: "Транзит (дн)", min: 0, max: 365 },
  { key: "wbInboundLagDays",    label: "Лаг WB (дн)", min: 0, max: 365 },
  { key: "deliveryDays",        label: "Выкуп T+ (дн)", min: 0, max: 60 },
  { key: "returnDays",          label: "Возврат T+ (дн)", min: 0, max: 60 },
] as const

interface ModelParamsBarProps {
  params: ModelParams
  readOnly?: boolean
}

export function ModelParamsBar({ params, readOnly = false }: ModelParamsBarProps) {
  const router = useRouter()
  const [values, setValues] = useState<Record<ParamKey, string>>(() => {
    const init: Record<string, string> = {}
    for (const { key } of PARAMS) {
      init[key] = String(params[key] ?? 0)
    }
    return init as Record<ParamKey, string>
  })

  const [, startTransition] = useTransition()
  const timersRef = useRef<Partial<Record<ParamKey, ReturnType<typeof setTimeout>>>>({})

  const handleChange = useCallback(
    (key: ParamKey, newValue: string) => {
      setValues((prev) => ({ ...prev, [key]: newValue }))

      // Сбрасываем pending таймер для этого ключа (паттерн GlobalRatesBar)
      const existingTimer = timersRef.current[key]
      if (existingTimer) clearTimeout(existingTimer)

      timersRef.current[key] = setTimeout(() => {
        const num = parseInt(newValue, 10)
        if (!Number.isFinite(num) || num < 0) return

        startTransition(async () => {
          const result = await saveModelParams({ [key]: num })
          if (result.ok) {
            toast.success("Параметр сохранён")
            router.refresh()
          } else {
            toast.error(result.error || "Не удалось сохранить")
          }
        })
      }, 500)
    },
    [router],
  )

  return (
    <details className="border rounded-md">
      <summary className="px-4 py-2 text-sm font-medium cursor-pointer select-none flex items-center gap-2">
        Параметры модели
      </summary>
      <div className="px-4 pb-4 pt-2 flex flex-wrap gap-4">
        {PARAMS.map(({ key, label, min, max }) => (
          <div key={key} className="flex flex-col gap-1">
            <label htmlFor={`mp-${key}`} className="text-xs text-muted-foreground font-normal">
              {label}
            </label>
            <input
              id={`mp-${key}`}
              type="number"
              step="1"
              min={min}
              max={max}
              value={values[key]}
              disabled={readOnly}
              onChange={(e) => handleChange(key, e.target.value)}
              className="h-8 w-20 rounded-md border bg-background px-2 text-sm tabular-nums disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        ))}
      </div>
    </details>
  )
}
