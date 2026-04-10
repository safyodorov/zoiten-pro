// components/prices/PricingCalculatorDialog.tsx
// Phase 7 (план 07-09): модалка юнит-экономики с realtime пересчётом
// и сохранением расчётной цены в слот 1/2/3.
//
// UI-SPEC (D-14, D-15):
// - 2-колоночный layout (inputs слева, outputs справа)
// - Realtime пересчёт через useWatch + useMemo → calculatePricing (latency < 100ms)
// - Чекбоксы «только этот товар» для ДРР и Брак управляют вызовом
//   updateProductOverride vs updateSubcategoryDefault/updateCategoryDefault
// - Native <select> для выбора слота (CLAUDE.md convention — НЕ base-ui Select)
// - useTransition для submit (показывает "Сохранение…" и блокирует кнопки)

"use client"

import { useMemo, useTransition } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

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
  updateProductOverride,
  updateSubcategoryDefault,
  updateCategoryDefault,
  updateProductDelivery,
} from "@/app/actions/pricing"
import type { PriceRow } from "@/components/prices/PriceCalculatorTable"

// ──────────────────────────────────────────────────────────────────
// Schema
// ──────────────────────────────────────────────────────────────────

// ВАЖНО: используем z.number() (не z.coerce.number), потому что
// react-hook-form 7.72 + zod 4.x + zodResolver создают type mismatch
// c coerce (input unknown → output number). `register(name, {valueAsNumber: true})`
// сам приводит значение input'а к числу перед валидацией Zod.
const formSchema = z.object({
  priceBeforeDiscount: z
    .number({ message: "Введите число" })
    .min(0, "Цена не может быть отрицательной"),
  sellerDiscountPct: z.number({ message: "Введите число" }).min(0).max(100),
  drrPct: z.number({ message: "Введите число" }).min(0).max(100),
  defectRatePct: z.number({ message: "Введите число" }).min(0).max(100),
  deliveryCostRub: z.number({ message: "Введите число" }).min(0),
  drrScopeProduct: z.boolean(),
  defectScopeProduct: z.boolean(),
  slot: z.number().int().min(1).max(3),
  calculatedName: z.string().max(100),
})

type FormValues = z.infer<typeof formSchema>

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

  // Initial form values — из серверного inputs
  const initialSlot =
    row.type === "calculated" && row.calculatedSlot ? row.calculatedSlot : 1
  const initialName =
    row.type === "calculated" ? row.label : `Расчётная цена ${initialSlot}`

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      priceBeforeDiscount: row.inputs.priceBeforeDiscount,
      sellerDiscountPct: row.inputs.sellerDiscountPct,
      drrPct: row.inputs.drrPct,
      defectRatePct: row.inputs.defectRatePct,
      deliveryCostRub: row.inputs.deliveryCostRub,
      drrScopeProduct: true,
      defectScopeProduct: true,
      slot: initialSlot,
      calculatedName: initialName,
    },
  })

  // Realtime outputs через useWatch + useMemo
  const watched = useWatch({
    control: form.control,
    name: [
      "priceBeforeDiscount",
      "sellerDiscountPct",
      "drrPct",
      "defectRatePct",
      "deliveryCostRub",
    ],
  })

  const liveOutputs = useMemo(() => {
    const [pBefore, sDisc, drr, defect, delivery] = watched
    const inputs: PricingInputs = {
      ...row.inputs,
      priceBeforeDiscount: Number(pBefore) || 0,
      sellerDiscountPct: Number(sDisc) || 0,
      drrPct: Number(drr) || 0,
      defectRatePct: Number(defect) || 0,
      deliveryCostRub: Number(delivery) || 0,
    }
    return calculatePricing(inputs)
  }, [watched, row.inputs])

  // ── Submit ──────────────────────────────────────────────────────
  const onSubmit = (values: FormValues) => {
    startTransition(async () => {
      try {
        // 1. Scope updates для ДРР
        if (values.drrPct !== row.inputs.drrPct) {
          if (values.drrScopeProduct) {
            const r = await updateProductOverride({
              productId: row.context.productId,
              field: "drrOverridePct",
              value: values.drrPct,
            })
            if (!r.ok) {
              toast.error(r.error || "Не удалось сохранить ДРР")
              return
            }
          } else if (row.context.subcategoryId) {
            const r = await updateSubcategoryDefault(
              row.context.subcategoryId,
              values.drrPct,
            )
            if (!r.ok) {
              toast.error(r.error || "Не удалось сохранить ДРР подкатегории")
              return
            }
            toast.info("ДРР обновлён для всех товаров подкатегории")
          } else {
            toast.warning(
              "Подкатегория не указана — ДРР сохранён только на товаре",
            )
            const r = await updateProductOverride({
              productId: row.context.productId,
              field: "drrOverridePct",
              value: values.drrPct,
            })
            if (!r.ok) {
              toast.error(r.error || "Не удалось сохранить ДРР")
              return
            }
          }
        }

        // 2. Scope updates для Брака
        if (values.defectRatePct !== row.inputs.defectRatePct) {
          if (values.defectScopeProduct) {
            const r = await updateProductOverride({
              productId: row.context.productId,
              field: "defectRateOverridePct",
              value: values.defectRatePct,
            })
            if (!r.ok) {
              toast.error(r.error || "Не удалось сохранить процент брака")
              return
            }
          } else if (row.context.categoryId) {
            const r = await updateCategoryDefault(
              row.context.categoryId,
              values.defectRatePct,
            )
            if (!r.ok) {
              toast.error(r.error || "Не удалось сохранить брак категории")
              return
            }
            toast.info("Процент брака обновлён для всех товаров категории")
          } else {
            toast.warning(
              "Категория не указана — брак сохранён только на товаре",
            )
            const r = await updateProductOverride({
              productId: row.context.productId,
              field: "defectRateOverridePct",
              value: values.defectRatePct,
            })
            if (!r.ok) {
              toast.error(r.error || "Не удалось сохранить процент брака")
              return
            }
          }
        }

        // 3. Доставка (всегда per-product — D-14)
        if (values.deliveryCostRub !== row.inputs.deliveryCostRub) {
          const r = await updateProductDelivery(
            row.context.productId,
            values.deliveryCostRub,
          )
          if (!r.ok) {
            toast.error(r.error || "Не удалось сохранить доставку")
            return
          }
        }

        // 4. Сохранить расчётную цену
        const sellerPrice =
          values.priceBeforeDiscount * (1 - values.sellerDiscountPct / 100)

        const snapshotInputs: PricingInputs = {
          ...row.inputs,
          priceBeforeDiscount: values.priceBeforeDiscount,
          sellerDiscountPct: values.sellerDiscountPct,
          drrPct: values.drrPct,
          defectRatePct: values.defectRatePct,
          deliveryCostRub: values.deliveryCostRub,
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
          sellerPrice,
          drrPct: values.drrPct,
          defectRatePct: values.defectRatePct,
          deliveryCostRub: values.deliveryCostRub,
          snapshot,
        })

        if (result.ok) {
          toast.success(`Расчётная цена «${calculatedName}» сохранена`)
          onOpenChange(false)
        } else {
          toast.error(result.error || "Не удалось сохранить расчёт")
        }
      } catch (e) {
        toast.error((e as Error).message || "Ошибка сохранения")
      }
    })
  }

  // ── Formatting helpers ──────────────────────────────────────────
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
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Расчёт юнит-экономики: {card.name ?? "Карточка"}
          </DialogTitle>
          <DialogDescription>
            Артикул: {card.nmId} · Исходная цена:{" "}
            {fmtMoney(row.inputs.priceBeforeDiscount)} ₽
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* ── Левая колонка — Inputs ─────────────────────────── */}
            <div className="space-y-4">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Входные параметры
              </h3>

              <div className="flex flex-col gap-1">
                <Label htmlFor="priceBeforeDiscount">
                  Цена продавца до скидки, ₽
                </Label>
                <Input
                  id="priceBeforeDiscount"
                  type="number"
                  step="0.01"
                  min="0"
                  className="h-9"
                  {...form.register("priceBeforeDiscount", {
                    valueAsNumber: true,
                  })}
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
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor="drrPct">ДРР, %</Label>
                <Input
                  id="drrPct"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  className="h-9"
                  {...form.register("drrPct", { valueAsNumber: true })}
                />
                <label className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                  <Checkbox
                    checked={form.watch("drrScopeProduct")}
                    onCheckedChange={(c) =>
                      form.setValue("drrScopeProduct", c === true)
                    }
                  />
                  только этот товар
                </label>
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor="defectRatePct">Процент брака, %</Label>
                <Input
                  id="defectRatePct"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  className="h-9"
                  {...form.register("defectRatePct", { valueAsNumber: true })}
                />
                <label className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                  <Checkbox
                    checked={form.watch("defectScopeProduct")}
                    onCheckedChange={(c) =>
                      form.setValue("defectScopeProduct", c === true)
                    }
                  />
                  только этот товар
                </label>
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor="deliveryCostRub">
                  Доставка на маркетплейс, ₽
                </Label>
                <Input
                  id="deliveryCostRub"
                  type="number"
                  step="0.01"
                  min="0"
                  className="h-9"
                  {...form.register("deliveryCostRub", {
                    valueAsNumber: true,
                  })}
                />
              </div>

              <div className="pt-4 border-t space-y-1 text-xs text-muted-foreground">
                <div>
                  Себестоимость:{" "}
                  <span className="text-foreground tabular-nums">
                    {fmtMoney(row.inputs.costPrice)} ₽
                  </span>
                </div>
                <div>
                  Скидка WB (СПП):{" "}
                  <span className="text-foreground tabular-nums">
                    {fmtPct(row.inputs.wbDiscountPct)}
                  </span>
                </div>
                <div>
                  Комиссия ИУ FBW:{" "}
                  <span className="text-foreground tabular-nums">
                    {fmtPct(row.inputs.commFbwPct)}
                  </span>
                </div>
                <div>Глобальные ставки применяются автоматически</div>
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
                <OutputRow
                  label="ДРР"
                  value={fmtMoney(liveOutputs.drrAmount)}
                />
                <OutputRow
                  label="Джем"
                  value={fmtMoney(liveOutputs.jemAmount)}
                />
                <OutputRow
                  label="К перечислению"
                  value={fmtMoney(liveOutputs.transferAmount)}
                />
                <OutputRow
                  label="Брак"
                  value={fmtMoney(liveOutputs.defectAmount)}
                />
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
                <OutputRow
                  label="Налог"
                  value={fmtMoney(liveOutputs.taxAmount)}
                />
              </dl>

              {/* Highlighted card — profit/Re/ROI */}
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
                Сохранить в слот:
              </label>
              <select
                id="slot-select"
                className="h-9 rounded border border-input bg-transparent px-2 text-sm"
                value={form.watch("slot")}
                onChange={(e) =>
                  form.setValue("slot", Number(e.target.value))
                }
              >
                <option value={1}>Слот 1</option>
                <option value={2}>Слот 2</option>
                <option value={3}>Слот 3</option>
              </select>
              <Input
                placeholder="Название (опционально)"
                className="h-9 flex-1 min-w-[200px]"
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
              <Button type="submit" disabled={isPending}>
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
// OutputRow — небольшой хелпер-компонент для правой колонки
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
