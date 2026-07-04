"use client"

// components/sales-plan/FixPlanVersionDialog.tsx
// Модалка фиксации плана в immutable-снапшот.
// Образец: components/procurement/PurchaseModal.tsx
// Phase 25 wave 7 (25-08)

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useState, useTransition, useRef } from "react"
import { toast } from "sonner"
import { fixSalesPlanVersion } from "@/app/actions/sales-plan"
import { X } from "lucide-react"

// ── Props ─────────────────────────────────────────────────────────────────────

interface FixPlanVersionDialogProps {
  open: boolean
  onClose: () => void
  /** Количество активных VP (для сводки) */
  vpCount: number
  /** Количество товаров (для сводки) */
  productCount: number
  /** Горизонт (строка) */
  horizon: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMskTodayLabel(): string {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000)
  const dd = String(d.getUTCDate()).padStart(2, "0")
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  const yyyy = String(d.getUTCFullYear())
  return `${dd}.${mm}.${yyyy}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FixPlanVersionDialog({
  open,
  onClose,
  vpCount,
  productCount,
  horizon,
}: FixPlanVersionDialogProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const todayLabel = getMskTodayLabel()
  const [label, setLabel] = useState(`План от ${todayLabel}`)
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)

  function handleClose() {
    if (!isPending) {
      setError(null)
      onClose()
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = await fixSalesPlanVersion({
        label: label.trim() || undefined,
        note: note.trim() || undefined,
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      toast.success("План зафиксирован", {
        description: label.trim() || `План от ${todayLabel}`,
      })

      // Редирект на ?version=<newId>
      const params = new URLSearchParams(searchParams.toString())
      params.set("version", result.versionId)
      // Убираем mode=edit при переходе на read-only версию
      params.delete("mode")
      router.push(`${pathname}?${params.toString()}`)

      onClose()
    })
  }

  if (!open) return null

  return (
    // Overlay
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      {/* Dialog */}
      <div className="relative bg-background rounded-lg shadow-lg w-full max-w-md mx-4 p-6 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Зафиксировать план</h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={isPending}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        {/* Сводка «что фиксируется» */}
        <div className="rounded bg-muted/50 px-3 py-2 text-sm text-muted-foreground space-y-1">
          <div>Горизонт: <strong>{horizon}</strong></div>
          {productCount > 0 && (
            <div>Товаров: <strong>{productCount}</strong></div>
          )}
          {vpCount > 0 && (
            <div>Активных виртуальных закупок: <strong>{vpCount}</strong></div>
          )}
          <div className="pt-1 text-xs text-amber-700 dark:text-amber-400">
            Прошлые дни (до сегодня) будут скопированы из текущей активной версии.
            Будущий план — снапшот текущего черновика.
          </div>
        </div>

        {/* Форма */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Название */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="fix-plan-label">
              Название версии
            </label>
            <input
              id="fix-plan-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`План от ${todayLabel}`}
              disabled={isPending}
              className="border rounded px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
            />
          </div>

          {/* Примечание */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="fix-plan-note">
              Примечание (необязательно)
            </label>
            <textarea
              id="fix-plan-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Что поменялось, почему фиксируем..."
              disabled={isPending}
              className="border rounded px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60 resize-none"
            />
          </div>

          {/* Ошибка */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Кнопки */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
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
              {isPending ? "Фиксирую..." : "Зафиксировать"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
