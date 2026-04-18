"use client"

// components/support/ChatReplyPanel.tsx (Phase 10 Plan 03)
// Client-панель отправки сообщений в WB Buyer Chat (только channel=CHAT).
// Multipart: textarea (≤1000) + file input (JPEG/PNG/PDF, ≤5 МБ/файл, ≤30 МБ суммарно).
// Preview выбранных файлов + счётчик символов + sticky bottom.

import { useRef, useState, useTransition } from "react"
import type { ChangeEvent } from "react"
import { toast } from "sonner"
import { Paperclip, Send, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { sendChatMessageAction } from "@/app/actions/support"

const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_TOTAL_BYTES = 30 * 1024 * 1024
const ALLOWED_MIME = ["image/jpeg", "image/png", "application/pdf"]

interface ChatReplyPanelProps {
  ticketId: string
  replySign: string | null
}

export function ChatReplyPanel({ ticketId, replySign }: ChatReplyPanelProps) {
  const [text, setText] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  const disabled =
    !replySign || isPending || (!text.trim() && files.length === 0)

  function onFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    const next: File[] = [...files]
    let totalBytes = next.reduce((sum, f) => sum + f.size, 0)
    for (const f of picked) {
      if (!ALLOWED_MIME.includes(f.type)) {
        toast.error(`Недопустимый формат: ${f.name}`)
        continue
      }
      if (f.size > MAX_FILE_BYTES) {
        toast.error(`${f.name} больше 5 МБ`)
        continue
      }
      if (totalBytes + f.size > MAX_TOTAL_BYTES) {
        toast.error("Суммарный размер больше 30 МБ")
        break
      }
      next.push(f)
      totalBytes += f.size
    }
    setFiles(next)
    // reset input value — чтобы можно было выбрать тот же файл повторно
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  function onSubmit() {
    const fd = new FormData()
    fd.set("ticketId", ticketId)
    fd.set("text", text)
    for (const f of files) fd.append("files", f)
    startTransition(async () => {
      const res = await sendChatMessageAction(fd)
      if (res.ok) {
        toast.success("Сообщение отправлено")
        setText("")
        setFiles([])
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="sticky bottom-0 border-t bg-white dark:bg-neutral-900 p-3 space-y-2">
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              className="flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs"
            >
              <span>
                {f.name} ({(f.size / 1024).toFixed(0)} КБ)
              </span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="ml-1 hover:text-destructive"
                title="Удалить"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_MIME.join(",")}
          className="hidden"
          onChange={onFileSelect}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending || !replySign}
          title="Прикрепить JPEG / PNG / PDF"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          rows={2}
          disabled={isPending || !replySign}
          placeholder={
            replySign
              ? "Сообщение (до 1000 символов)..."
              : "Нет replySign — запустите синхронизацию"
          }
          className="flex-1 resize-none rounded-md border bg-transparent p-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex flex-col items-end gap-1">
          <span className="text-[10px] text-muted-foreground">
            {text.length}/1000
          </span>
          <Button
            type="button"
            size="sm"
            onClick={onSubmit}
            disabled={disabled}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send className="mr-1 h-4 w-4" /> Отправить
              </>
            )}
          </Button>
        </div>
      </div>
      {!replySign && (
        <p className="text-xs text-destructive">
          Нет replySign — запустите синхронизацию чата
        </p>
      )}
    </div>
  )
}

export default ChatReplyPanel
