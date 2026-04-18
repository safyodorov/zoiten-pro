"use client"

// components/support/AppealModal.tsx
// Модалка создания обжалования отзыва (Phase 11 Plan 04).
// WB API POST /api/v1/feedbacks/actions отключён 2025-12-08 — hybrid manual:
// 1. Создаём локальный AppealRecord через createAppeal
// 2. Открываем новую вкладку seller.wildberries.ru (deep-link если есть wbExternalId)
// 3. Менеджер подаёт жалобу вручную в ЛК WB
// 4. Позже вручную переключает статус через AppealStatusPanel

import { useState, useTransition } from "react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { createAppeal } from "@/app/actions/appeals"
import { APPEAL_REASONS } from "@/lib/appeal-reasons"

export interface AppealModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  ticketId: string
  wbExternalId: string | null
}

type ReasonOrEmpty = (typeof APPEAL_REASONS)[number] | ""

export function AppealModal({
  open,
  onOpenChange,
  ticketId,
  wbExternalId,
}: AppealModalProps) {
  const [reason, setReason] = useState<ReasonOrEmpty>("")
  const [text, setText] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    if (!reason) {
      toast.error("Выберите причину")
      return
    }
    const trimmed = text.trim()
    if (trimmed.length < 10) {
      toast.error("Текст должен содержать минимум 10 символов")
      return
    }
    if (trimmed.length > 1000) {
      toast.error("Текст должен быть не длиннее 1000 символов")
      return
    }

    startTransition(async () => {
      const res = await createAppeal({
        ticketId,
        reason,
        text: trimmed,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(
        "Запись обжалования создана. Откройте ЛК WB и подайте жалобу вручную."
      )
      // Jump-link на ЛК WB (deep-link если есть wbExternalId, иначе общая страница)
      const wbUrl = wbExternalId
        ? `https://seller.wildberries.ru/feedbacks-and-questions/all-feedbacks?feedback=${wbExternalId}`
        : "https://seller.wildberries.ru/feedbacks-and-questions/"
      window.open(wbUrl, "_blank", "noopener,noreferrer")

      onOpenChange(false)
      setReason("")
      setText("")
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Обжаловать отзыв</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="block text-sm font-medium mb-1">
              Причина обжалования
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as ReasonOrEmpty)}
              disabled={isPending}
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            >
              <option value="">— Выберите причину —</option>
              {APPEAL_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Комментарий{" "}
              <span className="text-xs text-muted-foreground">
                ({text.length}/1000, минимум 10)
              </span>
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Опишите причину обжалования подробно (10–1000 символов)..."
              maxLength={1000}
              rows={5}
              disabled={isPending}
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm resize-none"
            />
          </div>

          <div className="rounded-md border border-orange-300 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/20 p-3 text-sm space-y-1">
            <p className="font-medium">Важно</p>
            <p className="text-xs">
              WB API обжалований отключён с 08.12.2025. После сохранения
              записи:
            </p>
            <ol className="list-decimal pl-5 text-xs space-y-0.5">
              <li>Откроется ЛК Wildberries в новой вкладке.</li>
              <li>
                Найдите отзыв и нажмите «Пожаловаться на отзыв».
              </li>
              <li>Укажите ту же причину и текст.</li>
              <li>
                Когда WB ответит — обновите статус в карточке тикета (🕐 →
                ✅ или ❌).
              </li>
            </ol>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Отмена
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !reason || text.trim().length < 10}
          >
            {isPending ? "Сохранение..." : "Создать запись и открыть WB"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
