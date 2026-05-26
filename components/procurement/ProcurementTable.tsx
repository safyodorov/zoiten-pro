"use client"

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
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={7}
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
  const [qtyStr, setQtyStr] = useState<string>(String(row.orderedQty ?? 0))
  const [dateStr, setDateStr] = useState<string>(row.expectedDate ?? "")
  const [savingQty, setSavingQty] = useState(false)
  const [savingDate, setSavingDate] = useState(false)
  const [, startTransition] = useTransition()
  const qtyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Если данные с сервера обновились (revalidatePath) — синхронизируем формы.
  useEffect(() => {
    setQtyStr(String(row.orderedQty ?? 0))
  }, [row.orderedQty])
  useEffect(() => {
    setDateStr(row.expectedDate ?? "")
  }, [row.expectedDate])

  function saveQty(rawValue: string) {
    const parsed = rawValue === "" ? 0 : parseInt(rawValue, 10)
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Невалидное число")
      return
    }
    setSavingQty(true)
    startTransition(async () => {
      const result = await upsertProductIncoming({
        productId: row.id,
        orderedQty: parsed,
      })
      setSavingQty(false)
      if (!result.ok) toast.error(result.error)
    })
  }

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

  function handleQtyChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setQtyStr(value)
    if (qtyTimer.current) clearTimeout(qtyTimer.current)
    qtyTimer.current = setTimeout(() => saveQty(value), 500)
  }

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setDateStr(value)
    if (dateTimer.current) clearTimeout(dateTimer.current)
    dateTimer.current = setTimeout(() => saveDate(value), 500)
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
        <Input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={qtyStr}
          onChange={handleQtyChange}
          disabled={!canManage}
          className={`h-8 ${savingQty ? "border-primary" : ""}`}
        />
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
    </TableRow>
  )
}
