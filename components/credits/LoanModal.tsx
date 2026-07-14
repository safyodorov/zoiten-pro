"use client"

import { useState, useEffect } from "react"
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
import { createLoan, updateLoan } from "@/app/actions/credits"
import type { LenderOption, CompanyOption } from "@/lib/credits-data"

// ── Types ──────────────────────────────────────────────────────────

interface LoanForModal {
  id: string
  contractNumber: string
  companyId: string
  lenderId: string
  amount: number
  annualRatePct: number
  termMonths: number | null
  issueDate: Date | null
  monthlyCommissionRub: number | null // quick 260714-ij9
  monthlyNdflRub: number | null       // quick 260714-ij9
  notes: string | null
  payments: Array<{ date: Date; principal: number; interest: number }>
}

interface LoanModalProps {
  mode: "create" | "edit"
  loan?: LoanForModal
  lenders: LenderOption[]
  companies: CompanyOption[]
  trigger: React.ReactNode
}

// ── Zod Schema ─────────────────────────────────────────────────────
// Использует z.number() + valueAsNumber: true (НЕ z.coerce) — zod 4.x + RHF 7.72 несовместимость

const PaymentSchema = z.object({
  date: z.string().min(1, "Укажите дату"),
  principal: z.number().nonnegative("Тело долга ≥ 0"),
  interest: z.number().nonnegative("Проценты ≥ 0"),
})

const LoanFormSchema = z.object({
  contractNumber: z.string().min(1, "Укажите № КД").max(100),
  companyId: z.string().min(1, "Укажите организацию"),
  lenderId: z.string().min(1, "Укажите кредитора"),
  amount: z.number().positive("Сумма > 0"),
  annualRatePct: z.number().min(0).max(1000),
  termMonths: z.number().int().positive().nullable().optional(),
  issueDate: z.string().nullable().optional(),
  monthlyCommissionRub: z.number().nonnegative().nullable().optional(), // quick 260714-ij9
  monthlyNdflRub: z.number().nonnegative().nullable().optional(),       // quick 260714-ij9
  notes: z.string().max(2000).nullable().optional(),
  payments: z.array(PaymentSchema).default([]),
})

type LoanFormValues = z.infer<typeof LoanFormSchema>

// ── Helpers ────────────────────────────────────────────────────────

function toDateInputValue(d: Date | null | undefined): string {
  if (!d) return ""
  const dt = typeof d === "string" ? new Date(d) : d
  if (isNaN(dt.getTime())) return ""
  return dt.toISOString().split("T")[0]
}

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

// ── Main component ─────────────────────────────────────────────────

export function LoanModal({
  mode,
  loan,
  lenders,
  companies,
  trigger,
}: LoanModalProps) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<LoanFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(LoanFormSchema) as any,
    defaultValues: {
      contractNumber: "",
      companyId: "",
      lenderId: "",
      amount: undefined,
      annualRatePct: undefined,
      termMonths: null,
      issueDate: null,
      monthlyCommissionRub: null,
      monthlyNdflRub: null,
      notes: "",
      payments: [],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: "payments",
  })

  // Populate form when modal opens (edit mode)
  useEffect(() => {
    if (open) {
      if (mode === "edit" && loan) {
        reset({
          contractNumber: loan.contractNumber,
          companyId: loan.companyId,
          lenderId: loan.lenderId,
          amount: loan.amount,
          annualRatePct: loan.annualRatePct,
          termMonths: loan.termMonths ?? null,
          issueDate: toDateInputValue(loan.issueDate) || null,
          monthlyCommissionRub: loan.monthlyCommissionRub ?? null,
          monthlyNdflRub: loan.monthlyNdflRub ?? null,
          notes: loan.notes ?? "",
          payments: loan.payments.map((p) => ({
            date: toDateInputValue(p.date),
            principal: p.principal,
            interest: p.interest,
          })),
        })
      } else {
        reset({
          contractNumber: "",
          companyId: "",
          lenderId: "",
          amount: undefined,
          annualRatePct: undefined,
          termMonths: null,
          issueDate: null,
          monthlyCommissionRub: null,
          monthlyNdflRub: null,
          notes: "",
          payments: [],
        })
      }
    }
  }, [open, mode, loan, reset])

  async function onSubmit(values: LoanFormValues) {
    setSaving(true)
    try {
      if (mode === "create") {
        const result = await createLoan({
          contractNumber: values.contractNumber,
          companyId: values.companyId,
          lenderId: values.lenderId,
          amount: values.amount,
          annualRatePct: values.annualRatePct,
          termMonths: values.termMonths ?? null,
          issueDate: values.issueDate || null,
          monthlyCommissionRub: values.monthlyCommissionRub ?? null,
          monthlyNdflRub: values.monthlyNdflRub ?? null,
          notes: values.notes || null,
          payments: values.payments,
        })
        if (result.ok) {
          toast.success("Кредит добавлен")
          setOpen(false)
          router.refresh()
        } else {
          toast.error(result.error)
        }
      } else {
        if (!loan) return
        const result = await updateLoan({
          id: loan.id,
          contractNumber: values.contractNumber,
          companyId: values.companyId,
          lenderId: values.lenderId,
          amount: values.amount,
          annualRatePct: values.annualRatePct,
          termMonths: values.termMonths ?? null,
          issueDate: values.issueDate || null,
          monthlyCommissionRub: values.monthlyCommissionRub ?? null,
          monthlyNdflRub: values.monthlyNdflRub ?? null,
          notes: values.notes || null,
          payments: values.payments,
        })
        if (result.ok) {
          toast.success("Кредит обновлён")
          setOpen(false)
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
  const selectCls =
    "h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
  const errorCls = "text-xs text-destructive mt-0.5"

  return (
    <>
      {/* Trigger — opens dialog */}
      <span onClick={() => setOpen(true)} className="cursor-pointer">
        {trigger}
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>
                {mode === "create" ? "Добавить кредит" : "Редактировать кредит"}
              </DialogTitle>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              {/* ── Реквизиты ── */}
              <SectionDivider label="Реквизиты кредита" />

              <div className="grid grid-cols-2 gap-3">
                {/* № КД */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    № КД <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    {...register("contractNumber")}
                    placeholder="№ 3702242101-23-2"
                    className={inputCls}
                  />
                  {errors.contractNumber && (
                    <p className={errorCls}>{errors.contractNumber.message}</p>
                  )}
                </div>

                {/* Дата выдачи */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Дата выдачи
                    <span className="text-muted-foreground/60 ml-1 text-xs">(необязательно)</span>
                  </label>
                  <input
                    type="date"
                    {...register("issueDate")}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Организация — native <select> (CLAUDE.md convention) */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Организация <span className="text-destructive">*</span>
                  </label>
                  <select {...register("companyId")} className={selectCls}>
                    <option value="">Выберите организацию</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {errors.companyId && (
                    <p className={errorCls}>{errors.companyId.message}</p>
                  )}
                </div>

                {/* Кредитор — native <select> (U-03) */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Кредитор <span className="text-destructive">*</span>
                  </label>
                  <select {...register("lenderId")} className={selectCls}>
                    <option value="">Выберите кредитора</option>
                    {lenders.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  {errors.lenderId && (
                    <p className={errorCls}>{errors.lenderId.message}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {/* Сумма */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Сумма, ₽ <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    {...register("amount", { valueAsNumber: true })}
                    placeholder="1000000"
                    className={inputCls}
                  />
                  {errors.amount && (
                    <p className={errorCls}>{errors.amount.message}</p>
                  )}
                </div>

                {/* Годовая ставка % */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Ставка % <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    max="1000"
                    {...register("annualRatePct", { valueAsNumber: true })}
                    placeholder="28.000"
                    className={inputCls}
                  />
                  {errors.annualRatePct && (
                    <p className={errorCls}>{errors.annualRatePct.message}</p>
                  )}
                </div>

                {/* Срок мес */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Срок, мес
                    <span className="text-muted-foreground/60 ml-1 text-xs">(необязательно)</span>
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    {...register("termMonths", {
                      valueAsNumber: true,
                      setValueAs: (v) => (v === "" || isNaN(Number(v)) ? null : Number(v)),
                    })}
                    placeholder="24"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* ── Кредитный пул (quick 260714-ij9) ── */}
              <SectionDivider label="Кредитный пул (фин-отчёт за неделю)" />
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Комиссия, ₽/мес
                    <span className="text-muted-foreground/60 ml-1 text-xs">(необязательно)</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    {...register("monthlyCommissionRub", {
                      valueAsNumber: true,
                      setValueAs: (v) => (v === "" || isNaN(Number(v)) ? null : Number(v)),
                    })}
                    placeholder="0"
                    className={inputCls}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    НДФЛ, ₽/мес
                    <span className="text-muted-foreground/60 ml-1 text-xs">(необязательно)</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    {...register("monthlyNdflRub", {
                      valueAsNumber: true,
                      setValueAs: (v) => (v === "" || isNaN(Number(v)) ? null : Number(v)),
                    })}
                    placeholder="0"
                    className={inputCls}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Амортизация единовременной комиссии JetLend / НДФЛ инвесторам, равномерно
                на срок; входит в кредитный пул /finance/weekly.
              </p>

              {/* Заметки */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Заметки</label>
                <textarea
                  {...register("notes")}
                  rows={2}
                  placeholder="Дополнительная информация..."
                  className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </div>

              {/* ── График платежей (nested useFieldArray) ── */}
              <SectionDivider label="График платежей" />

              <div className="space-y-2">
                {fields.length > 0 && (
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30">
                        <tr>
                          <th className="px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground">
                            Дата
                          </th>
                          <th className="px-2 py-1.5 text-right text-xs font-semibold text-muted-foreground">
                            Тело долга, ₽
                          </th>
                          <th className="px-2 py-1.5 text-right text-xs font-semibold text-muted-foreground">
                            Проценты, ₽
                          </th>
                          <th className="px-2 py-1.5 w-8" />
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {fields.map((field, idx) => (
                          <tr key={field.id}>
                            <td className="px-2 py-1">
                              <input
                                type="date"
                                {...register(`payments.${idx}.date`)}
                                className="h-7 w-36 rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                              {errors.payments?.[idx]?.date && (
                                <p className="text-xs text-destructive">
                                  {errors.payments[idx]?.date?.message}
                                </p>
                              )}
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                {...register(`payments.${idx}.principal`, {
                                  valueAsNumber: true,
                                })}
                                className="h-7 w-32 rounded border border-input bg-background px-1.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                {...register(`payments.${idx}.interest`, {
                                  valueAsNumber: true,
                                })}
                                className="h-7 w-32 rounded border border-input bg-background px-1.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                            </td>
                            <td className="px-2 py-1">
                              <button
                                type="button"
                                onClick={() => remove(idx)}
                                className="text-muted-foreground hover:text-destructive text-base leading-none"
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {fields.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">
                    График пуст. Добавьте строки платежей.
                  </p>
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ date: "", principal: 0, interest: 0 })}
                >
                  + Добавить строку
                </Button>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
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
    </>
  )
}
