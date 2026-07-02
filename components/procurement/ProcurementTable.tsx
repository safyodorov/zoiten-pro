"use client"

// Количество «Заказано» read-only (авто из открытых закупок PLANNED+ACTIVE,
// quick 260702-j52) — ручной ввод закрыт. Дата прихода и план продаж редактируемы.

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { upsertProductIncoming } from "@/app/actions/procurement"

interface ProcurementRowData {
  id: string
  name: string
  photoUrl: string | null
  brandName: string
  categoryName: string | null
  subcategoryName: string | null
  orderedQty: number
  expectedDate: string | null // YYYY-MM-DD или null
  plannedSalesPerDay: number | null
}

interface ProcurementTableProps {
  rows: ProcurementRowData[]
  canManage: boolean
}

export function ProcurementTable({ rows, canManage }: ProcurementTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Фото</TableHead>
            <TableHead className="max-w-[260px]">Наименование</TableHead>
            <TableHead>Бренд</TableHead>
            <TableHead>Категория</TableHead>
            <TableHead>Подкатегория</TableHead>
            <TableHead className="w-44">Заказано в Китае</TableHead>
            <TableHead className="w-44">Плановая дата прихода</TableHead>
            <TableHead className="w-44">План продаж после прихода, шт/день</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={8}
                className="text-center py-12 text-muted-foreground"
              >
                Товары не найдены
              </TableCell>
            </TableRow>
          )}
          {rows.map((row) => (
            <ProcurementRow key={row.id} row={row} canManage={canManage} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function ProcurementRow({
  row,
  canManage,
}: {
  row: ProcurementRowData
  canManage: boolean
}) {
  const [dateStr, setDateStr] = useState<string>(row.expectedDate ?? "")
  const [salesStr, setSalesStr] = useState<string>(
    row.plannedSalesPerDay !== null ? String(row.plannedSalesPerDay) : "",
  )
  const [savingDate, setSavingDate] = useState(false)
  const [savingSales, setSavingSales] = useState(false)
  const [, startTransition] = useTransition()
  const dateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const salesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Если данные с сервера обновились (revalidatePath) — синхронизируем формы.
  useEffect(() => {
    setDateStr(row.expectedDate ?? "")
  }, [row.expectedDate])
  useEffect(() => {
    setSalesStr(row.plannedSalesPerDay !== null ? String(row.plannedSalesPerDay) : "")
  }, [row.plannedSalesPerDay])

  function saveDate(rawValue: string) {
    setSavingDate(true)
    startTransition(async () => {
      const result = await upsertProductIncoming({
        productId: row.id,
        expectedDate: rawValue === "" ? null : rawValue,
      })
      setSavingDate(false)
      if (!result.ok) toast.error(result.error)
    })
  }

  function saveSales(rawValue: string) {
    const trimmed = rawValue.trim().replace(",", ".")
    let payload: number | null
    if (trimmed === "") {
      payload = null
    } else {
      const parsed = parseFloat(trimmed)
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast.error("Невалидное число")
        return
      }
      payload = parsed
    }
    setSavingSales(true)
    startTransition(async () => {
      const result = await upsertProductIncoming({
        productId: row.id,
        plannedSalesPerDay: payload,
      })
      setSavingSales(false)
      if (!result.ok) toast.error(result.error)
    })
  }

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setDateStr(value)
    if (dateTimer.current) clearTimeout(dateTimer.current)
    dateTimer.current = setTimeout(() => saveDate(value), 500)
  }

  function handleSalesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setSalesStr(value)
    if (salesTimer.current) clearTimeout(salesTimer.current)
    salesTimer.current = setTimeout(() => saveSales(value), 500)
  }

  return (
    <TableRow>
      <TableCell>
        {row.photoUrl ? (
          <img
            src={row.photoUrl}
            alt={row.name}
            className="w-12 h-16 object-cover rounded"
          />
        ) : (
          <div className="w-12 h-16 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
            —
          </div>
        )}
      </TableCell>
      <TableCell className="font-medium max-w-[260px]">
        <Link
          href={`/products/${row.id}/edit`}
          prefetch={false}
          className="hover:underline line-clamp-2"
        >
          {row.name}
        </Link>
      </TableCell>
      <TableCell>{row.brandName}</TableCell>
      <TableCell>
        {row.categoryName ?? <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell>
        {row.subcategoryName ?? (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {/* Read-only: количество считается автоматически из открытых закупок */}
        <span
          className={`tabular-nums ${(row.orderedQty ?? 0) === 0 ? "text-muted-foreground" : ""}`}
        >
          {row.orderedQty ?? 0}
        </span>
      </TableCell>
      <TableCell>
        <Input
          type="date"
          value={dateStr}
          onChange={handleDateChange}
          disabled={!canManage}
          className={`h-8 ${savingDate ? "border-primary" : ""}`}
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          step="0.1"
          inputMode="decimal"
          placeholder="—"
          value={salesStr}
          onChange={handleSalesChange}
          disabled={!canManage}
          className={`h-8 ${savingSales ? "border-primary" : ""}`}
        />
      </TableCell>
    </TableRow>
  )
}
