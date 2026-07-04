"use client"

// components/sales-plan/VirtualPurchaseDialog.tsx
// Модалка правки виртуальной закупки.
// ИНВАРИАНТ: orderDate min=today, expectedArrivalDate min=orderDate+leadTimeDays.
// Phase 25-07 (Task 3)

import { useState, useTransition, useEffect } from "react"
import { updateVirtualPurchase } from "@/app/actions/sales-plan"

interface Supplier {
  id: string
  nameForeign: string
  nameEnglish: string
}

interface VirtualPurchaseDialogProps {
  id: string
  qty: number
  orderDate: string          // ISO
  expectedArrivalDate: string
  leadTimeDaysUsed: number | null
  supplierId: string | null
  unitPrice: string | null   // Decimal as string
  currency: string
  productName: string
  suppliers: Supplier[]
  defaultLeadTimeDays: number
  today: string
  onClose: () => void
  onSuccess: () => void
}

export function VirtualPurchaseDialog({
  id,
  qty: initialQty,
  orderDate: initialOrderDate,
  expectedArrivalDate: initialArrival,
  leadTimeDaysUsed,
  supplierId: initialSupplierId,
  unitPrice: initialUnitPrice,
  currency: initialCurrency,
  productName,
  suppliers,
  defaultLeadTimeDays,
  today,
  onClose,
  onSuccess,
}: VirtualPurchaseDialogProps) {
  const [qty, setQty] = useState(initialQty)
  const [orderDate, setOrderDate] = useState(initialOrderDate)
  const [supplierId, setSupplierId] = useState(initialSupplierId ?? "")
  const [expectedArrivalDate, setExpectedArrivalDate] = useState(initialArrival)
  const [unitPrice, setUnitPrice] = useState(initialUnitPrice ?? "")
  const [currency, setCurrency] = useState(initialCurrency)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const leadTime = leadTimeDaysUsed ?? defaultLeadTimeDays

  // Вычисляем min expectedArrivalDate = orderDate + leadTimeDays
  function addDays(iso: string, n: number): string {
    const d = new Date(iso + "T00:00:00Z")
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }

  const minArrival = addDays(orderDate, leadTime)

  // При смене orderDate — скорректировать arrival если нужно
  useEffect(() => {
    const minArr = addDays(orderDate, leadTime)
    if (expectedArrivalDate < minArr) setExpectedArrivalDate(minArr)
  }, [orderDate, leadTime]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const result = await updateVirtualPurchase({
        id,
        qty,
        orderDate,
        expectedArrivalDate,
        supplierId: supplierId || null,
        unitPrice: unitPrice ? parseFloat(unitPrice) : null,
      })
      if (!result.ok) {
        setError(result.error ?? "Ошибка сохранения")
      } else {
        onSuccess()
      }
    })
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-background border rounded-lg shadow-lg w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h2 className="text-base font-semibold">Изменить предложение</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none"
              aria-label="Закрыть"
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-4 space-y-4">
            <div className="text-sm text-muted-foreground">{productName}</div>

            {/* Количество */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Количество, шт</label>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Дата заказа */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Дата заказа</label>
              <input
                type="date"
                min={today}
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value || today)}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">Не ранее сегодня</p>
            </div>

            {/* Поставщик */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Поставщик</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">— не выбран —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nameForeign} ({s.nameEnglish})
                  </option>
                ))}
              </select>
            </div>

            {/* Дата прихода */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Плановый приход</label>
              <input
                type="date"
                min={minArrival}
                value={expectedArrivalDate}
                onChange={(e) => setExpectedArrivalDate(e.target.value || minArrival)}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Не ранее {orderDate} + {leadTime} дн. = {minArrival}
              </p>
            </div>

            {/* Цена */}
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-sm font-medium">Цена ед.</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={unitPrice}
                  placeholder="—"
                  onChange={(e) => setUnitPrice(e.target.value)}
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="w-24 space-y-1">
                <label className="text-sm font-medium">Валюта</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="CNY">CNY</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="RUB">RUB</option>
                </select>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-6 py-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md border hover:bg-muted transition-colors"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isPending ? "Сохранение..." : "Сохранить"}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
