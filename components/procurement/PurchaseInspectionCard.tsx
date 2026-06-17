"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Upload,
  FileText,
  X,
  Plus,
  Download,
  Play,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { saveInspection } from "@/app/actions/purchases"

export interface InspectionFile {
  name: string | null
  size: number | null
}

export interface InspectionData {
  plannedDate: string // yyyy-mm-dd | ""
  actualDate: string
  costRub: string // строка для input
  inspectorName: string
  contacts: { phone: string; wechat: string }[]
  techSpec: InspectionFile
  report: InspectionFile
  reportSummary: string
  photos: { id: string }[]
  videos: { id: string; fileName: string; sizeBytes: number }[]
}

const MAX_PHOTOS = 300
const MAX_VIDEO_INPUT = 200 * 1024 * 1024

// Сжатие фото на клиенте перед загрузкой: max 1280px, jpeg 0.7 (учёт EXIF-ориентации).
async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  const maxDim = 1280
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  ctx?.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      0.7
    )
  )
}

interface Props {
  purchaseId: string
  data: InspectionData
  canManage: boolean
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return ""
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

export function PurchaseInspectionCard({ purchaseId, data, canManage }: Props) {
  const router = useRouter()
  const [plannedDate, setPlannedDate] = useState(data.plannedDate)
  const [actualDate, setActualDate] = useState(data.actualDate)
  const [costRub, setCostRub] = useState(data.costRub)
  const [inspectorName, setInspectorName] = useState(data.inspectorName)
  const [contacts, setContacts] = useState(
    data.contacts.length ? data.contacts : [{ phone: "", wechat: "" }]
  )
  const [saving, setSaving] = useState(false)
  const techRef = useRef<HTMLInputElement | null>(null)
  const reportRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState<"techspec" | "report" | null>(null)

  // Генерация отчёта
  const [genOpen, setGenOpen] = useState(false)
  const [summary, setSummary] = useState(data.reportSummary)
  const [photos, setPhotos] = useState<{ id: string }[]>(data.photos)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [generating, setGenerating] = useState(false)
  const photoRef = useRef<HTMLInputElement | null>(null)

  // Видео инспекции
  const [videos, setVideos] = useState(data.videos)
  const [videoBusy, setVideoBusy] = useState(false)
  const videoRef = useRef<HTMLInputElement | null>(null)
  const [playingIndex, setPlayingIndex] = useState<number | null>(null)

  async function uploadOneVideo(file: File): Promise<boolean> {
    if (file.size > MAX_VIDEO_INPUT) {
      toast.error(`«${file.name}» больше 200 МБ — пропущено`)
      return false
    }
    try {
      const res = await fetch(
        `/api/procurement/inspection/videos?purchaseId=${purchaseId}&name=${encodeURIComponent(file.name)}`,
        { method: "POST", headers: { "Content-Type": file.type || "video/mp4" }, body: file }
      )
      const json = await res.json()
      if (res.ok && json.ok) {
        setVideos((prev) => [
          ...prev,
          { id: json.id, fileName: json.fileName, sizeBytes: json.sizeBytes },
        ])
        return true
      }
      toast.error(json.error ?? `Ошибка загрузки «${file.name}»`)
      return false
    } catch {
      toast.error(`Ошибка загрузки «${file.name}»`)
      return false
    }
  }

  // Последовательная загрузка (одно сжатие ffmpeg за раз — бережём CPU/память VPS).
  async function addVideos(files: FileList) {
    setVideoBusy(true)
    let ok = 0
    for (const f of Array.from(files)) {
      if (await uploadOneVideo(f)) ok++
    }
    setVideoBusy(false)
    if (ok > 0) toast.success(`Видео загружено: ${ok}`)
  }

  async function removeVideo(id: string) {
    if (!window.confirm("Удалить видео?")) return
    try {
      const res = await fetch(`/api/procurement/inspection/videos?id=${id}`, { method: "DELETE" })
      if (res.ok) setVideos((prev) => prev.filter((v) => v.id !== id))
      else toast.error("Ошибка удаления")
    } catch {
      toast.error("Ошибка сервера")
    }
  }

  async function addPhotos(files: FileList) {
    const room = MAX_PHOTOS - photos.length
    if (room <= 0) {
      toast.error(`Лимит ${MAX_PHOTOS} фото`)
      return
    }
    const list = Array.from(files).slice(0, room)
    setPhotoBusy(true)
    let ok = 0
    for (const f of list) {
      try {
        const blob = await compressImage(f)
        const fd = new FormData()
        fd.append("file", new File([blob], "photo.jpg", { type: "image/jpeg" }))
        fd.append("purchaseId", purchaseId)
        const res = await fetch("/api/procurement/inspection/photos", { method: "POST", body: fd })
        const json = await res.json()
        if (res.ok && json.ok) {
          setPhotos((prev) => [...prev, { id: json.id }])
          ok++
        } else toast.error(json.error ?? "Ошибка загрузки фото")
      } catch {
        toast.error("Не удалось обработать фото")
      }
    }
    setPhotoBusy(false)
    if (ok > 0) toast.success(`Добавлено фото: ${ok}`)
  }

  async function removePhoto(id: string) {
    try {
      const res = await fetch(`/api/procurement/inspection/photos?id=${id}`, { method: "DELETE" })
      if (res.ok) setPhotos((prev) => prev.filter((p) => p.id !== id))
      else toast.error("Ошибка удаления фото")
    } catch {
      toast.error("Ошибка сервера")
    }
  }

  async function generateReport() {
    setGenerating(true)
    try {
      const res = await fetch("/api/procurement/inspection/report-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseId, summary }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        toast.success("Отчёт сгенерирован")
        setGenOpen(false)
        router.refresh()
      } else toast.error(json.error ?? "Ошибка генерации")
    } catch {
      toast.error("Ошибка сервера")
    } finally {
      setGenerating(false)
    }
  }

  async function save() {
    setSaving(true)
    try {
      const res = await saveInspection(purchaseId, {
        plannedDate: plannedDate || null,
        actualDate: actualDate || null,
        costRub: costRub.trim() ? Number(costRub.replace(",", ".")) : null,
        inspectorName: inspectorName.trim() || null,
        contacts: contacts
          .map((c) => ({ phone: c.phone.trim() || null, wechat: c.wechat.trim() || null }))
          .filter((c) => c.phone || c.wechat),
      })
      if (res.ok) {
        toast.success("Инспекция сохранена")
        router.refresh()
      } else toast.error(res.error)
    } catch {
      toast.error("Ошибка сервера")
    } finally {
      setSaving(false)
    }
  }

  async function uploadFile(kind: "techspec" | "report", file: File) {
    setUploading(kind)
    const fd = new FormData()
    fd.append("file", file)
    fd.append("purchaseId", purchaseId)
    fd.append("kind", kind)
    try {
      const res = await fetch("/api/procurement/inspection/file", { method: "POST", body: fd })
      const json = await res.json()
      if (res.ok && json.ok) {
        toast.success("Файл загружен")
        router.refresh()
      } else toast.error(json.error ?? "Ошибка загрузки")
    } catch {
      toast.error("Ошибка сервера")
    } finally {
      setUploading(null)
    }
  }

  async function deleteFile(kind: "techspec" | "report") {
    if (!window.confirm("Удалить файл?")) return
    try {
      const res = await fetch(
        `/api/procurement/inspection/file?purchaseId=${purchaseId}&kind=${kind}`,
        { method: "DELETE" }
      )
      const json = await res.json()
      if (res.ok && json.ok) {
        toast.success("Файл удалён")
        router.refresh()
      } else toast.error(json.error ?? "Ошибка")
    } catch {
      toast.error("Ошибка сервера")
    }
  }

  const inputCls =
    "h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
  const labelCls = "text-xs font-medium text-muted-foreground"

  function FileRow({
    kind,
    label,
    file,
    inputRef,
  }: {
    kind: "techspec" | "report"
    label: string
    file: InspectionFile
    inputRef: React.RefObject<HTMLInputElement | null>
  }) {
    return (
      <div className="flex items-center gap-2">
        <span className={`${labelCls} w-44 shrink-0`}>{label}</span>
        {file.name ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 pl-2 pr-1 py-1 text-xs">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <a
              href={`/api/procurement/inspection/file?purchaseId=${purchaseId}&kind=${kind}`}
              className="truncate max-w-[220px] hover:underline"
              title={file.name}
            >
              {file.name}
            </a>
            <span className="text-muted-foreground">{formatSize(file.size)}</span>
            {canManage && (
              <button
                type="button"
                onClick={() => deleteFile(kind)}
                className="text-muted-foreground hover:text-destructive"
                title="Удалить"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">— не загружен</span>
        )}
        {canManage && (
          <>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) uploadFile(kind, e.target.files[0])
                e.target.value = ""
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={uploading === kind}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              {uploading === kind ? "Загрузка..." : file.name ? "Заменить" : "Файл"}
            </Button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <h3 className="text-sm font-semibold">Инспекция</h3>
        {canManage && (
          <Button type="button" size="sm" onClick={save} disabled={saving}>
            {saving ? "Сохранение..." : "Сохранить"}
          </Button>
        )}
      </div>

      <div className="p-3 space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Плановая дата инспекции</label>
            <input
              type="date"
              value={plannedDate}
              onChange={(e) => setPlannedDate(e.target.value)}
              disabled={!canManage}
              className={inputCls}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Фактическая дата инспекции</label>
            <input
              type="date"
              value={actualDate}
              onChange={(e) => setActualDate(e.target.value)}
              disabled={!canManage}
              className={inputCls}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Стоимость инспекции, ₽</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={costRub}
              onChange={(e) => setCostRub(e.target.value)}
              disabled={!canManage}
              className={inputCls}
            />
          </div>
        </div>

        {/* Инспектор + контакты */}
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Инспектор (имя)</label>
              <input
                type="text"
                value={inspectorName}
                onChange={(e) => setInspectorName(e.target.value)}
                disabled={!canManage}
                className={inputCls}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <span className={labelCls}>Контакты инспектора</span>
            {contacts.map((c, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  value={c.phone}
                  onChange={(e) =>
                    setContacts((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, phone: e.target.value } : x))
                    )
                  }
                  disabled={!canManage}
                  placeholder="Телефон"
                  className={`${inputCls} flex-1`}
                />
                <input
                  type="text"
                  value={c.wechat}
                  onChange={(e) =>
                    setContacts((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, wechat: e.target.value } : x))
                    )
                  }
                  disabled={!canManage}
                  placeholder="WeChat"
                  className={`${inputCls} flex-1`}
                />
                {canManage && contacts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setContacts((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {canManage && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setContacts((prev) => [...prev, { phone: "", wechat: "" }])}
              >
                <Plus className="h-3.5 w-3.5" />
                Контакт
              </Button>
            )}
          </div>
        </div>

        {/* Видео инспекции */}
        <div className="space-y-2 pt-1 border-t">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`${labelCls} w-44 shrink-0`}>Видео инспекции</span>
            <div className="flex-1 min-w-0 flex flex-wrap gap-2">
              {videos.length === 0 && (
                <span className="text-xs text-muted-foreground pt-1">— нет</span>
              )}
              {videos.map((v, idx) => (
                <div key={v.id} className="relative group/vid">
                  <button
                    type="button"
                    onClick={() => setPlayingIndex(idx)}
                    title={`Смотреть «${v.fileName}» (${formatSize(v.sizeBytes)})`}
                    className="block h-20 w-28 rounded-md border overflow-hidden bg-muted relative"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/procurement/inspection/videos/${v.id}/thumb`}
                      alt={v.fileName}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="rounded-full bg-black/50 p-1.5">
                        <Play className="h-4 w-4 text-white fill-white" />
                      </span>
                    </span>
                  </button>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => removeVideo(v.id)}
                      title="Удалить"
                      className="absolute -top-1.5 -right-1.5 rounded-full bg-background border text-muted-foreground hover:text-destructive opacity-0 group-hover/vid:opacity-100 transition-opacity"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {canManage && (
              <div className="shrink-0">
                <input
                  ref={videoRef}
                  type="file"
                  accept="video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) addVideos(e.target.files)
                    e.target.value = ""
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={videoBusy}
                  onClick={() => videoRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {videoBusy ? "Загрузка/сжатие..." : "Видео"}
                </Button>
              </div>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Приём до 200 МБ; если файл больше 20 МБ — автоматически сжимается до ≤20 МБ
            (загрузка большого файла может занять время).
          </p>
        </div>

        <div className="space-y-2 pt-1 border-t">
          <FileRow kind="techspec" label="Техзадание на инспекцию" file={data.techSpec} inputRef={techRef} />
          <div className="flex items-center gap-2 flex-wrap">
            <FileRow kind="report" label="Отчёт по инспекции" file={data.report} inputRef={reportRef} />
            {canManage && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="gap-1.5"
                onClick={() => setGenOpen((v) => !v)}
              >
                <FileText className="h-3.5 w-3.5" />
                {genOpen ? "Скрыть генерацию" : "Сгенерировать отчёт"}
              </Button>
            )}
          </div>

          {canManage && genOpen && (
            <div className="rounded-md border bg-muted/20 p-3 space-y-3">
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Резюме инспекции</label>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={5}
                  placeholder="Текстовое резюме по результатам инспекции..."
                  className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={labelCls}>
                    Фото отчёта ({photos.length}/{MAX_PHOTOS})
                  </span>
                  <input
                    ref={photoRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.length) addPhotos(e.target.files)
                      e.target.value = ""
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={photoBusy || photos.length >= MAX_PHOTOS}
                    onClick={() => photoRef.current?.click()}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {photoBusy ? "Загрузка..." : "Добавить фото"}
                  </Button>
                </div>
                {photos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {photos.map((p) => (
                      <span key={p.id} className="relative group/ph">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/procurement/inspection/photos/${p.id}`}
                          alt=""
                          className="h-16 w-16 rounded border object-cover bg-muted"
                        />
                        <button
                          type="button"
                          onClick={() => removePhoto(p.id)}
                          className="absolute -top-1.5 -right-1.5 rounded-full bg-background border text-muted-foreground hover:text-destructive opacity-0 group-hover/ph:opacity-100 transition-opacity"
                          title="Удалить фото"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button type="button" size="sm" onClick={generateReport} disabled={generating}>
                  {generating ? "Генерация..." : "Сгенерировать отчёт (PDF)"}
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  PDF: инфо о закупке → резюме → фото по 4 на странице (итог ≤ 20 МБ). Появится в
                  поле «Отчёт по инспекции».
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Модалка просмотра видео с перелистыванием */}
      <Dialog open={playingIndex !== null} onOpenChange={(o) => !o && setPlayingIndex(null)}>
        <DialogContent className="sm:max-w-3xl">
          {playingIndex !== null && videos[playingIndex] && (
            <>
              <DialogHeader>
                <DialogTitle className="truncate pr-6">
                  {videos[playingIndex].fileName}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {playingIndex + 1} / {videos.length}
                  </span>
                </DialogTitle>
              </DialogHeader>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="shrink-0"
                  disabled={playingIndex === 0}
                  onClick={() => setPlayingIndex((i) => (i !== null ? i - 1 : i))}
                  title="Предыдущее"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  key={videos[playingIndex].id}
                  src={`/api/procurement/inspection/videos/${videos[playingIndex].id}`}
                  controls
                  autoPlay
                  className="flex-1 min-w-0 max-h-[70vh] rounded-md bg-black"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="shrink-0"
                  disabled={playingIndex === videos.length - 1}
                  onClick={() => setPlayingIndex((i) => (i !== null ? i + 1 : i))}
                  title="Следующее"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
              <a
                href={`/api/procurement/inspection/videos/${videos[playingIndex].id}`}
                download
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline w-fit"
              >
                <Download className="h-4 w-4" />
                Скачать
              </a>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
