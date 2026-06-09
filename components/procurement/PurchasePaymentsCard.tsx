"use client"

// PurchasePaymentsCard (D-08, D-16)
// Вертикальный список карточек платежей (Депозит N / Баланс N).
// LIVE percent↔amount пересчёт через lib/procurement-math (single source of truth,
// тот же helper что и сервер). Добавление Депозит N / Баланс N + сохранение всех
// через savePurchasePayments. «Отметить оплаченным» через markPaymentPaid.
// НИКОГДА не пишет в Supplier — только PurchasePayment.

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { savePurchasePayments, markPaymentPaid } from "@/app/actions/purchases"
import {
  recomputeAmountFromPercent,
  recomputePercentFromAmount,
} from "@/lib/procurement-math"

// ── Types ──────────────────────────────────────────────────────────

export interface PaymentDraft {
  id: string | null
  type: "DEPOSIT" | "BALANCE"
  ordinal: number
  percent: number | null
  amount: number
  currency: string
  dueDate: string // yyyy-mm-dd
  paidDate: string | null // yyyy-mm-dd | null
  status: "PLANNED" | "PAID" | "OVERDUE"
  comment: string | null
}

interface PurchasePaymentsCardProps {
  purchaseId: string
  currency: string
  total: number
  rateToRub: number | null // курс currency→RUB для отображения эквивалента
  initialPayments: PaymentDraft[]
  canManage: boolean
}

// ── Helpers ────────────────────────────────────────────────────────

const TYPE_LABEL: Record<PaymentDraft["type"], string> = {
  DEPOSIT: "Депозит",
  BALANCE: "Баланс",
}

function formatMoney(n: number): string {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function todayInput(): string {
  return new Date().toISOString().split("T")[0]
}

function isOverdue(p: PaymentDraft): boolean {
  if (p.status === "PAID" || p.paidDate) return false
  if (!p.dueDate) return false
  const due = new Date(p.dueDate)
  if (isNaN(due.getTime())) return false
  return due < new Date()
}

// ── StatusBadge ─────────────────────────────────────────────────────

function StatusBadge({ payment }: { payment: PaymentDraft }) {
  // PaymentStatus: PLANNED grey, PAID emerald, OVERDUE red (live)
  if (payment.status === "PAID" || payment.paidDate) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        Оплачен
      </span>
    )
  }
  if (isOverdue(payment)) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
        Просрочен
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
      Планируется
    </span>
  )
}

// ── Main ───────────────────────────────────────────────────────────

export function PurchasePaymentsCard({
  purchaseId,
  currency,
  total,
  rateToRub,
  initialPayments,
  canManage,
}: PurchasePaymentsCardProps) {
  const router = useRouter()
  const [payments, setPayments] = useState<PaymentDraft[]>(initialPayments)
  const [saving, setSaving] = useState(false)
  const [, startTransition] = useTransition()

  // Карточки группируются DEPOSIT затем BALANCE, по ordinal.
  const ordered = [...payments].sort((a, b) => {
    if (a.type !== b.type) return a.type === "DEPOSIT" ? -1 : 1
    return a.ordinal - b.ordinal
  })

  function updatePayment(idx: number, patch: Partial<PaymentDraft>) {
    setPayments((prev) => {
      // idx относится к ordered → находим реальный по id/референсу
      const target = ordered[idx]
      return prev.map((p) => (p === target ? { ...p, ...patch } : p))
    })
  }

  // LIVE: percent → amount
  function onPercentChange(idx: number, raw: string) {
    const percent = raw === "" ? null : Number(raw)
    if (percent == null || isNaN(percent)) {
      updatePayment(idx, { percent: null })
      return
    }
    updatePayment(idx, {
      percent,
      amount: recomputeAmountFromPercent(total, percent),
    })
  }

  // LIVE: amount → percent
  function onAmountChange(idx: number, raw: string) {
    const amount = raw === "" ? 0 : Number(raw)
    if (isNaN(amount)) return
    updatePayment(idx, {
      amount,
      percent: recomputePercentFromAmount(total, amount),
    })
  }

  function addPayment(type: PaymentDraft["type"]) {
    const sameType = payments.filter((p) => p.type === type)
    const nextOrdinal =
      sameType.length > 0 ? Math.max(...sameType.map((p) => p.ordinal)) + 1 : 1
    setPayments((prev) => [
      ...prev,
      {
        id: null,
        type,
        ordinal: nextOrdinal,
        percent: null,
        amount: 0,
        currency,
        dueDate: todayInput(),
        paidDate: null,
        status: "PLANNED",
        comment: null,
      },
    ])
  }

  function removePayment(idx: number) {
    const target = ordered[idx]
    setPayments((prev) => prev.filter((p) => p !== target))
  }

  async function handleSaveAll() {
    setSaving(true)
    try {
      const result = await savePurchasePayments(
        purchaseId,
        payments.map((p) => ({
          id: p.id ?? null,
          type: p.type,
          ordinal: p.ordinal,
          percent: p.percent ?? null,
          amount: p.amount,
          currency: p.currency,
          dueDate: p.dueDate,
          paidDate: p.paidDate ?? null,
          status: p.status,
          comment: p.comment ?? null,
        }))
      )
      if (result.ok) {
        toast.success("Платежи сохранены")
        router.refresh()
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error("Ошибка сервера")
    } finally {
      setSaving(false)
    }
  }

  function handleMarkPaid(idx: number) {
    const target = ordered[idx]
    if (!target.id) {
      // Не сохранён ещё — помечаем локально, сохранится при «Сохранить».
      updatePayment(idx, { status: "PAID", paidDate: todayInput() })
      toast.info("Отметка применится после сохранения")
      return
    }
    startTransition(async () => {
      try {
        const result = await markPaymentPaid(target.id!, todayInput())
        if (result.ok) {
          toast.success("Платёж отмечен оплаченным")
          router.refresh()
        } else {
          toast.error(result.error)
        }
      } catch {
        toast.error("Ошибка сервера")
      }
    })
  }

  const inputCls =
    "h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Платежи</h3>
        <span className="text-xs text-muted-foreground">
          Итог закупки: {formatMoney(total)} {currency}
        </span>
      </div>

      <div className="space-y-3">
        {ordered.map((p, idx) => {
          const rubEquivalent =
            rateToRub != null && currency !== "RUB" ? p.amount * rateToRub : null
          return (
            <div
              key={p.id ?? `new-${p.type}-${p.ordinal}-${idx}`}
              className="rounded-lg border bg-card p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {TYPE_LABEL[p.type]} {p.ordinal}
                  </span>
                  <StatusBadge payment={p} />
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => removePayment(idx)}
                    className="text-muted-foreground hover:text-destructive text-base leading-none"
                    title="Удалить платёж"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-muted-foreground">Процент, %</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={p.percent ?? ""}
                    onChange={(e) => onPercentChange(idx, e.target.value)}
                    disabled={!canManage}
                    className={`${inputCls} text-right tabular-nums`}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-muted-foreground">
                    Сумма, {currency}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={p.amount}
                    onChange={(e) => onAmountChange(idx, e.target.value)}
                    disabled={!canManage}
                    className={`${inputCls} text-right tabular-nums`}
                  />
                  {rubEquivalent != null && (
                    <span className="text-[11px] text-muted-foreground">
                      ≈ {formatMoney(rubEquivalent)} ₽
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-muted-foreground">Дата платежа</label>
                  <input
                    type="date"
                    value={p.dueDate}
                    onChange={(e) => updatePayment(idx, { dueDate: e.target.value })}
                    disabled={!canManage}
                    className={inputCls}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-muted-foreground">Дата оплаты</label>
                  <input
                    type="date"
                    value={p.paidDate ?? ""}
                    onChange={(e) =>
                      updatePayment(idx, {
                        paidDate: e.target.value || null,
                        status: e.target.value ? "PAID" : "PLANNED",
                      })
                    }
                    disabled={!canManage}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={p.comment ?? ""}
                  onChange={(e) => updatePayment(idx, { comment: e.target.value || null })}
                  placeholder="Комментарий..."
                  disabled={!canManage}
                  className={`${inputCls} flex-1`}
                />
                {canManage && p.status !== "PAID" && !p.paidDate && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleMarkPaid(idx)}
                  >
                    Отметить оплаченным
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {canManage && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addPayment("DEPOSIT")}
          >
            + Добавить депозит
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addPayment("BALANCE")}
          >
            + Добавить баланс
          </Button>
          <Button
            type="button"
            size="sm"
            className="ml-auto"
            onClick={handleSaveAll}
            disabled={saving}
          >
            {saving ? "Сохранение..." : "Сохранить платежи"}
          </Button>
        </div>
      )}
    </div>
  )
}
