"use client"
// components/bank/BankImportButton.tsx
// Phase 22 (22-04): Кнопка загрузки Excel-выписок банка.
// Мультизагрузка (до 50 файлов): input multiple → файлы грузятся ПОСЛЕДОВАТЕЛЬНО
// через тот же single-file роут /api/bank-import (авто-детект формата per-файл,
// дедуп по fingerprint делает повторную загрузку безопасной). Последовательно —
// чтобы не держать 50 xlsx в памяти одновременно на 2ГБ VPS.

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"

const MAX_FILES = 50

type FileResult = {
  name: string
  ok: boolean
  imported: number
  skipped: number
  error?: string
}

export function BankImportButton() {
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function uploadOne(file: File): Promise<FileResult> {
    const formData = new FormData()
    formData.append("file", file)
    try {
      const res = await fetch("/api/bank-import", { method: "POST", body: formData })
      const data = await res.json()
      if (res.ok) {
        return {
          name: file.name,
          ok: true,
          imported: (data.imported as number) ?? 0,
          skipped: (data.skipped as number) ?? 0,
        }
      }
      return { name: file.name, ok: false, imported: 0, skipped: 0, error: (data.error as string) ?? "Ошибка" }
    } catch {
      return { name: file.name, ok: false, imported: 0, skipped: 0, error: "Ошибка сети" }
    }
  }

  async function handleFiles(files: File[]) {
    if (files.length === 0) return

    let batch = files
    if (files.length > MAX_FILES) {
      toast.warning(`Выбрано ${files.length} файлов — за раз загружаем первые ${MAX_FILES}`)
      batch = files.slice(0, MAX_FILES)
    }

    setIsUploading(true)
    setProgress({ done: 0, total: batch.length })

    const results: FileResult[] = []
    for (let i = 0; i < batch.length; i++) {
      results.push(await uploadOne(batch[i]))
      setProgress({ done: i + 1, total: batch.length })
    }

    setIsUploading(false)
    setProgress(null)

    // Агрегированный итог
    const okResults = results.filter((r) => r.ok)
    const failed = results.filter((r) => !r.ok)
    const imported = okResults.reduce((s, r) => s + r.imported, 0)
    const skipped = okResults.reduce((s, r) => s + r.skipped, 0)

    if (batch.length === 1) {
      const r = results[0]
      if (r.ok) toast.success(`Импортировано ${r.imported}, пропущено дублей ${r.skipped}`)
      else toast.error(r.error ?? "Ошибка загрузки")
    } else {
      if (okResults.length > 0) {
        toast.success(
          `Файлов: ${okResults.length}/${batch.length} · импортировано ${imported}, пропущено дублей ${skipped}`,
        )
      }
      if (failed.length > 0) {
        const names = failed.map((r) => r.name).join(", ")
        toast.error(`Не удалось (${failed.length}): ${names}`)
      }
    }

    if (okResults.length > 0) router.refresh()
  }

  const label = isUploading
    ? progress
      ? `Импорт ${progress.done}/${progress.total}…`
      : "Импорт…"
    : "Загрузить выписки"

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
        {label}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length > 0) handleFiles(files)
          e.target.value = ""
        }}
      />
    </>
  )
}
