"use client"

// components/cash/CashEntryForm.tsx
// Phase 23 (23-04): Диалог кассовой операции — CREATE и EDIT режимы.
// CREATE: кнопка «Добавить операцию» + createCashEntry.
// EDIT:   controlled open/onOpenChange + entry prop → updateCashEntry + deleteCashEntry.
// CLAUDE.md: native <select>, base-ui Dialog (render={...} NOT asChild), sonner toast.

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
import { createCashEntry, updateCashEntry, deleteCashEntry } from "@/app/actions/cash"
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

/** Минимальный набор полей для предзаполнения формы редактирования. */
export interface CashEntryEditData {
  id: string
  date: string                       // YYYY-MM-DD
  direction: string                  // "INCOME" | "EXPENSE"
  amount: number
  department: string | null
  categoryId: string | null
  purpose: string
  responsibleEmployeeId: string | null
  comment: string | null
}

interface CashEntryFormBaseProps {
  categories: CategoryOption[]
  employees: EmployeeOption[]
  departments: string[]
}

// ── Props для CREATE (без entry — неуправляемый режим) ─────────────────────

interface CashEntryFormCreateProps extends CashEntryFormBaseProps {
  entry?: undefined
  open?: undefined
  onOpenChange?: undefined
}

// ── Props для EDIT (управляемый режим с entry) ─────────────────────────────

interface CashEntryFormEditProps extends CashEntryFormBaseProps {
  entry: CashEntryEditData
  open: boolean
  onOpenChange: (open: boolean) => void
}

type CashEntryFormProps = CashEntryFormCreateProps | CashEntryFormEditProps

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

// ── Shared CSS ─────────────────────────────────────────────────────────────

const selectCls =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
const inputCls =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
const textareaCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"

// ── Inner form (shared between create and edit) ────────────────────────────

interface InnerFormProps {
  isEditMode: boolean
  categories: CategoryOption[]
  employees: EmployeeOption[]
  departments: string[]
  // field state
  date: string
  setDate: (v: string) => void
  direction: string
  setDirection: (v: string) => void
  amount: string
  setAmount: (v: string) => void
  department: string
  setDepartment: (v: string) => void
  categoryId: string
  setCategoryId: (v: string) => void
  purpose: string
  setPurpose: (v: string) => void
  responsibleEmployeeId: string
  setResponsibleEmployeeId: (v: string) => void
  comment: string
  setComment: (v: string) => void
  isValid: boolean
  isPending: boolean
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  onDelete?: () => void
}

function CashEntryInnerForm({
  isEditMode,
  categories,
  employees,
  departments,
  date, setDate,
  direction, setDirection,
  amount, setAmount,
  department, setDepartment,
  categoryId, setCategoryId,
  purpose, setPurpose,
  responsibleEmployeeId, setResponsibleEmployeeId,
  comment, setComment,
  isValid,
  isPending,
  onSubmit,
  onCancel,
  onDelete,
}: InnerFormProps) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 pt-2">
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

      {/* Ответственный */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cash-responsible">Ответственный</Label>
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
      <div className="flex items-center gap-2 pt-1">
        {/* Удалить — только в EDIT режиме, слева */}
        {isEditMode && onDelete && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onDelete}
            disabled={isPending}
          >
            Удалить
          </Button>
        )}
        <div className="flex-1" />
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isPending}
        >
          Отмена
        </Button>
        <Button type="submit" disabled={!isValid || isPending}>
          {isEditMode ? "Сохранить" : "Добавить"}
        </Button>
      </div>
    </form>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function CashEntryForm(props: CashEntryFormProps) {
  const { categories, employees, departments } = props
  const isEditMode = props.entry !== undefined

  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Управление диалогом:
  // - CREATE: внутренний uncontrolled open state
  // - EDIT: controlled через props.open / props.onOpenChange
  const [internalOpen, setInternalOpen] = useState(false)
  const dialogOpen = isEditMode ? (props as CashEntryFormEditProps).open : internalOpen
  const setDialogOpen = isEditMode
    ? (props as CashEntryFormEditProps).onOpenChange
    : setInternalOpen

  // Дефолтные значения зависят от режима
  const ivanovaId = findIvanovaId(employees)
  const entry = isEditMode ? (props as CashEntryFormEditProps).entry : undefined

  const [date, setDate] = useState(() =>
    entry ? entry.date : todayIso()
  )
  const [direction, setDirection] = useState(() =>
    entry ? entry.direction : "EXPENSE"
  )
  const [amount, setAmount] = useState(() =>
    entry ? String(entry.amount) : ""
  )
  const [department, setDepartment] = useState(() =>
    entry ? (entry.department ?? "") : ""
  )
  const [categoryId, setCategoryId] = useState(() =>
    entry ? (entry.categoryId ?? "") : ""
  )
  const [purpose, setPurpose] = useState(() =>
    entry ? entry.purpose : ""
  )
  const [responsibleEmployeeId, setResponsibleEmployeeId] = useState(() =>
    entry ? (entry.responsibleEmployeeId ?? "") : ivanovaId
  )
  const [comment, setComment] = useState(() =>
    entry ? (entry.comment ?? "") : ""
  )

  // При открытии/закрытии диалога в CREATE-режиме — сброс полей
  function handleOpenChange(open: boolean) {
    setDialogOpen(open)
    if (!open && !isEditMode) {
      resetCreateFields()
    }
  }

  function resetCreateFields() {
    setDate(todayIso())
    setDirection("EXPENSE")
    setAmount("")
    setDepartment("")
    setCategoryId("")
    setPurpose("")
    setResponsibleEmployeeId(ivanovaId)
    setComment("")
  }

  // При открытии диалога EDIT — синхронизировать поля с entry (controlled из родителя)
  // Это обрабатывается через key в родительском компоненте (см. CashTable)

  const isValid = amount !== "" && Number(amount) > 0 && purpose.trim().length > 0

  // ── Submit ──────────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid) return

    const payload = {
      date,
      direction: direction as "INCOME" | "EXPENSE",
      amount: Number(amount),
      department: department || null,
      categoryId: categoryId || null,
      purpose: purpose.trim(),
      responsibleEmployeeId: responsibleEmployeeId || null,
      comment: comment.trim() || null,
    }

    startTransition(async () => {
      if (isEditMode && entry) {
        const result = await updateCashEntry({ id: entry.id, ...payload })
        if (result.ok) {
          toast.success("Операция сохранена")
          setDialogOpen(false)
          router.refresh()
        } else {
          toast.error(result.error)
        }
      } else {
        const result = await createCashEntry(payload)
        if (result.ok) {
          toast.success("Операция добавлена")
          setDialogOpen(false)
          resetCreateFields()
          router.refresh()
        } else {
          toast.error(result.error)
        }
      }
    })
  }

  // ── Delete ──────────────────────────────────────────────────────────────

  function handleDelete() {
    if (!entry) return
    if (!window.confirm("Удалить операцию? Действие нельзя отменить.")) return

    startTransition(async () => {
      const result = await deleteCashEntry(entry.id)
      if (result.ok) {
        toast.success("Операция удалена")
        setDialogOpen(false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const innerForm = (
    <CashEntryInnerForm
      isEditMode={isEditMode}
      categories={categories}
      employees={employees}
      departments={departments}
      date={date} setDate={setDate}
      direction={direction} setDirection={setDirection}
      amount={amount} setAmount={setAmount}
      department={department} setDepartment={setDepartment}
      categoryId={categoryId} setCategoryId={setCategoryId}
      purpose={purpose} setPurpose={setPurpose}
      responsibleEmployeeId={responsibleEmployeeId}
      setResponsibleEmployeeId={setResponsibleEmployeeId}
      comment={comment} setComment={setComment}
      isValid={isValid}
      isPending={isPending}
      onSubmit={handleSubmit}
      onCancel={() => setDialogOpen(false)}
      onDelete={isEditMode ? handleDelete : undefined}
    />
  )

  if (isEditMode) {
    // Controlled dialog — нет DialogTrigger
    return (
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Редактировать операцию</DialogTitle>
          </DialogHeader>
          {innerForm}
        </DialogContent>
      </Dialog>
    )
  }

  // Uncontrolled CREATE dialog
  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
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
        {innerForm}
      </DialogContent>
    </Dialog>
  )
}
