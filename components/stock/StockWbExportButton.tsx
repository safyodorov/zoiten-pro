// components/stock/StockWbExportButton.tsx
// Quick 260702: кнопка «Экспорт» в тулбаре /stock/wb.
// GET /api/stock-wb-export с текущими фильтрами страницы → скачивание xlsx.
// Экспорт долгий (фото с WB CDN) → toast.loading + fetch/blob вместо window.open.

"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { Download } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

const FILTER_KEYS = ["directions", "brands", "categories", "subcategories"] as const

export function StockWbExportButton() {
  const [isLoading, setIsLoading] = useState(false)
  const searchParams = useSearchParams()

  const handleClick = async () => {
    if (isLoading) return
    setIsLoading(true)
    const toastId = toast.loading("Формируем Excel с фото — может занять до минуты…")

    try {
      const qs = new URLSearchParams()
      for (const key of FILTER_KEYS) {
        const v = searchParams.get(key)
        if (v) qs.set(key, v)
      }
      const query = qs.toString()
      const res = await fetch(`/api/stock-wb-export${query ? `?${query}` : ""}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const blob = await res.blob()
      const disposition = res.headers.get("Content-Disposition") ?? ""
      const match = disposition.match(/filename\*=UTF-8''([^;]+)/)
      const filename = match
        ? decodeURIComponent(match[1])
        : "stock-wb-export.xlsx"

      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)

      toast.dismiss(toastId)
      toast.success("Excel выгружен")
    } catch (e) {
      toast.dismiss(toastId)
      const message = e instanceof Error ? e.message : "Ошибка сети"
      toast.error(`Не удалось выгрузить Excel: ${message}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={isLoading}>
      <Download className={`mr-2 h-4 w-4${isLoading ? " animate-pulse" : ""}`} />
      {isLoading ? "Экспорт…" : "Экспорт"}
    </Button>
  )
}
