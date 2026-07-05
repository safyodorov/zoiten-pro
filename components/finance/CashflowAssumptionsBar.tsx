// components/finance/CashflowAssumptionsBar.tsx
// Phase 28-03: Редактор 4 допущений ПДДС (MANAGE-only).
// Debounced save (500ms) через updateCashflowSetting server action → toast через sonner.
//
// 4 ключа: wbPayoutPct, wbPayoutLagWeeks, opexMonthlyRub, gapThresholdRub.
// RSC-родитель (page.tsx) читает актуальные значения и передаёт через initialSettings.
// Сохранение → router.refresh() → RSC пересчитывает ПДДС с новыми допущениями.
//
// Паттерн: components/prices/GlobalRatesBar.tsx (useRef-таймеры per-поле, startTransition).

"use client"

import { useCallback, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { updateCashflowSetting } from "@/app/actions/cashflow"
import type { CashflowSettingKey } from "@/lib/cashflow-schemas"

// ──────────────────────────────────────────────────────────────────
// Settings spec
// ──────────────────────────────────────────────────────────────────

interface SettingSpec {
  key: CashflowSettingKey
  label: string
  unit: string
  step: number
  min: number
  max: number
}

const SETTINGS: readonly SettingSpec[] = [
  {
    key: "finance.cashflow.wbPayoutPct",
    label: "Выплата WB",
    unit: "%",
    step: 1,
    min: 0,
    max: 100,
  },
  {
    key: "finance.cashflow.wbPayoutLagWeeks",
    label: "Лаг (нед.)",
    unit: "нед",
    step: 1,
    min: 0,
    max: 8,
  },
  {
    key: "finance.cashflow.opexMonthlyRub",
    label: "Опекс/мес",
    unit: "₽",
    step: 100000,
    min: 0,
    max: 1_000_000_000,
  },
  {
    key: "finance.cashflow.gapThresholdRub",
    label: "Порог тревоги",
    unit: "₽",
    step: 100000,
    min: 0,
    max: 1_000_000_000,
  },
] as const

// ──────────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────────

interface CashflowAssumptionsBarProps {
  /** Актуальные значения допущений из AppSetting (передаются RSC-родителем). */
  initialSettings: Record<CashflowSettingKey, number>
}

// ──────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────

export function CashflowAssumptionsBar({ initialSettings }: CashflowAssumptionsBarProps) {
  const router = useRouter()

  // Строковые значения — пользователь может временно печатать
  // невалидную строку ("55."), которую мы не форматируем на лету.
  const [values, setValues] = useState<Record<CashflowSettingKey, string>>(() => {
    const initial: Record<string, string> = {}
    for (const { key } of SETTINGS) {
      initial[key] = String(initialSettings[key] ?? 0)
    }
    return initial as Record<CashflowSettingKey, string>
  })

  const [isPending, startTransition] = useTransition()
  const timersRef = useRef<
    Partial<Record<CashflowSettingKey, ReturnType<typeof setTimeout>>>
  >({})

  /** Debounced save через updateCashflowSetting server action (500 ms).
   *  Отдельный таймер на каждое поле — изменение одного не сбрасывает pending save другого. */
  const handleChange = useCallback(
    (key: CashflowSettingKey, newValue: string) => {
      setValues((prev) => ({ ...prev, [key]: newValue }))

      // Сброс pending таймера для этого ключа
      const existingTimer = timersRef.current[key]
      if (existingTimer) {
        clearTimeout(existingTimer)
      }

      // Установка нового таймера 500ms
      timersRef.current[key] = setTimeout(() => {
        startTransition(async () => {
          const result = await updateCashflowSetting(key, newValue)
          if (result.ok) {
            toast.success("Настройка сохранена")
            // Пересчёт RSC с новыми допущениями
            router.refresh()
          } else {
            toast.error(result.error || "Не удалось сохранить настройку")
          }
        })
      }, 500)
    },
    [router],
  )

  return (
    <Card className="p-3 bg-muted/30 border">
      <div className="flex flex-wrap gap-3 items-end">
        {SETTINGS.map(({ key, label, unit, step, min, max }) => (
          <div key={key} className="flex flex-col gap-1">
            <Label
              htmlFor={`cf-setting-${key}`}
              className="text-xs text-muted-foreground font-normal"
            >
              {label}
            </Label>
            <div className="flex items-center gap-1">
              <input
                id={`cf-setting-${key}`}
                type="number"
                step={step}
                min={min}
                max={max}
                inputMode="numeric"
                className="h-8 w-28 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
                value={values[key]}
                onChange={(e) => handleChange(key, e.target.value)}
                disabled={isPending}
              />
              <span className="text-xs text-muted-foreground">{unit}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
