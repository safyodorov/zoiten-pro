"use client"

// components/support/templates/TemplateImportButton.tsx
// Кнопка «Импорт» — открывает скрытый file input, читает JSON и отправляет в
// importTemplatesJson. Toast с результатом (added / updated / errors).

import { useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Upload } from "lucide-react"
import { importTemplatesJson } from "@/app/actions/templates"

export function TemplateImportButton() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    startTransition(async () => {
      try {
        const text = await file.text()
        const res = await importTemplatesJson(text)
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        const parts = [`Добавлено: ${res.added}`, `обновлено: ${res.updated}`]
        if (res.errors.length > 0) parts.push(`ошибок: ${res.errors.length}`)
        const msg = parts.join(", ")
        if (res.errors.length > 0) {
          toast.warning(msg)
          // Печатаем первые 3 ошибки в консоль для диагностики.
          // eslint-disable-next-line no-console
          console.warn("Import errors:", res.errors.slice(0, 3))
        } else {
          toast.success(msg)
        }
        router.refresh()
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Ошибка чтения файла"
        )
      }
    })
    e.target.value = ""
  }

  return (
    <>
      <input
        type="file"
        accept=".json,application/json"
        ref={inputRef}
        onChange={onChange}
        className="hidden"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={isPending}
      >
        <Upload className="h-4 w-4 mr-1" />
        {isPending ? "Импорт..." : "Импорт"}
      </Button>
    </>
  )
}
