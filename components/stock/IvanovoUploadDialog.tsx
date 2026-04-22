// components/stock/IvanovoUploadDialog.tsx
// Phase 14 (STOCK-11, STOCK-12): Preview-диалог импорта остатков склада Иваново.
//
// Показывает 4 секции из API preview-ответа:
//   1. Изменения (valid rows с diff old→new)
//   2. Не найдено в базе (unmatched — не блокируют импорт)
//   3. Дубликаты в файле (duplicates — применится последнее значение)
//   4. Невалидные строки (invalid — не будут импортированы)
//
// Кнопка «Применить» disabled только при validCount===0.
// После apply: toast.success + dialog close + router.refresh.

"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { upsertIvanovoStock } from "@/app/actions/stock"
import type {
  IvanovoPreviewValid,
  IvanovoPreviewUnmatched,
  IvanovoPreviewDuplicate,
  IvanovoPreviewInvalid,
} from "@/app/api/stock/ivanovo-upload/route"

// ── Тип preview данных (переэкспортируется для IvanovoUploadButton) ─

export interface IvanovoPreviewData {
  valid: IvanovoPreviewValid[]
  unmatched: IvanovoPreviewUnmatched[]
  duplicates: IvanovoPreviewDuplicate[]
  invalid: IvanovoPreviewInvalid[]
  invalidParseRows: number[]
}

// ── Компонент ────────────────────────────────────────────────────

interface IvanovoUploadDialogProps {
  preview: IvanovoPreviewData
  onClose: () => void
}

export function IvanovoUploadDialog({ preview, onClose }: IvanovoUploadDialogProps) {
  const [isApplying, startTransition] = useTransition()
  const router = useRouter()
  const validCount = preview.valid.length

  const onApply = () => {
    startTransition(async () => {
      try {
        const rows = preview.valid.map((v) => ({ sku: v.sku, quantity: v.newQty }))
        const result = await upsertIvanovoStock(rows)

        toast.success(`Импортировано ${result.imported} строк остатков Иваново`)

        if (result.notFound.length > 0) {
          toast.warning(`${result.notFound.length} SKU не найдены в базе`)
        }
        if (result.errors.length > 0) {
          toast.error(`Ошибки при сохранении ${result.errors.length} строк`)
        }

        onClose()
        router.refresh()
      } catch (e) {
        toast.error(`Ошибка применения: ${(e as Error).message}`)
      }
    })
  }

  const totalInvalidCount =
    preview.invalid.length + preview.invalidParseRows.length

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Импорт остатков склада Иваново</DialogTitle>
          <DialogDescription>
            Предварительный просмотр изменений перед применением
          </DialogDescription>
        </DialogHeader>

        {/* Секция 1 — Корректные строки с diff old → new */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Изменения ({validCount})</h3>
          {validCount === 0 ? (
            <p className="text-xs text-muted-foreground">
              Нет корректных строк для импорта.
            </p>
          ) : (
            <div className="rounded border divide-y max-h-60 overflow-y-auto">
              {preview.valid.map((row) => (
                <div
                  key={row.sku}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-mono text-xs text-muted-foreground mr-2">
                      {row.sku}
                    </span>
                    {row.productName}
                  </span>
                  <span className="tabular-nums ml-4 shrink-0">
                    <span className="text-muted-foreground">
                      {row.oldQty ?? "—"}
                    </span>
                    {" → "}
                    <span className="font-medium">{row.newQty}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Секция 2 — Не найдено в базе */}
        {preview.unmatched.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-yellow-600">
              Не найдено в базе ({preview.unmatched.length})
            </h3>
            <p className="text-xs text-muted-foreground">
              Эти строки будут пропущены, но не заблокируют импорт.
            </p>
            <div className="rounded border bg-muted/30 max-h-32 overflow-y-auto text-xs">
              {preview.unmatched.map((u, i) => (
                <div key={i} className="px-3 py-1 flex items-center justify-between">
                  <span className="font-mono">{u.sku}</span>
                  {u.skuRaw !== u.sku && (
                    <span className="text-muted-foreground ml-2">
                      (из «{u.skuRaw}»)
                    </span>
                  )}
                  <span className="tabular-nums ml-auto">qty {u.newQty}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Секция 3 — Дубликаты в файле */}
        {preview.duplicates.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-yellow-600">
              Дубликаты в файле ({preview.duplicates.length})
            </h3>
            <p className="text-xs text-muted-foreground">
              Применится последнее значение каждого артикула.
            </p>
            <div className="rounded border bg-muted/30 max-h-32 overflow-y-auto text-xs">
              {preview.duplicates.map((d) => (
                <div key={d.key} className="px-3 py-1 flex items-center justify-between">
                  <span className="font-mono">{d.key}</span>
                  <span className="text-muted-foreground ml-2">
                    {d.occurrences}× — применится qty {d.lastQty}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Секция 4 — Невалидные строки */}
        {totalInvalidCount > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-destructive">
              Невалидные строки ({totalInvalidCount})
            </h3>
            <div className="rounded border bg-muted/30 max-h-32 overflow-y-auto text-xs">
              {preview.invalid.map((inv, i) => (
                <div key={i} className="px-3 py-1">
                  <span className="font-mono">{inv.skuRaw}</span>
                  {" — "}
                  <span className="text-destructive">{inv.error}</span>
                </div>
              ))}
              {preview.invalidParseRows.map((rowIndex) => (
                <div key={`row-${rowIndex}`} className="px-3 py-1 text-muted-foreground">
                  Строка {rowIndex} — пустой артикул или некорректное количество
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isApplying}
          >
            Отмена
          </Button>
          <Button
            onClick={onApply}
            disabled={validCount === 0 || isApplying}
            title={
              validCount === 0
                ? "Нет корректных строк для импорта"
                : undefined
            }
          >
            {isApplying
              ? "Применить..."
              : `Применить (${validCount} строк)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
