"use client"

// components/sales-plan/EditPlanVersionDialog.tsx
// Редактирование названия и комментария сохранённой версии плана (метаданные).
// Монтируется по требованию (key = versionId), поэтому поля инициализируются заново.
// fast-260707d

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { X } from "lucide-react"
import { updateSalesPlanVersionMeta } from "@/app/actions/sales-plan"

interface Props {
  versionId: string
  initialLabel: string
  initialNote: string | null
  onClose: () => void
}

export function EditPlanVersionDialog({ versionId, initialLabel, initialNote, onClose }: Props) {
  const router = useRouter()
  const [isPending, start] = useTransition()
  const [label, setLabel] = useState(initialLabel)
  const [note, setNote] = useState(initialNote ?? "")
  const [error, setError] = useState<string | null>(null)

  function close() {
    if (!isPending) onClose()
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!label.trim()) {
      setError("Название не может быть пустым")
      return
    }
    start(async () => {
      const r = await updateSalesPlanVersionMeta({
        id: versionId,
        label: label.trim(),
        note: note.trim() || null,
      })
      if (!r.ok) {
        setError(r.error)
        return
      }
      toast.success("Сохранено")
      router.refresh()
      onClose()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <div className="relative bg-background rounded-lg shadow-lg w-full max-w-md mx-4 p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Изменить план</h2>
          <button
            type="button"
            onClick={close}
            disabled={isPending}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="edit-plan-label">Название</label>
            <input
              id="edit-plan-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={isPending}
              className="border rounded px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="edit-plan-note">Комментарий</label>
            <textarea
              id="edit-plan-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Что за план, что поменялось…"
              disabled={isPending}
              className="border rounded px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60 resize-none"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={close}
              disabled={isPending}
              className="px-4 py-2 text-sm rounded border hover:bg-muted transition-colors disabled:opacity-60"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {isPending ? "Сохраняю…" : "Сохранить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
