"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"

export function SupportSyncButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function onClick() {
    if (loading) return
    setLoading(true)
    const toastId = toast.loading("Синхронизация с WB...")
    try {
      const res = await fetch("/api/support-sync", { method: "POST" })
      const body = await res.json()
      if (!res.ok || !body.ok) {
        toast.error(body.error ?? "Ошибка синхронизации", { id: toastId })
      } else {
        const summary = `Отзывы: ${body.feedbacksSynced ?? 0}, вопросы: ${body.questionsSynced ?? 0}, медиа: ${body.mediaSaved ?? 0}`
        toast.success(`Готово. ${summary}`, { id: toastId })
        router.refresh()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Сеть недоступна", {
        id: toastId,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button onClick={onClick} disabled={loading} size="sm" variant="outline">
      <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
      Синхронизировать
    </Button>
  )
}
