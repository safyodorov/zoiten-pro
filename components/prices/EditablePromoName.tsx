// components/prices/EditablePromoName.tsx
// Инлайн-редактирование отображаемого названия акции.
// Клик по иконке карандаша → inline input → Enter/blur сохраняет, Esc отменяет.
// При очистке поля восстанавливается оригинальное имя WB (displayName=null в БД).

"use client"

import { useState, useRef, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Check, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { updateWbPromotionDisplayName } from "@/app/actions/pricing"

interface EditablePromoNameProps {
  promotionId: number
  /** Текущее название (displayName ?? original name). */
  currentLabel: string
  /** Оригинальное имя из WB API — для placeholder при редактировании. */
  originalName?: string
}

export function EditablePromoName({
  promotionId,
  currentLabel,
  originalName,
}: EditablePromoNameProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(currentLabel)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  // Синхронизация value при смене currentLabel снаружи (напр. после sync)
  useEffect(() => {
    if (!editing) setValue(currentLabel)
  }, [currentLabel, editing])

  const commit = (nextValue: string) => {
    const trimmed = nextValue.trim()
    // Если не изменилось — просто выходим из режима редактирования
    if (trimmed === currentLabel) {
      setEditing(false)
      return
    }
    startTransition(async () => {
      const result = await updateWbPromotionDisplayName(
        promotionId,
        trimmed.length === 0 ? null : trimmed,
      )
      if (result.ok) {
        toast.success(
          trimmed.length === 0
            ? "Восстановлено оригинальное название"
            : "Название акции сохранено",
        )
        setEditing(false)
        router.refresh()
      } else {
        toast.error(result.error || "Не удалось сохранить")
      }
    })
  }

  const cancel = () => {
    setValue(currentLabel)
    setEditing(false)
  }

  if (editing) {
    return (
      <span
        className="inline-flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              commit(value)
            } else if (e.key === "Escape") {
              e.preventDefault()
              cancel()
            }
          }}
          onBlur={() => commit(value)}
          placeholder={originalName ?? "Название"}
          disabled={isPending}
          className="text-sm h-6 px-1.5 rounded border border-input bg-background focus:border-primary focus:outline-none min-w-[180px]"
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()} // чтобы не сработал blur→commit раньше
          onClick={() => commit(value)}
          disabled={isPending}
          className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-muted text-primary"
          title="Сохранить"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={cancel}
          disabled={isPending}
          className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-muted text-muted-foreground"
          title="Отмена"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 group/edit">
      <span>{currentLabel}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setEditing(true)
        }}
        className={cn(
          "inline-flex items-center justify-center h-5 w-5 rounded",
          "opacity-0 group-hover/edit:opacity-100 hover:bg-muted text-muted-foreground hover:text-primary",
          "transition-opacity",
        )}
        title="Переименовать акцию"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </span>
  )
}
