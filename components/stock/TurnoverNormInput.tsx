// components/stock/TurnoverNormInput.tsx
// Phase 14 (STOCK-14): Inline редактор «Нормы оборачиваемости» в шапке /stock.
//
// Паттерн: components/prices/GlobalRatesBar.tsx — debounced save 500ms через useRef таймер.
// Одно поле, хранится в AppSetting ("stock.turnoverNormDays"), валидация Zod int(1..100).
//
// RSC-родитель (page.tsx Plan 14-06) читает актуальное значение из AppSetting и передаёт
// через initialDays. После сохранения: revalidatePath("/stock") + revalidatePath("/stock/wb").

"use client"

import { useRef, useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateTurnoverNorm } from "@/app/actions/stock"

// ──────────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────────

interface TurnoverNormInputProps {
  /** Начальное значение нормы из AppSetting (передаётся RSC-родителем). */
  initialDays: number
}

// ──────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────

export function TurnoverNormInput({ initialDays }: TurnoverNormInputProps) {
  const [value, setValue] = useState<number>(initialDays)
  const [isPending, startTransition] = useTransition()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Debounced save через updateTurnoverNorm server action (500ms).
   * Паттерн из GlobalRatesBar.tsx (useRef таймер на поле).
   */
  const debouncedSave = (newValue: number) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      startTransition(async () => {
        const result = await updateTurnoverNorm(newValue)
        if (result.ok) {
          toast.success("Норма сохранена")
        } else {
          const errMsg = "error" in result ? result.error : ""
          toast.error(
            `Не удалось сохранить норму: ${errMsg}. Допустимо от 1 до 100 дней.`
          )
        }
      })
    }, 500)
  }

  const handleChange = (raw: string) => {
    const parsed = parseInt(raw, 10)
    if (isNaN(parsed)) return
    setValue(parsed)
    debouncedSave(parsed)
  }

  return (
    <Card className="inline-flex items-center gap-2 p-4 bg-muted/30 border">
      <Label
        htmlFor="turnover-norm"
        className="text-xs text-muted-foreground font-normal whitespace-nowrap"
      >
        Норма оборачиваемости
      </Label>
      <div className="relative flex items-center">
        <Input
          id="turnover-norm"
          type="number"
          min={1}
          max={100}
          step={1}
          className="h-8 w-16 text-sm tabular-nums"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          disabled={isPending}
        />
        {isPending && (
          <Loader2 className="absolute -right-5 h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </div>
      <span className="text-sm text-muted-foreground">дней</span>
    </Card>
  )
}
