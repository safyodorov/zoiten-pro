"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Send } from "lucide-react"
import { toast } from "sonner"
import { replyToTicket } from "@/app/actions/support"

export function ReplyPanel({
  ticketId,
  disabled,
}: {
  ticketId: string
  disabled?: boolean
}) {
  const [text, setText] = useState("")
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
      <Button
        onClick={onSubmit}
        disabled={disabled || isPending || !text.trim()}
        size="sm"
      >
        <Send className="h-4 w-4 mr-1" />
        {isPending ? "Отправка..." : "Отправить"}
      </Button>
    </div>
  )
}
