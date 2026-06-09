"use client"

import { useState, useTransition } from "react"
import { Pencil, Trash2, Plus, Check, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { SortableList, SortableItem } from "@/components/settings/SortableList"
import {
  createLender,
  updateLender,
  deleteLender,
  reorderLenders,
} from "@/app/actions/lender"

// ── Types ─────────────────────────────────────────────────────────

interface LenderRow {
  id: string
  name: string
  sortOrder: number
}

interface LendersTabProps {
  lenders: LenderRow[]
}

// ── LenderItem — single lender with inline editing ───────────────

function LenderItem({ lender }: { lender: LenderRow }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(lender.name)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    const trimmed = value.trim()
    if (!trimmed) return
    startTransition(async () => {
      const result = await updateLender(lender.id, trimmed)
      if (result.ok) {
        toast.success("Сохранено")
        setEditing(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleDelete() {
    if (!confirm(`Удалить кредитора "${lender.name}"?`)) return
    startTransition(async () => {
      const result = await deleteLender(lender.id)
      if (result.ok) {
        toast.success("Кредитор удалён")
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleCancel() {
    setValue(lender.name)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-2 border-b last:border-b-0">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave()
            if (e.key === "Escape") handleCancel()
          }}
          className="h-7 flex-1"
          autoFocus
          disabled={isPending}
        />
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={handleSave}
          disabled={isPending}
          aria-label="Сохранить"
        >
          <Check className="size-3.5" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={handleCancel}
          disabled={isPending}
          aria-label="Отмена"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 py-2 border-b last:border-b-0 group">
      <span className="flex-1 text-sm">{lender.name}</span>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={() => setEditing(true)}
        disabled={isPending}
        aria-label="Редактировать"
        className="opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Pencil className="size-3.5" />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={handleDelete}
        disabled={isPending}
        aria-label="Удалить"
        className={cn(
          "opacity-0 group-hover:opacity-100 transition-opacity",
          "text-destructive hover:text-destructive"
        )}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}

// ── AddLenderRow — input row for creating a new lender ───────────

function AddLenderRow() {
  const [value, setValue] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    const trimmed = value.trim()
    if (!trimmed) return
    startTransition(async () => {
      const result = await createLender(trimmed)
      if (result.ok) {
        toast.success("Кредитор добавлен")
        setValue("")
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="flex items-center gap-2 pt-3">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAdd()
        }}
        placeholder="Новый кредитор…"
        className="h-7 flex-1"
        disabled={isPending}
      />
      <Button
        size="icon-sm"
        variant="outline"
        onClick={handleAdd}
        disabled={isPending || !value.trim()}
        aria-label="Добавить кредитора"
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  )
}

// ── LendersTab ────────────────────────────────────────────────────

export function LendersTab({ lenders }: LendersTabProps) {
  function handleReorder(ids: string[]) {
    reorderLenders(ids).then((r) => {
      if (!r.ok) toast.error(r.error)
    })
  }

  return (
    <div className="max-w-md">
      <div className="border rounded-lg px-4 py-2">
        <SortableList items={lenders} onReorder={handleReorder}>
          {lenders.map((lender) => (
            <SortableItem key={lender.id} id={lender.id}>
              <LenderItem lender={lender} />
            </SortableItem>
          ))}
        </SortableList>
        {lenders.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">Кредиторы не найдены</p>
        )}
      </div>
      <AddLenderRow />
    </div>
  )
}
