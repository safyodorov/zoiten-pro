"use client"

// components/support/ReplyPanel.tsx
// Ответ на тикет (FEEDBACK/QUESTION). Phase 11 Plan 03: добавлена кнопка
// «Шаблон» → TemplatePickerModal. При выборе шаблона substituteTemplateVars
// подставляет customerName/productName в текст, значение отдаётся в textarea.

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Send, FileText } from "lucide-react"
import { toast } from "sonner"
import { replyToTicket } from "@/app/actions/support"
import { TemplatePickerModal } from "@/components/support/templates/TemplatePickerModal"
import type { ResponseTemplate } from "@prisma/client"

export function ReplyPanel({
  ticketId,
  ticketNmId,
  ticketChannel,
  customerName,
  productName,
  templates,
  disabled,
}: {
  ticketId: string
  ticketNmId: number | null
  ticketChannel: "FEEDBACK" | "QUESTION" | "CHAT"
  customerName: string | null
  productName: string | null
  templates: ResponseTemplate[]
  disabled?: boolean
}) {
  const [text, setText] = useState("")
  const [pickerOpen, setPickerOpen] = useState(false)
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
    </div>
  )
}
