"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Upload, FileText, X, Plus } from "lucide-react"
import { toast } from "sonner"
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

        <div className="space-y-2 pt-1 border-t">
          <FileRow kind="techspec" label="Техзадание на инспекцию" file={data.techSpec} inputRef={techRef} />
          <FileRow kind="report" label="Отчёт по инспекции" file={data.report} inputRef={reportRef} />
          <p className="text-[11px] text-muted-foreground">
            Генерация отчёта (резюме + фото → PDF) — в следующем обновлении; пока отчёт можно
            прикрепить файлом.
          </p>
        </div>
      </div>
    </div>
  )
}
