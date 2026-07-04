"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { createPurchase, updatePurchase } from "@/app/actions/purchases"

// ── Shared types (используются page.tsx + PurchasesTable) ───────────

export interface SupplierOption {
  id: string
  name: string
}

export interface ProductOption {
  id: string
  name: string
  sku: string
}

export interface ProductLinkParams {
  unitPrice: number | null
  currency: string | null
  depositPct: number | null
  balancePct: number | null
  leadTimeDays: number | null
}

// supplierId → (productId → link params)
export type ProductLinkMap = Record<string, Record<string, ProductLinkParams>>

export interface PurchaseForModal {
  id: string
  supplierId: string
  currency: string
  status: "PLANNED" | "ACTIVE" | "COMPLETED"
  optionsDescription: string | null
  optionsExtraCost: number | null
  logisticsCost: number | null
  logisticsComment: string | null
  items: Array<{ id: string; productId: string; quantity: number; unitPrice: number }>
}

/** Префилл из виртуальной закупки (from-virtual конвертация, Phase 25 wave 6) */
export interface FromVirtualPrefill {
  virtualPurchaseId: string
  supplierId: string | null
  currency: string
  productId: string | null
  quantity: number
  unitPrice: number | null
}

interface PurchaseModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "create" | "edit"
  purchase: PurchaseForModal | null
  suppliers: SupplierOption[]
  products: ProductOption[]
  productLinkMap: ProductLinkMap
  /** Если задан — открыт в режиме конвертации виртуальной закупки */
  fromVirtualPrefill?: FromVirtualPrefill | null
}

const CURRENCIES = ["CNY", "USD", "EUR", "RUB"]

// ── Zod schema (z.number() + valueAsNumber — проектная конвенция) ───

const ItemSchema = z.object({
  id: z.string().optional().nullable(),
  productId: z.string().min(1, "Выберите товар"),
  quantity: z.number().int().positive("Кол-во > 0"),
  unitPrice: z.number().nonnegative("Цена ≥ 0"),
})

const PurchaseFormSchema = z.object({
  supplierId: z.string().min(1, "Выберите поставщика"),
  currency: z.string().min(1),
  status: z.enum(["PLANNED", "ACTIVE", "COMPLETED"]),
  optionsDescription: z.string().nullable().optional(),
  optionsExtraCost: z.number().nullable().optional(),
  logisticsCost: z.number().nullable().optional(),
  logisticsComment: z.string().nullable().optional(),
  items: z.array(ItemSchema).min(1, "Добавьте хотя бы одну позицию"),
})

type PurchaseFormValues = z.infer<typeof PurchaseFormSchema>

// ── SectionDivider ─────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────

export function PurchaseModal({
  open,
  onOpenChange,
  mode,
  purchase,
  suppliers,
  products,
  productLinkMap,
  fromVirtualPrefill,
}: PurchaseModalProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<PurchaseFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(PurchaseFormSchema) as any,
    defaultValues: {
      supplierId: "",
      currency: "CNY",
      status: "PLANNED",
      optionsDescription: "",
      optionsExtraCost: null,
      logisticsCost: null,
      logisticsComment: "",
      items: [{ productId: "", quantity: 1, unitPrice: 0 }],
    },
  })

  const { fields, append, remove, replace } = useFieldArray({ control, name: "items" })
  const supplierId = watch("supplierId")
  const itemsWatch = watch("items")

  // Каскад D-07: товары, связанные с выбранным поставщиком (через SupplierProductLink).
  // Пока поставщик не выбран — список пуст и селект заблокирован.
  const availableProducts = useMemo(() => {
    if (!supplierId) return []
    const linked = productLinkMap[supplierId]
    if (!linked) return []
    return products.filter((p) => linked[p.id])
  }, [supplierId, products, productLinkMap])

  // Опции для конкретной строки: связанные товары + уже выбранный (для edit с
  // историческими позициями, которых может не быть в текущих связках поставщика).
  function rowOptions(idx: number): ProductOption[] {
    const currentId = itemsWatch?.[idx]?.productId
    if (!currentId || availableProducts.some((p) => p.id === currentId)) {
      return availableProducts
    }
    const current = products.find((p) => p.id === currentId)
    return current ? [current, ...availableProducts] : availableProducts
  }

  // Смена поставщика → сбрасываем позиции (товары прежнего поставщика невалидны).
  function handleSupplierChange(newSupplierId: string) {
    setValue("supplierId", newSupplierId, { shouldValidate: true })
    replace([{ productId: "", quantity: 1, unitPrice: 0 }])
  }

  useEffect(() => {
    if (!open) return
    if (mode === "edit" && purchase) {
      reset({
        supplierId: purchase.supplierId,
        currency: purchase.currency,
        status: purchase.status,
        optionsDescription: purchase.optionsDescription ?? "",
        optionsExtraCost: purchase.optionsExtraCost,
        logisticsCost: purchase.logisticsCost,
        logisticsComment: purchase.logisticsComment ?? "",
        items: purchase.items.map((i) => ({
          id: i.id,
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
      })
    } else if (fromVirtualPrefill) {
      // Конвертация виртуальной закупки (from-virtual)
      reset({
        supplierId: fromVirtualPrefill.supplierId ?? "",
        currency: fromVirtualPrefill.currency,
        status: "PLANNED",
        optionsDescription: "",
        optionsExtraCost: null,
        logisticsCost: null,
        logisticsComment: "",
        items: [
          {
            productId: fromVirtualPrefill.productId ?? "",
            quantity: fromVirtualPrefill.quantity,
            unitPrice: fromVirtualPrefill.unitPrice ?? 0,
          },
        ],
      })
    } else {
      reset({
        supplierId: "",
        currency: "CNY",
        status: "PLANNED",
        optionsDescription: "",
        optionsExtraCost: null,
        logisticsCost: null,
        logisticsComment: "",
        items: [{ productId: "", quantity: 1, unitPrice: 0 }],
      })
    }
  }, [open, mode, purchase, fromVirtualPrefill, reset])

  // D-06: при выборе товара — prefill unitPrice из SupplierProductLink выбранного
  // поставщика. Поле остаётся редактируемым (только подстановка значения).
  function handleProductChange(idx: number, productId: string) {
    setValue(`items.${idx}.productId`, productId, { shouldValidate: true })
    if (!supplierId || !productId) return
    const link = productLinkMap[supplierId]?.[productId]
    if (link?.unitPrice != null) {
      setValue(`items.${idx}.unitPrice`, link.unitPrice, { shouldValidate: true })
    }
  }

  // Резолв депозита/баланса/срока из первой позиции с заполненной связкой (для create).
  function resolvePaymentParams(items: PurchaseFormValues["items"], supId: string) {
    for (const it of items) {
      const link = productLinkMap[supId]?.[it.productId]
      if (link) {
        return {
          depositPct: link.depositPct,
          balancePct: link.balancePct,
          leadTimeDays: link.leadTimeDays,
        }
      }
    }
    return { depositPct: null, balancePct: null, leadTimeDays: null }
  }

  async function onSubmit(values: PurchaseFormValues) {
    setSaving(true)
    try {
      if (mode === "create") {
        const params = resolvePaymentParams(values.items, values.supplierId)
        const result = await createPurchase({
          supplierId: values.supplierId,
          currency: values.currency,
          optionsDescription: values.optionsDescription || null,
          optionsExtraCost: values.optionsExtraCost ?? null,
          logisticsCost: values.logisticsCost ?? null,
          logisticsComment: values.logisticsComment || null,
          items: values.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
          depositPct: params.depositPct,
          balancePct: params.balancePct,
          leadTimeDays: params.leadTimeDays,
          // from-virtual конвертация: CONVERTED статус проставляется в той же транзакции
          fromVirtualId: fromVirtualPrefill?.virtualPurchaseId ?? null,
        })
        if (result.ok) {
          toast.success("Закупка создана")
          onOpenChange(false)
          router.push(`/procurement/purchases/${result.id}`)
        } else {
          toast.error(result.error)
        }
      } else {
        if (!purchase) return
        const result = await updatePurchase({
          id: purchase.id,
          status: values.status,
          currency: values.currency,
          optionsDescription: values.optionsDescription || null,
          optionsExtraCost: values.optionsExtraCost ?? null,
          logisticsCost: values.logisticsCost ?? null,
          logisticsComment: values.logisticsComment || null,
          items: values.items.map((i) => ({
            id: i.id ?? null,
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
        })
        if (result.ok) {
          toast.success("Закупка обновлена")
          onOpenChange(false)
          router.refresh()
        } else {
          toast.error(result.error)
        }
      }
    } catch {
      toast.error("Ошибка сервера")
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    "h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
  const errorCls = "text-xs text-destructive mt-0.5"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>
              {fromVirtualPrefill
                ? "Создать закупку из предложения"
                : mode === "create"
                  ? "Новая закупка"
                  : "Редактировать закупку"}
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            {/* ── Основное ── */}
            <SectionDivider label="Основное" />

            <div className="grid grid-cols-2 gap-3">
              {/* Поставщик (один на закупку D-07) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Поставщик <span className="text-destructive">*</span>
                </label>
                <select
                  value={watch("supplierId")}
                  onChange={(e) => handleSupplierChange(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Выберите поставщика</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {errors.supplierId && (
                  <p className={errorCls}>{errors.supplierId.message}</p>
                )}
              </div>

              {/* Валюта (одна на закупку D-05) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Валюта <span className="text-destructive">*</span>
                </label>
                <select {...register("currency")} className={inputCls}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {mode === "edit" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Статус
                  </label>
                  <select {...register("status")} className={inputCls}>
                    <option value="PLANNED">Планируемая</option>
                    <option value="ACTIVE">Текущая</option>
                    <option value="COMPLETED">Завершённая</option>
                  </select>
                </div>
              </div>
            )}

            {/* ── Позиции ── */}
            <SectionDivider label="Позиции" />

            <div className="space-y-2">
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground">
                        Товар
                      </th>
                      <th className="px-2 py-1.5 text-right text-xs font-semibold text-muted-foreground w-24">
                        Кол-во
                      </th>
                      <th className="px-2 py-1.5 text-right text-xs font-semibold text-muted-foreground w-32">
                        Цена за ед.
                      </th>
                      <th className="px-2 py-1.5 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {fields.map((field, idx) => (
                      <tr key={field.id}>
                        <td className="px-2 py-1">
                          <select
                            value={watch(`items.${idx}.productId`)}
                            onChange={(e) => handleProductChange(idx, e.target.value)}
                            disabled={!supplierId}
                            className="h-7 w-full rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <option value="">
                              {supplierId
                                ? availableProducts.length
                                  ? "Выберите товар"
                                  : "У поставщика нет связанных товаров"
                                : "Сначала выберите поставщика"}
                            </option>
                            {rowOptions(idx).map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.sku} — {p.name}
                              </option>
                            ))}
                          </select>
                          {errors.items?.[idx]?.productId && (
                            <p className="text-xs text-destructive">
                              {errors.items[idx]?.productId?.message}
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            step="1"
                            min="1"
                            {...register(`items.${idx}.quantity`, { valueAsNumber: true })}
                            className="h-7 w-full rounded border border-input bg-background px-1.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            step="0.0001"
                            min="0"
                            {...register(`items.${idx}.unitPrice`, { valueAsNumber: true })}
                            className="h-7 w-full rounded border border-input bg-background px-1.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        <td className="px-2 py-1">
                          {fields.length > 1 && (
                            <button
                              type="button"
                              onClick={() => remove(idx)}
                              className="text-muted-foreground hover:text-destructive text-base leading-none"
                            >
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {errors.items && typeof errors.items.message === "string" && (
                <p className={errorCls}>{errors.items.message}</p>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ productId: "", quantity: 1, unitPrice: 0 })}
              >
                + Добавить позицию
              </Button>
            </div>

            {/* ── Опции и логистика ── */}
            <SectionDivider label="Опции и логистика" />

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Описание опций
                </label>
                <input
                  type="text"
                  {...register("optionsDescription")}
                  className={inputCls}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Доп. стоимость опций
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  {...register("optionsExtraCost", {
                    setValueAs: (v) => (v === "" || isNaN(Number(v)) ? null : Number(v)),
                  })}
                  className={inputCls}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Стоимость логистики
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  {...register("logisticsCost", {
                    setValueAs: (v) => (v === "" || isNaN(Number(v)) ? null : Number(v)),
                  })}
                  className={inputCls}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Комментарий к логистике
                </label>
                <input
                  type="text"
                  {...register("logisticsComment")}
                  className={inputCls}
                />
              </div>
            </div>

            {mode === "create" && (
              <p className="text-[11px] text-muted-foreground">
                После создания автоматически появятся платежи: Депозит (дата создания + 3 дня)
                и Баланс (дата депозита + срок поставки). Их можно отредактировать на странице
                закупки.
              </p>
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Сохранение..." : mode === "create" ? "Создать" : "Сохранить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
