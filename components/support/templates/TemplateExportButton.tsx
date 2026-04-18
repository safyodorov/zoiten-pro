"use client"

// components/support/templates/TemplateExportButton.tsx
// Кнопка «Экспорт» — вызывает server action exportTemplatesJson и скачивает
// результат как JSON файл через Blob + a[download]. Заменяет отключённый
// WB Templates sync API (D-01).

import { useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import { exportTemplatesJson } from "@/app/actions/templates"

export function TemplateExportButton() {
  const [isPending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      const res = await exportTemplatesJson()
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      const blob = new Blob([res.json], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `zoiten-templates-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success("Экспорт готов")
    })
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={isPending}>
      <Download className="h-4 w-4 mr-1" />
      {isPending ? "Экспорт..." : "Экспорт"}
    </Button>
  )
}
