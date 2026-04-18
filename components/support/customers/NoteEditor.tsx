"use client"

// components/support/customers/NoteEditor.tsx
// Client — debounced textarea (500ms) для Customer.note. Live счётчик символов /5000.
// Паттерн дублирует Phase 7 GlobalRatesBar: useRef<timer> + useTransition + sonner toast.
// Disclaimer в title-attr: автосохранение, при конфликте побеждает последнее.

import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { updateCustomerNote } from "@/app/actions/support"

export function NoteEditor({
  customerId,
  initialNote,
}: {
  customerId: string
  initialNote: string
}) {
  const [value, setValue] = useState(initialNote)
  const [isPending, startTransition] = useTransition()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(next: string) {
    setValue(next)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      startTransition(async () => {
        const res = await updateCustomerNote(customerId, next)
        if (!res.ok) toast.error(res.error)
        else toast.success("Заметка сохранена", { duration: 1500 })
      })
    }, 500)
  }

  return (
    <section className="rounded-lg border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Заметка</h3>
        <span
          className="text-[10px] text-muted-foreground"
          title="Сохраняется автоматически. При конфликте победит последнее изменение."
        >
          Автосохранение
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Внутренняя заметка о покупателе..."
        rows={6}
        maxLength={5000}
        className="w-full rounded border bg-transparent p-2 text-sm resize-none"
      />
      <div className="flex justify-end text-[10px] text-muted-foreground">
        {value.length}/5000
        {isPending && <span className="ml-2">сохраняю...</span>}
      </div>
    </section>
  )
}
