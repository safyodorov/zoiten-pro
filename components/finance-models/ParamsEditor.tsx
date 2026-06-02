// components/finance-models/ParamsEditor.tsx
// Редактор глобальных параметров + двух независимых осей сценариев:
// собственные средства и дельта рентабельности.
"use client"

import type { GlobalParams } from "@/lib/finance-model/types"
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

/** Редактор списка чисел (одна ось сценария) с добавлением/удалением. */
function AxisEditor({
  title, values, suffix, step, onChange, scale = 1, decimals = 0,
}: {
  title: string
  /** Значения в «человеческих» единицах (млн / пп) */
  values: number[]
  suffix: string
  step: number
  onChange: (values: number[]) => void
  /** Множитель для отображения (1 — как есть) */
  scale?: number
  decimals?: number
}) {
  const set = (i: number, v: number) =>
    onChange(values.map((x, idx) => (idx === i ? v : x)))
  const add = () => onChange([...values, values.length ? values[values.length - 1] : 0])
  const remove = (i: number) => onChange(values.filter((_, idx) => idx !== i))

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium">{title}</span>
        <button onClick={add} className="text-xs text-primary hover:underline">+ добавить</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {values.map((v, i) => (
          <div key={i} className="flex items-center gap-1">
            <Input
              type="number"
              step={step}
              value={Number.isFinite(v) ? Math.round(v * scale * 10 ** decimals) / 10 ** decimals : ""}
              onChange={(e) => set(i, (parseFloat(e.target.value) || 0) / scale)}
              className="h-8 w-20 text-right tabular-nums"
            />
            <span className="text-xs text-muted-foreground">{suffix}</span>
            {values.length > 1 && (
              <button
                onClick={() => remove(i)}
                className="text-muted-foreground hover:text-destructive text-sm leading-none"
                title="Удалить"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

interface Props {
  params: GlobalParams
  /** Собственные средства, ₽[] */
  ownFundsLevels: number[]
  /** Дельты рентабельности, доли[] */
  marginDeltas: number[]
  onParamsChange: (p: GlobalParams) => void
  onOwnFundsChange: (v: number[]) => void
  onMarginDeltasChange: (v: number[]) => void
  onReset: () => void
}

export function ParamsEditor({
  params, ownFundsLevels, marginDeltas,
  onParamsChange, onOwnFundsChange, onMarginDeltasChange, onReset,
}: Props) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Параметры модели</h3>
        <button onClick={onReset} className="text-xs text-primary hover:underline">
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
          label="Срок кредита, мес"
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

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <AxisEditor
          title="Ось 1 — Собственные средства"
          values={ownFundsLevels}
          suffix="млн ₽"
          step={1}
          scale={1 / 1_000_000}
          onChange={onOwnFundsChange}
        />
        <AxisEditor
          title="Ось 2 — Дельта рентабельности"
          values={marginDeltas}
          suffix="пп"
          step={0.5}
          scale={100}
          decimals={1}
          onChange={onMarginDeltasChange}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Оси независимы: каждая комбинация (собств. средства × дельта маржи) считается отдельно.
      </p>
    </div>
  )
}
