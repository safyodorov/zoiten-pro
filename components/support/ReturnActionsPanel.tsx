"use client"

// Phase 9 — Sticky-панель внизу центральной колонки диалога для канала RETURN.
// Рендерится вместо ReplyPanel (см. app/(dashboard)/support/[ticketId]/page.tsx).
// Логика кнопок зависит от ticket.returnState + ticket.wbActions (свежие от WB sync):
//   PENDING  → [Одобрить, Отклонить]  (enabled если соответствующий wbAction есть)
//   REJECTED → [Пересмотреть]         (enabled если "approve1" в wbActions)
//   APPROVED → readonly сообщение
// Модалка Отклонить: textarea 10..1000 символов с live counter + zod на клиенте и сервере.

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  approveReturn,
  rejectReturn,
  reconsiderReturn,
} from "@/app/actions/support"
import type { ReturnState } from "@prisma/client"

export interface ReturnActionsPanelProps {
  ticketId: string
  returnState: ReturnState | null
  wbActions: string[]
}

export function ReturnActionsPanel({
  ticketId,
  returnState,
  wbActions,
}: ReturnActionsPanelProps) {
  const [isPending, startTransition] = useTransition()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState("")

  const canApprove =
    returnState === "PENDING" &&
    (wbActions.includes("approve1") ||
      wbActions.includes("autorefund1") ||
      wbActions.includes("approvecc1"))
  const canReject =
    returnState === "PENDING" && wbActions.includes("rejectcustom")
  const canReconsider =
    returnState === "REJECTED" && wbActions.includes("approve1")

  const trimmedLen = reason.trim().length
  const reasonValid = trimmedLen >= 10 && trimmedLen <= 1000

  const handleApprove = () => {
    if (!confirm("Одобрить возврат? Действие необратимо.")) return
    const id = toast.loading("Отправка решения в WB...")
    startTransition(async () => {
      const res = await approveReturn(ticketId)
      if (res.ok) toast.success("Возврат одобрен", { id })
      else toast.error(res.error, { id })
    })
  }

  const handleReject = () => {
    if (!reasonValid) {
      toast.error("Причина должна быть от 10 до 1000 символов")
      return
    }
    const id = toast.loading("Отправка отклонения в WB...")
    startTransition(async () => {
      const res = await rejectReturn(ticketId, reason.trim())
      if (res.ok) {
        toast.success("Возврат отклонён", { id })
        setRejectOpen(false)
        setReason("")
      } else {
        toast.error(res.error, { id })
      }
    })
  }

  const handleReconsider = () => {
    if (!confirm("Пересмотреть отклонённое решение и одобрить возврат?")) return
    const id = toast.loading("Отправка пересмотра в WB...")
    startTransition(async () => {
      const res = await reconsiderReturn(ticketId)
      if (res.ok) toast.success("Возврат одобрен (пересмотрено)", { id })
      else toast.error(res.error, { id })
    })
  }

  if (returnState === "APPROVED") {
    return (
      <div className="sticky bottom-0 border-t bg-background p-3 text-sm text-muted-foreground text-center">
        Возврат одобрен — действия завершены
      </div>
    )
  }

  return (
    <>
      <div className="sticky bottom-0 bg-white dark:bg-neutral-900 border-t p-3 flex items-center gap-2">
        {returnState === "PENDING" && (
          <>
            <Button
              onClick={handleApprove}
              disabled={!canApprove || isPending}
            >
              Одобрить
            </Button>
            <Button
              variant="destructive"
              onClick={() => setRejectOpen(true)}
              disabled={!canReject || isPending}
            >
              Отклонить
            </Button>
          </>
        )}
        {returnState === "REJECTED" && (
          <Button
            onClick={handleReconsider}
            disabled={!canReconsider || isPending}
          >
            Пересмотреть
          </Button>
        )}
        {!canApprove && !canReject && !canReconsider && (
          <span className="text-xs text-muted-foreground">
            WB не предоставляет доступных действий для этой заявки
          </span>
        )}
        <a
          href="https://seller.wildberries.ru/suppliers-product-verification/customer-claims/under-consideration"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border hover:bg-accent transition-colors"
          title="Открыть раздел «Возвраты покупателей» в кабинете WB — начните чат кнопкой на заявке; новый чат автоматически появится у нас через 5 минут"
        >
          Открыть в WB →
        </a>
      </div>

      {rejectOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => !isPending && setRejectOpen(false)}
        >
          <div
            className="bg-background rounded-lg p-6 w-full max-w-md space-y-3 border shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">Отклонить возврат</h2>
            <p className="text-sm text-muted-foreground">
              Укажите причину (от 10 до 1000 символов). Покупатель увидит этот
              текст в своём кабинете WB.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={6}
              maxLength={1000}
              className="w-full border rounded p-2 text-sm bg-background resize-none"
              placeholder="Причина отклонения..."
              disabled={isPending}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {trimmedLen}/1000
              </span>
              <span>
                {trimmedLen < 10
                  ? `Нужно ещё ${10 - trimmedLen} символов`
                  : "ОК"}
              </span>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setRejectOpen(false)}
                disabled={isPending}
              >
                Отмена
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={isPending || !reasonValid}
              >
                Отклонить
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
