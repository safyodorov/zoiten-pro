"use client"

// components/finance/ManualAdjustmentsModal.tsx
// Phase 24 Plan 24-08 — CRUD ручных корректировочных статей баланса (D-08).
// Правка суммы/типа/даты существующей статьи ВЕРСИОНИРУЕТ на сервере (m8) — старая версия
// закрывается deletedAt=новый effectiveFrom, создаётся новая; прошлые балансы не переписываются.
// CLAUDE.md: native <select>, base-ui Dialog (render={...} NOT asChild), sonner toast.

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Pencil, Plus, Trash2, WalletCards } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  saveFinanceAdjustment,
  deleteFinanceAdjustment,
} from "@/app/actions/finance-balance"

// ── Types ──────────────────────────────────────────────────────────────────

export interface ManualAdjustmentRow {
  id: string
  label: string
  type: "ASSET" | "LIABILITY"
  amountRub: number
  effectiveFrom: string // YYYY-MM-DD
  comment: string | null
}

interface ManualAdjustmentsModalProps {
  adjustments: ManualAdjustmentRow[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

const rubFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 })

function fmtRub(n: number): string {
  return `${rubFmt.format(n)} ₽`
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const selectCls =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
const inputCls =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
const textareaCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"

// ── Main component ─────────────────────────────────────────────────────────

export function ManualAdjustmentsModal({ adjustments }: ManualAdjustmentsModalProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [open, setOpen] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [label, setLabel] = useState("")
  const [type, setType] = useState<"ASSET" | "LIABILITY">("ASSET")
  const [amountRub, setAmountRub] = useState("")
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso())
  const [comment, setComment] = useState("")

  function resetForm() {
    setEditingId(null)
    setLabel("")
    setType("ASSET")
    setAmountRub("")
    setEffectiveFrom(todayIso())
    setComment("")
    setShowForm(false)
  }

  function handleAddClick() {
    resetForm()
    setShowForm(true)
  }

  function handleEditClick(row: ManualAdjustmentRow) {
    setEditingId(row.id)
    setLabel(row.label)
    setType(row.type)
    setAmountRub(String(row.amountRub))
    setEffectiveFrom(row.effectiveFrom)
    setComment(row.comment ?? "")
    setShowForm(true)
  }

  const isValid =
    label.trim().length > 0 &&
    amountRub !== "" &&
    !Number.isNaN(Number(amountRub)) &&
    DATE_RE.test(effectiveFrom)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid) return

    const payload = {
      id: editingId ?? undefined,
      label: label.trim(),
      type,
      amountRub: Number(amountRub),
      effectiveFrom,
      comment: comment.trim() || null,
    }

    startTransition(async () => {
      const result = await saveFinanceAdjustment(payload)
      if (result.ok) {
        toast.success(editingId ? "Статья версионирована" : "Статья добавлена")
        resetForm()
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleDelete(id: string) {
    if (!window.confirm("Снять статью с баланса? Она перестанет учитываться начиная с сегодняшней даты.")) return
    startTransition(async () => {
      const result = await deleteFinanceAdjustment(id)
      if (result.ok) {
        toast.success("Статья снята")
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <WalletCards className="h-3.5 w-3.5" />
            Ручные статьи
          </Button>
        }
      />

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ручные корректировочные статьи</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {adjustments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет ручных статей.</p>
          ) : (
            <div className="rounded-md border divide-y">
              {adjustments.map((row) => (
                <div key={row.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <Badge variant={row.type === "ASSET" ? "default" : "secondary"}>
                    {row.type === "ASSET" ? "Актив" : "Пассив"}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{row.label}</div>
                    <div className="text-xs text-muted-foreground">
                      с {row.effectiveFrom}
                      {row.comment ? ` — ${row.comment}` : ""}
                    </div>
                  </div>
                  <div className="tabular-nums whitespace-nowrap font-medium">{fmtRub(row.amountRub)}</div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleEditClick(row)}
                    disabled={isPending}
                    title="Редактировать"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDelete(row.id)}
                    disabled={isPending}
                    title="Удалить"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {!showForm && (
            <Button type="button" variant="outline" size="sm" className="gap-1.5 self-start" onClick={handleAddClick}>
              <Plus className="h-3.5 w-3.5" />
              Добавить статью
            </Button>
          )}

          {showForm && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-md border p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="adj-label">Название</Label>
                  <input
                    id="adj-label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Например, Займы выданные"
                    className={inputCls}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="adj-type">Тип</Label>
                  {/* native <select> — CLAUDE.md */}
                  <select
                    id="adj-type"
                    value={type}
                    onChange={(e) => setType(e.target.value as "ASSET" | "LIABILITY")}
                    className={selectCls}
                  >
                    <option value="ASSET">Актив</option>
                    <option value="LIABILITY">Пассив</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="adj-amount">Сумма, ₽</Label>
                  <input
                    id="adj-amount"
                    type="number"
                    step="0.01"
                    value={amountRub}
                    onChange={(e) => setAmountRub(e.target.value)}
                    placeholder="0.00"
                    className={inputCls}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="adj-effective-from">Действует с</Label>
                  <input
                    id="adj-effective-from"
                    type="date"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    className={inputCls}
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="adj-comment">Комментарий</Label>
                <textarea
                  id="adj-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Необязательно"
                  rows={2}
                  className={textareaCls}
                />
              </div>

              {editingId && (
                <p className="text-xs text-muted-foreground">
                  Изменение суммы/типа/даты создаст новую версию статьи с указанной даты — прошлые
                  значения баланса не изменятся (m8).
                </p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <div className="flex-1" />
                <Button type="button" variant="outline" onClick={resetForm} disabled={isPending}>
                  Отмена
                </Button>
                <Button type="submit" disabled={!isValid || isPending}>
                  {editingId ? "Сохранить" : "Добавить"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
