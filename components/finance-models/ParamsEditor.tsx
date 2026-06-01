// components/finance-models/ParamsEditor.tsx
// Редактор параметров модели — реалтайм-пересчёт через состояние родителя.
"use client"

import type { GlobalParams, VariantConfig } from "@/lib/finance-model/types"
import { Input } from "@/components/ui/input"

function Field({
  label, value, onChange, step = 1, suffix,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  suffix?: string
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          step={step}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="h-8 w-full text-right tabular-nums"
        />
        {suffix && <span className="text-muted-foreground whitespace-nowrap">{suffix}</span>}
      </div>
    </label>
  )
}

interface Props {
  params: GlobalParams
  variants: VariantConfig[]
  onParamsChange: (p: GlobalParams) => void
  onVariantsChange: (v: VariantConfig[]) => void
  onReset: () => void
}

export function ParamsEditor({ params, variants, onParamsChange, onVariantsChange, onReset }: Props) {
  const setVariant = (id: number, patch: Partial<VariantConfig>) =>
    onVariantsChange(variants.map((v) => (v.id === id ? { ...v, ...patch } : v)))

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Параметры модели</h3>
        <button
          onClick={onReset}
          className="text-xs text-primary hover:underline"
        >
          Сбросить к вводной
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Field
          label="Ставка кредита, % годовых"
          value={params.creditAnnualRate * 100}
          step={0.5}
          onChange={(v) => onParamsChange({ ...params, creditAnnualRate: (v || 0) / 100 })}
        />
        <Field
          label="Шаг/мин. кредита, млн ₽"
          value={params.creditStepRub / 1_000_000}
          step={1}
          onChange={(v) => onParamsChange({ ...params, creditStepRub: (v || 0) * 1_000_000 })}
        />
        <Field
          label="Мин. срок кредита, мес"
          value={params.creditMinTermMonths}
          step={1}
          onChange={(v) => onParamsChange({ ...params, creditMinTermMonths: v || 0 })}
        />
        <Field
          label="Реинвест прибыли, %"
          value={params.reinvestRate * 100}
          step={5}
          onChange={(v) => onParamsChange({ ...params, reinvestRate: (v || 0) / 100 })}
        />
        <Field
          label="Отсрочка выплат WB, недель"
          value={params.wbPayoutWeeks}
          step={1}
          onChange={(v) => onParamsChange({ ...params, wbPayoutWeeks: v || 0 })}
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {variants.map((v) => (
          <div key={v.id} className="rounded-md border p-3">
            <div className="mb-2 text-xs font-medium">Вариант {v.id}</div>
            <div className="space-y-2">
              <Field
                label="Собств. средства, млн ₽"
                value={v.ownFunds / 1_000_000}
                step={1}
                onChange={(val) => setVariant(v.id, { ownFunds: (val || 0) * 1_000_000 })}
              />
              <Field
                label="Дельта маржи, пп"
                value={Math.round(v.marginDeltaPct * 1000) / 10}
                step={0.5}
                onChange={(val) => setVariant(v.id, { marginDeltaPct: (val || 0) / 100 })}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
