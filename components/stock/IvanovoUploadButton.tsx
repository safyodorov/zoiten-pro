// components/stock/IvanovoUploadButton.tsx
// Phase 14 (STOCK-11, STOCK-12): Кнопка загрузки Excel остатков склада Иваново.
//
// Паттерн: WbAutoPromoUploadButton из Phase 7.
// Нажатие → открывает file picker (accept=.xlsx) → upload → API parse → IvanovoUploadDialog.
//
// Интеграция в /stock page header — выполняется в Plan 14-05.

"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Upload } from "lucide-react"
import { toast } from "sonner"
import {
  IvanovoUploadDialog,
  type IvanovoPreviewData,
} from "./IvanovoUploadDialog"

export function IvanovoUploadButton() {
  const [isParsing, setIsParsing] = useState(false)
  const [preview, setPreview] = useState<IvanovoPreviewData | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setIsParsing(true)
    try {
      const fd = new FormData()
      fd.append("file", file)

      const res = await fetch("/api/stock/ivanovo-upload", {
        method: "POST",
        body: fd,
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        toast.error(
          (json as { error?: string }).error ??
            `Не удалось прочитать Excel. Проверьте формат — ожидается файл с колонками: Штрих-код, Артикул, Количество.`,
        )
        return
      }

      const data: IvanovoPreviewData = await res.json()
      setPreview(data)
    } catch (e) {
      toast.error(`Не удалось загрузить файл: ${(e as Error).message}`)
    } finally {
      setIsParsing(false)
      // Сбрасываем input чтобы можно было загрузить тот же файл повторно
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleClose = () => {
    setPreview(null)
  }

  return (
    <>
      {/* Скрытый file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />

      {/* Кнопка «Загрузить Excel Иваново» — variant=outline по UI-SPEC §3 */}
      <Button
        variant="outline"
        size="sm"
        disabled={isParsing}
        onClick={() => fileInputRef.current?.click()}
        aria-label="Загрузить Excel остатков склада Иваново"
      >
        <Upload className="mr-2 h-4 w-4" />
        {isParsing ? "Загрузка..." : "Загрузить Excel Иваново"}
      </Button>

      {/* Preview dialog — рендерится только после успешного парсинга */}
      {preview && (
        <IvanovoUploadDialog
          preview={preview}
          onClose={handleClose}
        />
      )}
    </>
  )
}
