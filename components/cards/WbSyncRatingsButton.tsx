"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Star } from "lucide-react"
import { Button } from "@/components/ui/button"

export function WbSyncRatingsButton() {
  const [isSyncing, setIsSyncing] = useState(false)
  const router = useRouter()

  async function handleSync() {
    setIsSyncing(true)
    try {
      const res = await fetch("/api/wb-ratings-sync", { method: "POST" })
      const data = await res.json()

      if (res.ok) {
        toast.success(
          `Рейтинги обновлены: ${data.updatedNmIds} карточек / ${data.updatedImtGroups} склеек (обработано ${data.totalProcessed} отзывов)`,
          { duration: 8000 }
        )
        router.refresh()
      } else if (res.status === 429) {
        toast.warning(data.error || "WB Feedbacks API на cooldown", {
          duration: 10000,
        })
      } else if (res.status === 403) {
        toast.error("Нет доступа (нужны права MANAGE на «Товары»)")
      } else {
        toast.error(data.error || "Ошибка синхронизации рейтингов")
      }
    } catch {
      toast.error("Ошибка сети")
    }
    setIsSyncing(false)
  }

  return (
    <Button
      onClick={handleSync}
      disabled={isSyncing}
      variant="outline"
      size="sm"
      className="gap-1.5"
      title="Синхронизация рейтингов карточек и склеек через WB Feedbacks API. Может занять несколько минут — общий лимит с support-sync."
    >
      <Star className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
      {isSyncing ? "Рейтинги…" : "Рейтинги"}
    </Button>
  )
}
