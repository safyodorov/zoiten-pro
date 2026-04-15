// components/prices/PriceCalculatorTableWrapper.tsx
// Phase 7 (план 07-09): клиентская обёртка над PriceCalculatorTable —
// управляет state открытой модалки PricingCalculatorDialog.
//
// RSC страница /prices/wb/page.tsx не может использовать useState,
// поэтому обёртка нужна чтобы:
//  1. Хранить selectedRow/card для открытой модалки
//  2. Передавать onRowClick в серверную таблицу
//  3. Рендерить <PricingCalculatorDialog> условно при наличии state

"use client"

import { useState } from "react"

import {
  PriceCalculatorTable,
  type ProductGroup,
  type PriceRow,
  type WbCardRowGroup,
} from "@/components/prices/PriceCalculatorTable"
import { PricingCalculatorDialog } from "@/components/prices/PricingCalculatorDialog"

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
  const [dialog, setDialog] = useState<DialogState | null>(null)

  const handleRowClick = (
    card: WbCardRowGroup["card"],
    row: PriceRow,
    productId: string,
  ) => {
    // Найти Product name для DialogTitle
    const group = groups.find((g) => g.product.id === productId)
    const productName = group?.product.name ?? "Карточка"
    setDialog({ card: { ...card, name: productName }, row })
  }

  return (
    <>
      <PriceCalculatorTable
        groups={groups}
        onRowClick={handleRowClick}
        initialColumnWidths={initialColumnWidths}
        initialHiddenColumns={initialHiddenColumns}
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
