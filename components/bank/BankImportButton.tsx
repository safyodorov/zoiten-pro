"use client"
// components/bank/BankImportButton.tsx
// Phase 22 (22-04): Кнопка загрузки Excel-выписки банка.
// Зеркало WbUploadIuButton: hidden input + ref.click, fetch FormData, toast, router.refresh.

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"

export function BankImportButton() {
  const [isUploading, setIsUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function handleFile(file: File) {
    setIsUploading(true)
    const formData = new FormData()
    formData.append("file", file)

    try {
      const res = await fetch("/api/bank-import", { method: "POST", body: formData })
      const data = await res.json()

      if (res.ok) {
        toast.success(
          `${(data.format as string).toUpperCase()}: импортировано ${data.imported as number}, пропущено дублей ${data.skipped as number}`,
        )
        router.refresh()
      } else {
        toast.error((data.error as string) ?? "Ошибка загрузки")
      }
    } catch {
      toast.error("Ошибка сети")
    }

    setIsUploading(false)
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
        className="gap-1.5"
      >
        <Upload className="h-3.5 w-3.5" />
        {isUploading ? "Импорт…" : "Загрузить выписку"}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ""
        }}
      />
    </>
  )
}
