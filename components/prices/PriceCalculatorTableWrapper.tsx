// components/prices/PriceCalculatorTableWrapper.tsx
// Клиентская обёртка над PriceCalculatorTable:
//   1. Управляет state открытой модалки PricingCalculatorDialog
//   2. Хранит selectedCalcIds для массового удаления расчётных цен
//   3. Рендерит вспомогательный UI (модалка + дальнейшее)

"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import {
  PriceCalculatorTable,
  type ProductGroup,
  type PriceRow,
  type WbCardRowGroup,
} from "@/components/prices/PriceCalculatorTable"
import { PricingCalculatorDialog } from "@/components/prices/PricingCalculatorDialog"
import { deleteCalculatedPrices } from "@/app/actions/pricing"

interface PriceCalculatorTableWrapperProps {
  groups: ProductGroup[]
  /** Сохранённые ширины столбцов из UserPreference (план 260410-mya). */
  initialColumnWidths?: Record<string, number>
  /** Сохранённый список скрытых колонок (фильтр «Вид»). */
  initialHiddenColumns?: string[]
}

interface DialogState {
  card: WbCardRowGroup["card"] & { name?: string }
  row: PriceRow
}

export function PriceCalculatorTableWrapper({
  groups,
  initialColumnWidths,
  initialHiddenColumns,
}: PriceCalculatorTableWrapperProps) {
  const router = useRouter()
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [selectedCalcIds, setSelectedCalcIds] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()

  const handleRowClick = (
    card: WbCardRowGroup["card"],
    row: PriceRow,
    productId: string,
  ) => {
    const group = groups.find((g) => g.product.id === productId)
    const productName = group?.product.name ?? "Карточка"
    setDialog({ card: { ...card, name: productName }, row })
  }

  const toggleCalcSelection = (calcId: string) => {
    setSelectedCalcIds((prev) => {
      const next = new Set(prev)
      if (next.has(calcId)) next.delete(calcId)
      else next.add(calcId)
      return next
    })
  }

  const clearSelection = () => setSelectedCalcIds(new Set())

  const handleDeleteSelected = () => {
    const ids = Array.from(selectedCalcIds)
    if (ids.length === 0) return
    const ok = window.confirm(
      `Удалить расчётных цен: ${ids.length}? Действие нельзя отменить.`,
    )
    if (!ok) return
    startTransition(async () => {
      const result = await deleteCalculatedPrices(ids)
      if (result.ok) {
        toast.success(
          `Удалено расчётных цен: ${result.data?.deleted ?? ids.length}`,
        )
        clearSelection()
        router.refresh()
      } else {
        toast.error(result.error || "Не удалось удалить")
      }
    })
  }

  return (
    <>
      <PriceCalculatorTable
        groups={groups}
        onRowClick={handleRowClick}
        initialColumnWidths={initialColumnWidths}
        initialHiddenColumns={initialHiddenColumns}
        selectedCalcIds={selectedCalcIds}
        onToggleCalcSelection={toggleCalcSelection}
        onDeleteSelected={
          selectedCalcIds.size > 0 ? handleDeleteSelected : undefined
        }
      />

      {dialog && (
        <PricingCalculatorDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setDialog(null)
          }}
          card={{
            id: dialog.card.id,
            nmId: dialog.card.nmId,
            name: dialog.card.name,
          }}
          row={dialog.row}
        />
      )}
    </>
  )
}
