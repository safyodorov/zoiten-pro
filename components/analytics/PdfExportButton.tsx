"use client"

// components/analytics/PdfExportButton.tsx
// Phase 30 (ANL-11, req.6/req.11) — кнопка «Скачать PDF». Читает АКТИВНЫЙ ?sort= из URL и строит
// ссылку на pdf-route с тем же порядком → порядок PDF всегда = экранной сортировке.
// Обычный <a download> со строкой URL (БЕЗ импорта pdf-route).
import { useSearchParams } from "next/navigation"
import { FileDown } from "lucide-react"

export function PdfExportButton({ runId }: { runId: string }) {
  const searchParams = useSearchParams()
  const sort = searchParams.get("sort") === "clickToOrder" ? "clickToOrder" : "revenue"
  const href = `/api/analytics/runs/${runId}/pdf?sort=${sort}`

  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted/40 transition-colors"
    >
      <FileDown className="h-4 w-4" />
      Скачать PDF
    </a>
  )
}
