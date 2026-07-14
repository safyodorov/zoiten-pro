"use client"

// components/analytics/AnalyticsUploadForm.tsx
// Phase 30 (ANL-01, D-02) — загрузка 6 файлов «Сравнение карточек» → превью 30 SKU → «Начать сбор».
// Крупная кликабельная зона + drag-and-drop + список выбранных файлов + встроенная инструкция.
// Принимает .json/.txt (валидность — по содержимому на сервере). POST /api/analytics/upload.
// «Начать сбор» → startNicheRun (MANAGE); блокируется при активном прогоне. После — poller (D-02).
import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import { UploadCloud, FileJson, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
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

const fmtKb = (n: number) => `${Math.max(1, Math.round(n / 1024))} КБ`

export function AnalyticsUploadForm({ canManage }: { canManage: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)
  const [selected, setSelected] = useState<{ name: string; size: number }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewSku[] | null>(null)
  const [wire, setWire] = useState<NicheRunWireData | null>(null)
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)

  const onFiles = useCallback(async (fileList: FileList | null) => {
    setError(null)
    setPreview(null)
    setWire(null)
    if (!fileList || fileList.length === 0) return
    const arr = Array.from(fileList)
    setSelected(arr.map((f) => ({ name: f.name, size: f.size })))

    if (arr.length !== REQUIRED) {
      setError(`Нужно ровно ${REQUIRED} файлов (выбрано ${arr.length}). Выбери все 6 сразу.`)
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
  }, [])

  const onStart = async () => {
    if (!wire) return
    setStarting(true)
    try {
      const res = await startNicheRun(wire)
      if (res.ok && res.runId) setRunId(res.runId)
      else toast.error(res.error ?? "Не удалось запустить сбор")
    } finally {
      setStarting(false)
    }
  }

  if (runId) return <NicheRunStatusPoller runId={runId} />

  return (
    <div className="space-y-4">
      {/* Инструкция */}
      <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
        <div className="font-medium">Что загружать</div>
        <p className="text-muted-foreground">
          6 файлов отчёта <b>«Сравнение карточек»</b> (по 5 товаров в каждом = 30 SKU), все за один период.
        </p>
        <p className="text-muted-foreground">
          Как сохранить каждый файл: <b>F12 → Network</b> → правый клик на запросе сравнения →{" "}
          <b>«Save response»</b> (получится <code>.json</code>). Либо скопировать ответ в{" "}
          <b>Блокнот</b> и сохранить как <code>.txt</code>. <b>Word/.docx не подходит</b> — он портит JSON.
        </p>
      </div>

      {/* Зона загрузки */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => { e.preventDefault(); setDragActive(true) }}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
        onDragLeave={(e) => { e.preventDefault(); setDragActive(false) }}
        onDrop={(e) => { e.preventDefault(); setDragActive(false); onFiles(e.dataTransfer.files) }}
        disabled={uploading}
        className={cn(
          "w-full rounded-xl border-2 border-dashed p-8 flex flex-col items-center justify-center gap-2 text-center transition-colors cursor-pointer",
          dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/60 hover:bg-muted/30",
          uploading && "opacity-60 cursor-wait",
        )}
      >
        <UploadCloud className="h-9 w-9 text-muted-foreground" />
        <div className="text-base font-medium">Перетащите сюда 6 файлов или нажмите, чтобы выбрать</div>
        <div className="text-xs text-muted-foreground">Форматы: .json, .txt · до 5 МБ на файл · нужно выбрать все 6 сразу</div>
        <input
          ref={inputRef}
          type="file"
          accept=".json,.txt,application/json,text/plain"
          multiple
          onChange={(e) => onFiles(e.target.files)}
          className="hidden"
        />
      </button>

      {/* Список выбранных файлов */}
      {selected.length > 0 && (
        <div className="rounded-lg border divide-y">
          <div className="px-3 py-1.5 text-xs text-muted-foreground bg-muted/30">
            Выбрано файлов: {selected.length}/{REQUIRED}
          </div>
          {selected.map((f, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <FileJson className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate flex-1">{f.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{fmtKb(f.size)}</span>
            </div>
          ))}
        </div>
      )}

      {uploading && <div className="text-sm text-muted-foreground">Проверка файлов…</div>}
      {error && <div className="text-sm text-destructive border border-destructive/40 rounded-md p-3">{error}</div>}

      {preview && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-500">
            <CheckCircle2 className="h-4 w-4" />
            Найдено <span className="font-medium">{preview.length}</span> SKU
            {period && <span className="text-muted-foreground">· период {period.from} — {period.to}</span>}
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
