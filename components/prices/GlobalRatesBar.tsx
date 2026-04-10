// components/prices/GlobalRatesBar.tsx
// Phase 7 (PRICES-06): Редактор 6 глобальных ставок.
// Debounced save (500ms) через updateAppSetting server action → toast через sonner.
//
// 6 ключей (из lib/pricing-schemas.ts): wbWalletPct, wbAcquiringPct, wbJemPct,
// wbCreditPct, wbOverheadPct, wbTaxPct. Дефолты: 2.0 / 2.7 / 1.0 / 7.0 / 6.0 / 8.0.
//
// RSC-родитель (план 07-08) читает актуальные значения через getPricingSettings()
// и передаёт сюда через initialRates. Сохранение — локально, без router.refresh().

"use client"

import { useCallback, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateAppSetting } from "@/app/actions/pricing"

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

type RateKey =
  | "wbWalletPct"
  | "wbAcquiringPct"
  | "wbJemPct"
  | "wbCreditPct"
  | "wbOverheadPct"
  | "wbTaxPct"

interface RateSpec {
  key: RateKey
  label: string
}

const RATES: readonly RateSpec[] = [
  { key: "wbWalletPct", label: "Кошелёк WB" },
  { key: "wbAcquiringPct", label: "Эквайринг" },
  { key: "wbJemPct", label: "Тариф Джем" },
  { key: "wbCreditPct", label: "Кредит" },
  { key: "wbOverheadPct", label: "Общие" },
  { key: "wbTaxPct", label: "Налог" },
] as const

interface GlobalRatesBarProps {
  /** Начальные значения ставок из AppSetting (передаются RSC-родителем). */
  initialRates: Record<RateKey, number>
}

// ──────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────

export function GlobalRatesBar({ initialRates }: GlobalRatesBarProps) {
  // Храним строковые значения — пользователь может временно печатать
  // невалидную строку ("2."), которую мы не хотим форматировать на лету.
  const [values, setValues] = useState<Record<RateKey, string>>(() => {
    const initial: Record<string, string> = {}
    for (const { key } of RATES) {
      initial[key] = String(initialRates[key] ?? 0)
    }
    return initial as Record<RateKey, string>
  })

  const [isPending, startTransition] = useTransition()
  const timersRef = useRef<
    Partial<Record<RateKey, ReturnType<typeof setTimeout>>>
  >({})

  /** Debounced save через updateAppSetting server action (500 ms). */
  const handleChange = useCallback((key: RateKey, newValue: string) => {
    setValues((prev) => ({ ...prev, [key]: newValue }))

    // Сброс pending таймера для этого ключа
    const existingTimer = timersRef.current[key]
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // Установка нового таймера
    timersRef.current[key] = setTimeout(() => {
      startTransition(async () => {
        const result = await updateAppSetting(key, newValue)
        if (result.ok) {
          toast.success("Ставка сохранена")
        } else {
          toast.error(result.error || "Не удалось сохранить ставку")
        }
      })
    }, 500)
  }, [])

  return (
    <Card className="p-4 bg-muted/30 border">
      <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
        {RATES.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-1">
            <Label
              htmlFor={`rate-${key}`}
              className="text-xs text-muted-foreground font-normal"
            >
              {label}
            </Label>
            <div className="flex items-center gap-1">
              <Input
                id={`rate-${key}`}
                type="number"
                step="0.1"
                min="0"
                max="100"
                inputMode="decimal"
                className="h-8 w-20 text-sm"
                value={values[key]}
                onChange={(e) => handleChange(key, e.target.value)}
                disabled={isPending}
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
