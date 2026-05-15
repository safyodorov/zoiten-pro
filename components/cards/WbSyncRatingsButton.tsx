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
        const diag = data.diagnostics as
          | {
              totalFeedbacks: number
              excludedByState: number
              excludedByAge: number
              includedInAggregate: number
            }
          | undefined
        const excludedNote = diag
          ? ` · исключено ${diag.excludedByState} обнулённых, ${diag.excludedByAge} старее 2 лет`
          : ""
        toast.success(
          `Рейтинги: ${data.updatedNmIds} карточек / ${data.updatedImtGroups} склеек (учтено ${diag?.includedInAggregate ?? data.totalProcessed} из ${data.totalProcessed} отзывов${excludedNote})`,
          { duration: 10000 }
        )
        console.info("[ratings-sync] diagnostics", diag)
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
