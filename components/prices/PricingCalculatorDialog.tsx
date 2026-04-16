// components/prices/PricingCalculatorDialog.tsx
// Phase 7 + 2026-04-16: расширенная модалка юнит-экономики.
//
// 15 редактируемых параметров + 2 кнопки сохранения:
//  - «Сохранить» — пишет изменения в ТЕКУЩУЮ строку (calc slot или Product).
//    Disabled при изменении sellerPrice / sellerDiscountPct (они всегда в новый слот).
//  - «Сохранить как расчётную цену» — создаёт/обновляет слот 1/2/3 со всеми параметрами.
//
// Для каждого параметра (кроме seller* и costPrice):
//  - Input с текущим значением
//  - Чекбокс «только этот расчёт» (hidden на non-calc строках)
//    CHECKED  → CalculatedPrice.X (per-slot)
//    UNCHECKED → Product.XOverride (per-product)
//  - Кнопка «↻» — сбрасывает override в Product + slot (сервер), перезагружает страницу.
//
// Особые поля:
//  - sellerPrice, sellerDiscountPct — только новый слот. Без чекбокса и кнопки сброса.
//  - costPrice — только новый слот (saveCalculatedPrice). Без чекбокса.

"use client"

import { useMemo, useTransition } from "react"
import { useForm, useWatch } from "react-hook-form"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { RotateCcw } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { calculatePricing, type PricingInputs } from "@/lib/pricing-math"
import {
  saveCalculatedPrice,
  saveRowEdits,
  resetParamOverride,
} from "@/app/actions/pricing"
import type { PriceRow } from "@/components/prices/PriceCalculatorTable"
import type { EditableParamKey } from "@/lib/pricing-schemas"

// ──────────────────────────────────────────────────────────────────
// Editable params config
// ──────────────────────────────────────────────────────────────────

interface ParamDef {
  key: EditableParamKey
  label: string
  unit: "%" | "₽"
  /** Максимум (для %). */
  max?: number
  /** Step для инпута. */
  step?: string
}

const EDITABLE_PARAMS: ParamDef[] = [
  { key: "buyoutPct", label: "Процент выкупа", unit: "%", max: 100, step: "0.1" },
  { key: "clubDiscountPct", label: "WB Клуб", unit: "%", max: 100, step: "0.1" },
  { key: "walletPct", label: "Кошелёк", unit: "%", max: 100, step: "0.1" },
  { key: "acquiringPct", label: "Эквайринг", unit: "%", max: 100, step: "0.1" },
  { key: "commissionPct", label: "Комиссия", unit: "%", max: 100, step: "0.01" },
  { key: "jemPct", label: "Тариф Джем", unit: "%", max: 100, step: "0.1" },
  { key: "drrPct", label: "ДРР", unit: "%", max: 100, step: "0.1" },
  { key: "defectRatePct", label: "Брак", unit: "%", max: 100, step: "0.1" },
  { key: "creditPct", label: "Кредит", unit: "%", max: 100, step: "0.1" },
  { key: "overheadPct", label: "Общие расходы", unit: "%", max: 100, step: "0.1" },
  { key: "taxPct", label: "Налог", unit: "%", max: 100, step: "0.1" },
  { key: "deliveryCostRub", label: "Доставка", unit: "₽", step: "0.01" },
]

// Маппинг param key → PricingInputs key для чтения fallback-значений из row.inputs
const INPUT_KEY_MAP: Record<EditableParamKey, keyof PricingInputs> = {
  buyoutPct: "buyoutPct",
  clubDiscountPct: "clubDiscountPct",
  walletPct: "walletPct",
  acquiringPct: "acquiringPct",
  commissionPct: "commFbwPct",
  jemPct: "jemPct",
  drrPct: "drrPct",
  defectRatePct: "defectRatePct",
  creditPct: "creditPct",
  overheadPct: "overheadPct",
  taxPct: "taxPct",
  deliveryCostRub: "deliveryCostRub",
}

// ──────────────────────────────────────────────────────────────────
// Schema
// ──────────────────────────────────────────────────────────────────

// Zod-схему строим динамически через rawShape, но тип FormValues объявляем
// явно ниже — zod.infer не справляется со spread-объектом (теряет ключи).
const formSchemaShape: Record<string, z.ZodTypeAny> = {
  sellerPrice: z
    .number({ message: "Введите число" })
    .min(0, "Цена не может быть отрицательной"),
  sellerDiscountPct: z.number({ message: "Введите число" }).min(0).max(100),
  costPrice: z.number({ message: "Введите число" }).min(0),
  slot: z.number().int().min(1).max(3),
  calculatedName: z.string().max(100),
}
for (const p of EDITABLE_PARAMS) {
  formSchemaShape[p.key] = z.number({ message: "Введите число" }).min(0)
  formSchemaShape[`${p.key}_scopeSlot`] = z.boolean()
}
const formSchema = z.object(formSchemaShape)

// Явный тип FormValues со всеми полями
type FormValues = {
  sellerPrice: number
  sellerDiscountPct: number
  costPrice: number
  slot: number
  calculatedName: string
  buyoutPct: number
  clubDiscountPct: number
  walletPct: number
  acquiringPct: number
  commissionPct: number
  jemPct: number
  drrPct: number
  defectRatePct: number
  creditPct: number
  overheadPct: number
  taxPct: number
  deliveryCostRub: number
  buyoutPct_scopeSlot: boolean
  clubDiscountPct_scopeSlot: boolean
  walletPct_scopeSlot: boolean
  acquiringPct_scopeSlot: boolean
  commissionPct_scopeSlot: boolean
  jemPct_scopeSlot: boolean
  drrPct_scopeSlot: boolean
  defectRatePct_scopeSlot: boolean
  creditPct_scopeSlot: boolean
  overheadPct_scopeSlot: boolean
  taxPct_scopeSlot: boolean
  deliveryCostRub_scopeSlot: boolean
}

// ──────────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────────

interface PricingCalculatorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  card: {
    id: string
    nmId: number
    name?: string
  }
  row: PriceRow
}

// ──────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────

export function PricingCalculatorDialog({
  open,
  onOpenChange,
  card,
  row,
}: PricingCalculatorDialogProps) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const initialSlot =
    row.type === "calculated" && row.calculatedSlot ? row.calculatedSlot : 1
  const initialName =
    row.type === "calculated" ? row.label : `Расчётная цена ${initialSlot}`
  const initialSellerPrice = row.computed.sellerPrice

  // На non-calc строках нет слота → чекбоксы «только этот расчёт» скрываем
  const isCalcRow = row.type === "calculated"

  // Дефолты для 12 редактируемых параметров — из row.inputs (resolved values)
  const paramDefaults = EDITABLE_PARAMS.reduce(
    (acc, p) => {
      const inputKey = INPUT_KEY_MAP[p.key]
      acc[p.key] = row.inputs[inputKey] as number
      // По умолчанию scope = slot (как было с ДРР до рефакторинга)
      acc[`${p.key}_scopeSlot`] = true
      return acc
    },
    {} as Record<string, unknown>,
  )

  const form = useForm<FormValues>({
    // zodResolver теряет структуру типа при dynamic shape — кастуем явно
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      sellerPrice: initialSellerPrice,
      sellerDiscountPct: row.inputs.sellerDiscountPct,
      costPrice: row.inputs.costPrice,
      slot: initialSlot,
      calculatedName: initialName,
      ...paramDefaults,
    } as FormValues,
  })

  // Следим за всеми полями для realtime пересчёта
  const watchedValues = useWatch({ control: form.control })

  const liveOutputs = useMemo(() => {
    const sellerPriceNum = Number(watchedValues.sellerPrice) || 0
    const sellerDiscountNum = Number(watchedValues.sellerDiscountPct) || 0
    const priceBeforeDiscount =
      sellerDiscountNum >= 100 || sellerDiscountNum < 0
        ? sellerPriceNum
        : sellerPriceNum / (1 - sellerDiscountNum / 100)

    const inputs: PricingInputs = {
      ...row.inputs,
      priceBeforeDiscount,
      sellerDiscountPct: sellerDiscountNum,
      costPrice: Number(watchedValues.costPrice) || 0,
      buyoutPct: Number(watchedValues.buyoutPct) || 0,
      clubDiscountPct: Number(watchedValues.clubDiscountPct) || 0,
      walletPct: Number(watchedValues.walletPct) || 0,
      acquiringPct: Number(watchedValues.acquiringPct) || 0,
      commFbwPct: Number(watchedValues.commissionPct) || 0,
      jemPct: Number(watchedValues.jemPct) || 0,
      drrPct: Number(watchedValues.drrPct) || 0,
      defectRatePct: Number(watchedValues.defectRatePct) || 0,
      creditPct: Number(watchedValues.creditPct) || 0,
      overheadPct: Number(watchedValues.overheadPct) || 0,
      taxPct: Number(watchedValues.taxPct) || 0,
      deliveryCostRub: Number(watchedValues.deliveryCostRub) || 0,
    }
    return calculatePricing(inputs)
  }, [watchedValues, row.inputs])

  // Derived: Цена для установки
  const derivedPriceBeforeDiscount = useMemo(() => {
    const sp = Number(watchedValues.sellerPrice) || 0
    const sd = Number(watchedValues.sellerDiscountPct) || 0
    if (sd >= 100 || sd < 0) return sp
    return sp / (1 - sd / 100)
  }, [watchedValues.sellerPrice, watchedValues.sellerDiscountPct])

  // «Сохранить» disabled, если изменились sellerPrice или sellerDiscountPct
  const sellerPriceChanged =
    Math.abs((Number(watchedValues.sellerPrice) || 0) - initialSellerPrice) >
    0.001
  const sellerDiscountChanged =
    Math.abs(
      (Number(watchedValues.sellerDiscountPct) || 0) -
        row.inputs.sellerDiscountPct,
    ) > 0.001
  const saveExistingDisabled = sellerPriceChanged || sellerDiscountChanged

  // ── Helpers: формирование params map для action'ов ──────────────
  const buildParamsMap = (
    values: FormValues,
  ): Record<string, { value: number; scopeSlot: boolean }> => {
    const params: Record<string, { value: number; scopeSlot: boolean }> = {}
    for (const p of EDITABLE_PARAMS) {
      const value = (values as unknown as Record<string, number>)[p.key]
      const scopeSlot =
        isCalcRow &&
        (values as unknown as Record<string, boolean>)[`${p.key}_scopeSlot`]
      params[p.key] = { value: Number(value) || 0, scopeSlot: !!scopeSlot }
    }
    return params
  }

  // ── Submit: «Сохранить» (существующая строка) ───────────────────
  const onSaveExisting = (values: FormValues) => {
    startTransition(async () => {
      const result = await saveRowEdits({
        wbCardId: card.id,
        productId: row.context.productId,
        calculatedPriceId: isCalcRow ? row.calculatedPriceId ?? null : null,
        params: buildParamsMap(values),
      })

      if (result.ok) {
        toast.success("Изменения сохранены")
        onOpenChange(false)
        router.refresh()
      } else {
        toast.error(result.error || "Не удалось сохранить")
      }
    })
  }

  // ── Submit: «Сохранить как расчётную цену» (новый/текущий слот) ─
  const onSaveAsCalculated = (values: FormValues) => {
    startTransition(async () => {
      const priceBeforeDiscount =
        values.sellerDiscountPct >= 100 || values.sellerDiscountPct < 0
          ? values.sellerPrice
          : values.sellerPrice / (1 - values.sellerDiscountPct / 100)

      const snapshotInputs: PricingInputs = {
        ...row.inputs,
        priceBeforeDiscount,
        sellerDiscountPct: values.sellerDiscountPct,
        costPrice: values.costPrice,
        buyoutPct: values.buyoutPct as number,
        clubDiscountPct: values.clubDiscountPct as number,
        walletPct: values.walletPct as number,
        acquiringPct: values.acquiringPct as number,
        commFbwPct: values.commissionPct as number,
        jemPct: values.jemPct as number,
        drrPct: values.drrPct as number,
        defectRatePct: values.defectRatePct as number,
        creditPct: values.creditPct as number,
        overheadPct: values.overheadPct as number,
        taxPct: values.taxPct as number,
        deliveryCostRub: values.deliveryCostRub as number,
      }
      const snapshot: Record<string, unknown> = {
        inputs: snapshotInputs,
        outputs: liveOutputs,
        savedAt: new Date().toISOString(),
      }

      const calculatedName =
        values.calculatedName.trim() || `Расчётная цена ${values.slot}`

      const result = await saveCalculatedPrice({
        wbCardId: card.id,
        slot: values.slot,
        name: calculatedName,
        sellerPrice: values.sellerPrice,
        sellerDiscountPct: values.sellerDiscountPct,
        costPrice: values.costPrice,
        params: buildParamsMap(values),
        snapshot,
      })

      if (result.ok) {
        toast.success(`Расчётная цена «${calculatedName}» сохранена`)
        onOpenChange(false)
        router.refresh()
      } else {
        toast.error(result.error || "Не удалось сохранить расчёт")
      }
    })
  }

  // ── Reset override ──────────────────────────────────────────────
  const onResetParam = (key: EditableParamKey) => {
    startTransition(async () => {
      const result = await resetParamOverride({
        productId: row.context.productId,
        calculatedPriceId: isCalcRow ? row.calculatedPriceId ?? null : null,
        paramKey: key,
      })
      if (result.ok) {
        toast.success("Сброшено к глобальному — перезагружаю…")
        onOpenChange(false)
        router.refresh()
      } else {
        toast.error(result.error || "Не удалось сбросить")
      }
    })
  }

  // ── Formatting ──────────────────────────────────────────────────
  const fmtMoney = (n: number) =>
    Number.isFinite(n)
      ? n.toLocaleString("ru-RU", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : "—"
  const fmtPct = (n: number) =>
    Number.isFinite(n)
      ? `${(Math.round(n * 10) / 10).toFixed(1)}%`
      : "—"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Расчёт юнит-экономики: {card.name ?? "Карточка"}
          </DialogTitle>
          <DialogDescription>
            Артикул: {card.nmId} · Текущая цена продавца:{" "}
            {fmtMoney(row.computed.sellerPrice)} ₽
          </DialogDescription>
        </DialogHeader>

        <form>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* ── Левая колонка — Inputs ─────────────────────────── */}
            <div className="space-y-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Цена и скидка
              </h3>

              <div className="flex flex-col gap-1">
                <Label htmlFor="sellerPrice">Цена продавца, ₽</Label>
                <Input
                  id="sellerPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  className="h-9"
                  {...form.register("sellerPrice", { valueAsNumber: true })}
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor="sellerDiscountPct">Скидка продавца, %</Label>
                <Input
                  id="sellerDiscountPct"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  className="h-9"
                  {...form.register("sellerDiscountPct", {
                    valueAsNumber: true,
                  })}
                />
                <p className="text-xs text-muted-foreground mt-0.5">
                  Цена для установки:{" "}
                  <span className="text-foreground tabular-nums">
                    {fmtMoney(derivedPriceBeforeDiscount)} ₽
                  </span>
                </p>
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor="costPrice">Закупка (себестоимость), ₽</Label>
                <Input
                  id="costPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  className="h-9"
                  {...form.register("costPrice", { valueAsNumber: true })}
                />
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Себестоимость применяется только при сохранении в слот
                </p>
              </div>

              <div className="pt-2 border-t">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Параметры расчёта
                </h3>
                <div className="space-y-2">
                  {EDITABLE_PARAMS.map((p) => (
                    <ParamRow
                      key={p.key}
                      param={p}
                      form={form}
                      showScopeCheckbox={isCalcRow}
                      isPending={isPending}
                      onReset={onResetParam}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t text-[11px] text-muted-foreground">
                Скидка WB (СПП):{" "}
                <span className="text-foreground tabular-nums">
                  {fmtPct(row.inputs.wbDiscountPct)}
                </span>{" "}
                · применяется из данных WB
              </div>
            </div>

            {/* ── Правая колонка — Outputs ───────────────────────── */}
            <div className="space-y-3 md:border-l md:pl-6">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Результат расчёта
              </h3>

              <dl className="space-y-1 text-xs tabular-nums">
                <OutputRow
                  label="Цена продавца"
                  value={fmtMoney(liveOutputs.sellerPrice)}
                />
                <OutputRow
                  label="Цена со скидкой WB"
                  value={fmtMoney(liveOutputs.priceAfterWbDiscount)}
                />
                <OutputRow
                  label="Цена с кошельком"
                  value={fmtMoney(liveOutputs.priceAfterWallet)}
                />
                <OutputRow
                  label="Кошелёк"
                  value={fmtMoney(liveOutputs.walletAmount)}
                />
                <OutputRow
                  label="Эквайринг"
                  value={fmtMoney(liveOutputs.acquiringAmount)}
                />
                <OutputRow
                  label="Комиссия"
                  value={fmtMoney(liveOutputs.commissionAmount)}
                />
                <OutputRow label="ДРР" value={fmtMoney(liveOutputs.drrAmount)} />
                <OutputRow label="Джем" value={fmtMoney(liveOutputs.jemAmount)} />
                <OutputRow
                  label="К перечислению"
                  value={fmtMoney(liveOutputs.transferAmount)}
                />
                <OutputRow label="Брак" value={fmtMoney(liveOutputs.defectAmount)} />
                <OutputRow
                  label="Доставка"
                  value={fmtMoney(liveOutputs.deliveryAmount)}
                />
                <OutputRow
                  label="Кредит"
                  value={fmtMoney(liveOutputs.creditAmount)}
                />
                <OutputRow
                  label="Общие расходы"
                  value={fmtMoney(liveOutputs.overheadAmount)}
                />
                <OutputRow label="Налог" value={fmtMoney(liveOutputs.taxAmount)} />
              </dl>

              <div className="mt-4 bg-muted/50 p-3 rounded-md space-y-2">
                <OutputRow
                  label="Прибыль"
                  value={`${fmtMoney(liveOutputs.profit)} ₽`}
                  className={cn(
                    "text-sm font-medium",
                    liveOutputs.profit >= 0
                      ? "text-green-600 dark:text-green-500"
                      : "text-red-600 dark:text-red-500",
                  )}
                />
                <OutputRow
                  label="Re продаж"
                  value={fmtPct(liveOutputs.returnOnSalesPct)}
                  className={cn(
                    "text-sm font-medium",
                    liveOutputs.returnOnSalesPct >= 0
                      ? "text-green-600 dark:text-green-500"
                      : "text-red-600 dark:text-red-500",
                  )}
                />
                <OutputRow
                  label="ROI"
                  value={fmtPct(liveOutputs.roiPct)}
                  className={cn(
                    "text-sm font-medium",
                    liveOutputs.roiPct >= 0
                      ? "text-green-600 dark:text-green-500"
                      : "text-red-600 dark:text-red-500",
                  )}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <div className="flex items-center gap-3 w-full flex-wrap">
              <label
                htmlFor="slot-select"
                className="text-sm whitespace-nowrap"
              >
                Слот для сохранения:
              </label>
              <select
                id="slot-select"
                className="h-9 rounded border border-input bg-transparent px-2 text-sm"
                value={form.watch("slot")}
                onChange={(e) =>
                  form.setValue("slot", Number(e.target.value) as 1 | 2 | 3)
                }
              >
                <option value={1}>Слот 1</option>
                <option value={2}>Слот 2</option>
                <option value={3}>Слот 3</option>
              </select>
              <Input
                placeholder="Название (опционально)"
                className="h-9 flex-1 min-w-[160px]"
                {...form.register("calculatedName")}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Отмена
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={form.handleSubmit(onSaveExisting)}
                disabled={isPending || saveExistingDisabled}
                title={
                  saveExistingDisabled
                    ? "Изменение цены продавца или скидки сохраняется только в новый слот"
                    : "Сохранить изменения в текущую строку"
                }
              >
                Сохранить
              </Button>
              <Button
                type="button"
                onClick={form.handleSubmit(onSaveAsCalculated)}
                disabled={isPending}
              >
                {isPending ? "Сохранение…" : "Сохранить как расчётную цену"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ──────────────────────────────────────────────────────────────────
// ParamRow — строка одного параметра (Label + Input + чекбокс + ↻)
// ──────────────────────────────────────────────────────────────────

function ParamRow({
  param,
  form,
  showScopeCheckbox,
  isPending,
  onReset,
}: {
  param: ParamDef
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: any
  showScopeCheckbox: boolean
  isPending: boolean
  onReset: (key: EditableParamKey) => void
}) {
  const scopeKey = `${param.key}_scopeSlot`
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1 min-w-0">
        <Label htmlFor={param.key} className="text-xs">
          {param.label}, {param.unit}
        </Label>
        <Input
          id={param.key}
          type="number"
          min="0"
          max={param.max}
          step={param.step ?? "0.01"}
          className="h-8 text-sm"
          {...form.register(param.key, { valueAsNumber: true })}
        />
      </div>
      {showScopeCheckbox && (
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0 pb-1.5 whitespace-nowrap cursor-pointer">
          <Checkbox
            checked={form.watch(scopeKey) === true}
            onCheckedChange={(c: boolean | string) =>
              form.setValue(scopeKey, c === true)
            }
          />
          <span>только этот&nbsp;расчёт</span>
        </label>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => onReset(param.key)}
        disabled={isPending}
        title="Применить глобальные — сбросить override"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// OutputRow
// ──────────────────────────────────────────────────────────────────

function OutputRow({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={cn("flex justify-between gap-4", className)}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  )
}
