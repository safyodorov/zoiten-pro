"use client"

// components/cash/CashEntryForm.tsx
// Phase 23 (23-04): Диалог удобного ручного добавления кассовой операции.
// ПРИОРИТЕТ фазы — «удобно добавлять».
// 8 полей: дата (сегодня), направление (Расход default), сумма,
//          подразделение, категория, назначение, ответственный (Иванова default),
//          комментарий.
// CLAUDE.md: native <select>, shadcn Dialog, sonner toast.

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { createCashEntry } from "@/app/actions/cash"
import { DIRECTION_OPTIONS } from "@/lib/cash-labels"

// ── Types ──────────────────────────────────────────────────────────────────

interface CategoryOption {
  id: string
  name: string
}

interface EmployeeOption {
  id: string
  lastName: string
  firstName: string
}

interface CashEntryFormProps {
  categories: CategoryOption[]
  employees: EmployeeOption[]
  departments: string[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Найти Иванову по lastName, вернуть id или "" */
function findIvanovaId(employees: EmployeeOption[]): string {
  const match = employees.find(
    (e) => e.lastName.toLowerCase() === "иванова",
  )
  return match?.id ?? (employees[0]?.id ?? "")
}

// ── Main component ─────────────────────────────────────────────────────────

export function CashEntryForm({ categories, employees, departments }: CashEntryFormProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()

  // ── Состояние полей формы ─────────────────────────────────────────────
  const ivanovaId = findIvanovaId(employees)

  const [date, setDate] = useState(todayIso)
  const [direction, setDirection] = useState("EXPENSE")
  const [amount, setAmount] = useState("")
  const [department, setDepartment] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [purpose, setPurpose] = useState("")
  // default ответственный = Иванова (или первый/пусто если нет)
  const [responsibleEmployeeId, setResponsibleEmployeeId] = useState(ivanovaId)
  const [comment, setComment] = useState("")

  function resetForm() {
    setDate(todayIso())
    setDirection("EXPENSE")
    setAmount("")
    setDepartment("")
    setCategoryId("")
    setPurpose("")
    setResponsibleEmployeeId(ivanovaId)
    setComment("")
  }

  const isValid = amount !== "" && Number(amount) > 0 && purpose.trim().length > 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid) return

    startTransition(async () => {
      const result = await createCashEntry({
        date,
        direction: direction as "INCOME" | "EXPENSE",
        amount: Number(amount),
        department: department || null,
        categoryId: categoryId || null,
        purpose: purpose.trim(),
        responsibleEmployeeId: responsibleEmployeeId || null,
        comment: comment.trim() || null,
      })

      if (result.ok) {
        toast.success("Операция добавлена")
        setOpen(false)
        resetForm()
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const selectCls =
    "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
  const inputCls =
    "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
  const textareaCls =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="default" size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Добавить операцию
          </Button>
        }
      />

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Новая кассовая операция</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
          {/* Ряд: Дата + Направление */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cash-date">Дата</Label>
              <input
                id="cash-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputCls}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cash-direction">Направление</Label>
              {/* native <select> — CLAUDE.md */}
              <select
                id="cash-direction"
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
                className={selectCls}
              >
                {DIRECTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Сумма */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cash-amount">Сумма, ₽</Label>
            <input
              id="cash-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={inputCls}
              required
            />
          </div>

          {/* Ряд: Подразделение + Категория */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cash-department">Подразделение</Label>
              {/* native <select> с заранее известными значениями + прочие из БД */}
              <select
                id="cash-department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className={selectCls}
              >
                <option value="">—</option>
                {/* Приоритетные фиксированные значения */}
                {["офис", "склад", "маркетинг", "такси"].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
                {/* Дополнительные из БД (если не пересекаются) */}
                {departments
                  .filter((d) => !["офис", "склад", "маркетинг", "такси"].includes(d))
                  .map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cash-category">Категория</Label>
              <select
                id="cash-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={selectCls}
              >
                <option value="">Без категории</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Назначение — обязательное */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cash-purpose">
              Назначение <span className="text-destructive">*</span>
            </Label>
            <textarea
              id="cash-purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Укажите назначение платежа"
              rows={2}
              className={textareaCls}
              required
            />
          </div>

          {/* Ответственный — default Иванова */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cash-responsible">Ответственный</Label>
            {/* Иванова preselect: findIvanovaId выставляет её id как default */}
            <select
              id="cash-responsible"
              value={responsibleEmployeeId}
              onChange={(e) => setResponsibleEmployeeId(e.target.value)}
              className={selectCls}
            >
              <option value="">—</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.lastName} {emp.firstName}
                </option>
              ))}
            </select>
          </div>

          {/* Комментарий — опционально */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cash-comment">Комментарий</Label>
            <textarea
              id="cash-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Необязательно"
              rows={2}
              className={textareaCls}
            />
          </div>

          {/* Кнопки */}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false)
                resetForm()
              }}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={!isValid}>
              Добавить
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
