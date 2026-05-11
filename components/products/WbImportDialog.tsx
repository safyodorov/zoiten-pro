"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { previewWbImport, importFromWb, type WbImportPreview } from "@/app/actions/products"
import { cn } from "@/lib/utils"

interface WbImportDialogProps {
  productId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ACTION_LABEL: Record<string, { text: string; cls: string }> = {
  "will-set": { text: "будет заполнено", cls: "text-green-700 dark:text-green-400" },
  "will-overwrite": { text: "будет перезаписано", cls: "text-amber-700 dark:text-amber-400" },
  "no-source": { text: "нет в WB", cls: "text-muted-foreground" },
  matches: { text: "совпадает", cls: "text-muted-foreground" },
}

export function WbImportDialog({ productId, open, onOpenChange }: WbImportDialogProps) {
  const router = useRouter()
  const [preview, setPreview] = useState<WbImportPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [replaceExisting, setReplaceExisting] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) {
      setPreview(null)
      setError(null)
      setReplaceExisting(false)
      return
    }
    setLoading(true)
    setError(null)
    previewWbImport(productId).then((res) => {
      setLoading(false)
      if (res.ok) setPreview(res)
      else setError(res.error)
    })
  }, [open, productId])

  function handleImport() {
    startTransition(async () => {
      const res = await importFromWb({ productId, replaceExisting })
      if (res.ok) {
        toast.success(
          `Импорт OK: свойства ${res.properties.applied}/${res.properties.applied + res.properties.skipped}, размеры +${res.sizes.added}`
        )
        onOpenChange(false)
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  const hasOverwrites =
    preview?.ok && preview.properties.some((p) => p.action === "will-overwrite")
  const willChange =
    preview?.ok &&
    (preview.properties.some(
      (p) => p.action === "will-set" || (p.action === "will-overwrite" && replaceExisting)
    ) ||
      preview.sizes.toAdd.length > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Импортировать из WB</DialogTitle>
          <DialogDescription>
            Данные подтянутся из основной WB-карточки товара (первая в списке артикулов
            WB).
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {preview?.ok && !preview.hasWbCard && (
          <div className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
            У товара нет привязанной WB-карточки или nmId не найден в базе. Привяжите WB-артикул
            и выполните синхронизацию.
          </div>
        )}

        {preview?.ok && preview.hasWbCard && (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {/* Свойства */}
            <section>
              <h3 className="text-sm font-medium mb-2">Свойства</h3>
              {preview.properties.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  В категории товара нет настроенных свойств. Добавьте их в Настройках.
                </p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="border-b">
                      <th className="text-left font-normal py-1.5">Свойство</th>
                      <th className="text-left font-normal py-1.5">В WB</th>
                      <th className="text-left font-normal py-1.5">Сейчас</th>
                      <th className="text-left font-normal py-1.5">Действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.properties.map((p) => {
                      const lbl = ACTION_LABEL[p.action]
                      return (
                        <tr key={p.propertyId} className="border-b last:border-b-0">
                          <td className="py-1.5">{p.propertyName}</td>
                          <td className="py-1.5 text-muted-foreground">
                            {p.wbValue ?? <span className="opacity-50">—</span>}
                          </td>
                          <td className="py-1.5 text-muted-foreground">
                            {p.currentValue ?? <span className="opacity-50">—</span>}
                          </td>
                          <td className={cn("py-1.5", lbl.cls)}>{lbl.text}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </section>

            {/* Размеры */}
            <section>
              <h3 className="text-sm font-medium mb-2">Размеры</h3>
              {preview.sizes.fromWb.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  В WB-карточке нет размеров (одно-размерный товар или категория без размеров).
                </p>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs">
                    В WB:{" "}
                    {preview.sizes.fromWb.map((s, i) => (
                      <span
                        key={s}
                        className={cn(
                          "inline-block rounded bg-muted px-1.5 py-0.5 mr-1 mb-1",
                          preview.sizes.existing.includes(s)
                            ? "opacity-50 line-through"
                            : "text-green-700 dark:text-green-400 font-medium"
                        )}
                      >
                        {s}
                      </span>
                    ))}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Будут добавлены: {preview.sizes.toAdd.length === 0 ? "—" : preview.sizes.toAdd.join(", ")}
                    {preview.sizes.existing.length > 0 &&
                      ` (уже есть: ${preview.sizes.existing.join(", ")})`}
                  </p>
                </div>
              )}
            </section>

            {/* Опции */}
            {hasOverwrites && (
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={replaceExisting}
                  onCheckedChange={(c) => setReplaceExisting(c === true)}
                />
                Перезаписать существующие значения свойств
              </label>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Отмена
          </Button>
          <Button
            onClick={handleImport}
            disabled={isPending || loading || !preview?.ok || !preview.hasWbCard || !willChange}
          >
            {isPending ? "Импортирую..." : "Импортировать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
