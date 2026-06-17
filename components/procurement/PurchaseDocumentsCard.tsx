"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Download, Upload, FileText, X, Archive } from "lucide-react"
import { toast } from "sonner"
import {
  CUSTOMS_CATEGORIES,
  DOC_CATEGORY_LABEL,
  MAX_DOC_BYTES,
  type DocCategory,
} from "@/lib/purchase-documents"

export interface DocItem {
  id: string
  category: DocCategory
  fileName: string
  sizeBytes: number
}

interface Props {
  purchaseId: string
  documents: DocItem[]
  canManage: boolean
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

export function PurchaseDocumentsCard({ purchaseId, documents, canManage }: Props) {
  const router = useRouter()
  const [busyCat, setBusyCat] = useState<DocCategory | null>(null)
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})

  const byCat = (cat: DocCategory) => documents.filter((d) => d.category === cat)

  async function uploadFiles(category: DocCategory, files: FileList) {
    setBusyCat(category)
    let ok = 0
    let failed = 0
    for (const file of Array.from(files)) {
      if (file.size > MAX_DOC_BYTES) {
        toast.error(`«${file.name}» больше 10 МБ — пропущен`)
        failed++
        continue
      }
      const fd = new FormData()
      fd.append("file", file)
      fd.append("purchaseId", purchaseId)
      fd.append("category", category)
      try {
        const res = await fetch("/api/procurement/documents", { method: "POST", body: fd })
        const json = await res.json()
        if (res.ok && json.ok) ok++
        else {
          failed++
          toast.error(json.error ?? `Ошибка загрузки «${file.name}»`)
        }
      } catch {
        failed++
        toast.error(`Ошибка загрузки «${file.name}»`)
      }
    }
    setBusyCat(null)
    if (ok > 0) {
      toast.success(`Загружено файлов: ${ok}`)
      router.refresh()
    }
    if (failed === 0 && ok === 0) toast.message("Нет файлов для загрузки")
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Удалить «${name}»?`)) return
    try {
      const res = await fetch(`/api/procurement/documents?id=${id}`, { method: "DELETE" })
      const json = await res.json()
      if (res.ok && json.ok) {
        toast.success("Документ удалён")
        router.refresh()
      } else {
        toast.error(json.error ?? "Ошибка удаления")
      }
    } catch {
      toast.error("Ошибка сервера")
    }
  }

  function CategoryRow({ category, label }: { category: DocCategory; label: string }) {
    const files = byCat(category)
    return (
      <div className="flex items-start gap-3 py-2">
        <div className="w-40 shrink-0 text-sm font-medium pt-1">{label}</div>
        <div className="flex-1 min-w-0 flex flex-wrap gap-1.5">
          {files.length === 0 && (
            <span className="text-xs text-muted-foreground pt-1.5">—</span>
          )}
          {files.map((d) => (
            <span
              key={d.id}
              className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 pl-2 pr-1 py-1 text-xs max-w-full"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <a
                href={`/api/procurement/documents/${d.id}`}
                className="truncate max-w-[200px] hover:underline"
                title={`${d.fileName} (${formatSize(d.sizeBytes)})`}
              >
                {d.fileName}
              </a>
              <span className="text-muted-foreground tabular-nums">{formatSize(d.sizeBytes)}</span>
              {canManage && (
                <button
                  type="button"
                  onClick={() => remove(d.id, d.fileName)}
                  title="Удалить"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          ))}
        </div>
        {canManage && (
          <div className="shrink-0">
            <input
              ref={(el) => {
                inputs.current[category] = el
              }}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length) uploadFiles(category, e.target.files)
                e.target.value = ""
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={busyCat === category}
              onClick={() => inputs.current[category]?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              {busyCat === category ? "Загрузка..." : "Файлы"}
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <h3 className="text-sm font-semibold">Документы</h3>
        {documents.length > 0 && (
          <a href={`/api/procurement/documents/zip?purchaseId=${purchaseId}`}>
            <Button type="button" size="sm" variant="outline" className="gap-1.5">
              <Archive className="h-4 w-4" />
              Скачать все ({documents.length})
            </Button>
          </a>
        )}
      </div>

      <div className="px-3 py-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          Документы для таможни
        </div>
        <div className="divide-y">
          {CUSTOMS_CATEGORIES.map((cat) => (
            <CategoryRow key={cat} category={cat} label={DOC_CATEGORY_LABEL[cat]} />
          ))}
        </div>
      </div>

      <div className="px-3 py-2 border-t">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          Документы прочие
        </div>
        <div className="divide-y">
          <CategoryRow category="OTHER" label="Файлы" />
        </div>
      </div>
    </div>
  )
}
