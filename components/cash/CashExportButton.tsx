"use client"

// components/cash/CashExportButton.tsx
// Phase 23: выгрузка кассы в XLSX (резервное хранение). Передаёт текущие фильтры
// URL в /api/cash-export, чтобы выгрузить именно то, что отфильтровано на экране.

import { useSearchParams } from "next/navigation"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"

export function CashExportButton() {
  const searchParams = useSearchParams()

  function handleExport() {
    const qs = searchParams.toString()
    // открываем download-роут (Content-Disposition: attachment → скачивание файла)
    window.location.href = `/api/cash-export${qs ? `?${qs}` : ""}`
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
      <Download className="h-4 w-4" />
      Выгрузить Excel
    </Button>
  )
}
