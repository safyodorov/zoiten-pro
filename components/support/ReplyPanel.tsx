"use client"

// components/support/ReplyPanel.tsx
// Ответ на тикет (FEEDBACK/QUESTION). Phase 11 Plan 03: кнопка «Шаблон»
// → TemplatePickerModal (substituteTemplateVars подставляет customerName/productName).
// Phase 11 Plan 04: кнопка «Обжаловать» для FEEDBACK (status !== APPEALED)
// → AppealModal → createAppeal + jump-link в ЛК WB.

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Send, FileText, Flag } from "lucide-react"
import { toast } from "sonner"
import { replyToTicket } from "@/app/actions/support"
import { TemplatePickerModal } from "@/components/support/templates/TemplatePickerModal"
import { AppealModal } from "@/components/support/AppealModal"
import type { ResponseTemplate } from "@prisma/client"

export function ReplyPanel({
  ticketId,
  ticketNmId,
  ticketChannel,
  ticketStatus,
  wbExternalId,
  customerName,
  productName,
  templates,
  disabled,
}: {
  ticketId: string
  ticketNmId: number | null
  ticketChannel: "FEEDBACK" | "QUESTION" | "CHAT"
  ticketStatus?: string
  wbExternalId?: string | null
  customerName: string | null
  productName: string | null
  templates: ResponseTemplate[]
  disabled?: boolean
}) {
  const [text, setText] = useState("")
  const [pickerOpen, setPickerOpen] = useState(false)
  const [appealOpen, setAppealOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function onSubmit() {
    const trimmed = text.trim()
    if (!trimmed) {
      toast.error("Пустой ответ")
      return
    }
    startTransition(async () => {
      const res = await replyToTicket(ticketId, trimmed)
      if (res.ok) {
        toast.success("Ответ отправлен")
        setText("")
      } else {
        toast.error(res.error)
      }
    })
  }

  const canAppeal =
    ticketChannel === "FEEDBACK" && ticketStatus !== "APPEALED"

  return (
    <div className="sticky bottom-0 bg-white dark:bg-neutral-900 border-t p-3 flex items-end gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Введите ответ..."
        disabled={disabled || isPending}
        rows={3}
        className="flex-1 rounded-md border bg-transparent p-2 text-sm resize-none"
      />
      <div className="flex flex-col gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPickerOpen(true)}
          disabled={disabled || isPending}
          title="Выбрать шаблон"
        >
          <FileText className="h-4 w-4 mr-1" />
          Шаблон
        </Button>
        {canAppeal && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAppealOpen(true)}
            disabled={disabled || isPending}
            title="Обжаловать отзыв"
          >
            <Flag className="h-4 w-4 mr-1" />
            Обжаловать
          </Button>
        )}
        <Button
          onClick={onSubmit}
          disabled={disabled || isPending || !text.trim()}
          size="sm"
        >
          <Send className="h-4 w-4 mr-1" />
          {isPending ? "..." : "Отправить"}
        </Button>
      </div>
      <TemplatePickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        templates={templates}
        ticketNmId={ticketNmId}
        channel={ticketChannel}
        customerName={customerName}
        productName={productName}
        onPick={(substituted) => setText(substituted)}
      />
      {canAppeal && (
        <AppealModal
          open={appealOpen}
          onOpenChange={setAppealOpen}
          ticketId={ticketId}
          wbExternalId={wbExternalId ?? null}
        />
      )}
    </div>
  )
}
