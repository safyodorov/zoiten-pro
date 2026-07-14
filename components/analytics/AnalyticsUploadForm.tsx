"use client"

// components/analytics/AnalyticsUploadForm.tsx
// Phase 30 (ANL-01, D-02) — загрузка 6 файлов «Сравнение карточек» → превью 30 SKU → «Начать сбор».
// accept=".json" + клиентская проверка file.size (анти-DoS) до отправки. POST /api/analytics/upload.
// «Начать сбор» → startNicheRun (MANAGE); блокируется при активном прогоне (ошибка с сервера).
// После запуска — монтируется NicheRunStatusPoller (D-02, прогресс + редирект).
import { useState } from "react"
import { toast } from "sonner"
import { startNicheRun } from "@/app/actions/analytics"
import type { NicheRunWireData } from "@/lib/analytics/data"
import { NicheRunStatusPoller } from "./NicheRunStatusPoller"

const REQUIRED = 6
const MAX_BYTES = 5 * 1024 * 1024

interface PreviewSku {
  nmId: number
  brand: string
  mainPhoto: string
  name: string
}
interface UploadResp {
  ok?: boolean
  error?: string
  preview?: PreviewSku[]
  dateFrom?: string
  dateTo?: string
  data?: NicheRunWireData
}

export function AnalyticsUploadForm({ canManage }: { canManage: boolean }) {
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewSku[] | null>(null)
  const [wire, setWire] = useState<NicheRunWireData | null>(null)
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)

  const onFiles = async (files: FileList | null) => {
    setError(null)
    setPreview(null)
    setWire(null)
    if (!files) return
    const arr = Array.from(files)
    if (arr.length !== REQUIRED) {
      setError(`Нужно ровно ${REQUIRED} файлов (выбрано ${arr.length})`)
      return
    }
    for (const f of arr) {
      if (f.size > MAX_BYTES) {
        setError(`Файл «${f.name}» превышает 5 МБ`)
        return
      }
    }

    const fd = new FormData()
    for (const f of arr) fd.append("files", f)

    setUploading(true)
    try {
      const res = await fetch("/api/analytics/upload", { method: "POST", body: fd })
      const data = (await res.json()) as UploadResp
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Ошибка валидации файлов")
        return
      }
      setPreview(data.preview ?? [])
      setWire(data.data ?? null)
      setPeriod({ from: data.dateFrom ?? "", to: data.dateTo ?? "" })
    } catch {
      setError("Не удалось загрузить файлы")
    } finally {
      setUploading(false)
    }
  }

  const onStart = async () => {
    if (!wire) return
    setStarting(true)
    try {
      const res = await startNicheRun(wire)
      if (res.ok && res.runId) {
        setRunId(res.runId)
      } else {
        toast.error(res.error ?? "Не удалось запустить сбор")
      }
    } finally {
      setStarting(false)
    }
  }

  if (runId) return <NicheRunStatusPoller runId={runId} />

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed p-6">
        <label className="block text-sm font-medium mb-2">6 файлов «Сравнение карточек» (.json)</label>
        <input
          type="file"
          accept=".json,application/json"
          multiple
          onChange={(e) => onFiles(e.target.files)}
          disabled={uploading}
          className="text-sm"
        />
        <p className="text-xs text-muted-foreground mt-2">
          Все 6 файлов должны быть за один и тот же период. Максимум 5 МБ на файл.
        </p>
      </div>

      {uploading && <div className="text-sm text-muted-foreground">Проверка файлов…</div>}
      {error && <div className="text-sm text-destructive border border-destructive/40 rounded-md p-3">{error}</div>}

      {preview && (
        <div className="space-y-3">
          <div className="text-sm">
            Найдено <span className="font-medium">{preview.length}</span> SKU
            {period && ` · период ${period.from} — ${period.to}`}
          </div>
          <div className="grid grid-cols-6 gap-2">
            {preview.map((s) => (
              <div key={s.nmId} className="rounded-md border p-1.5 text-center">
                {s.mainPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.mainPhoto} alt="" className="h-20 w-full object-contain" loading="lazy" />
                ) : (
                  <div className="h-20 bg-muted rounded" />
                )}
                <div className="text-[10px] text-muted-foreground truncate mt-1">{s.brand}</div>
                <div className="text-[10px] tabular-nums">{s.nmId}</div>
              </div>
            ))}
          </div>

          {canManage ? (
            <button
              type="button"
              onClick={onStart}
              disabled={starting || !wire}
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {starting ? "Запуск…" : "Начать сбор"}
            </button>
          ) : (
            <div className="text-sm text-muted-foreground">Запуск сбора доступен только с правами «Управление».</div>
          )}
        </div>
      )}
    </div>
  )
}
