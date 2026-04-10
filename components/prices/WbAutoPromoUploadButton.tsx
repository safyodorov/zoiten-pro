// components/prices/WbAutoPromoUploadButton.tsx
// Phase 7 (07-10): Кнопка + Dialog для загрузки Excel отчёта auto-акции WB.
// WB API не даёт nomenclatures для auto-акций (422), поэтому данные берутся
// из Excel-отчёта кабинета WB. См. /api/wb-promotions-upload-excel (07-04).
//
// Native <select> для выбора акции (CLAUDE.md convention, не base-ui Select).

"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Upload } from "lucide-react"
import { toast } from "sonner"

interface AutoPromotion {
  id: number
  name: string
}

interface WbAutoPromoUploadButtonProps {
  autoPromotions: AutoPromotion[]
}

export function WbAutoPromoUploadButton({
  autoPromotions,
}: WbAutoPromoUploadButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string>(
    autoPromotions.length > 0 ? String(autoPromotions[0].id) : "",
  )
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null)
  }

  const handleSubmit = () => {
    if (!file) {
      toast.error("Выберите файл")
      return
    }
    if (!selectedId) {
      toast.error("Выберите акцию")
      return
    }

    startTransition(async () => {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("promotionId", selectedId)

      try {
        const res = await fetch("/api/wb-promotions-upload-excel", {
          method: "POST",
          body: formData,
        })
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || "Ошибка загрузки")
        }

        toast.success(
          `Загружено ${data.imported} строк в акцию «${data.promotionName}»`,
        )
        setOpen(false)
        setFile(null)
        if (fileInputRef.current) fileInputRef.current.value = ""
        router.refresh()
      } catch (e) {
        toast.error(
          (e as Error).message ||
            "Не удалось распознать Excel. Проверьте формат файла.",
        )
      }
    })
  }

  const disabled = autoPromotions.length === 0

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-2"
      >
        <Upload className="h-4 w-4" />
        Загрузить отчёт auto-акции
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Загрузка отчёта auto-акции WB</DialogTitle>
            <DialogDescription>
              {disabled
                ? "Сначала синхронизируйте акции через кнопку «Синхронизировать акции»."
                : "Выберите auto-акцию и загрузите Excel из кабинета WB."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="promotion-select">Auto-акция</Label>
              <select
                id="promotion-select"
                className="h-9 rounded border border-input bg-transparent px-2 text-sm"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                disabled={disabled}
              >
                {autoPromotions.length === 0 && (
                  <option value="">— нет доступных акций —</option>
                )}
                {autoPromotions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="file-input">Файл Excel из кабинета WB</Label>
              <input
                id="file-input"
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                disabled={disabled}
                className="text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Отмена
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={disabled || isPending || !file}
            >
              {isPending ? "Загрузка…" : "Загрузить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
