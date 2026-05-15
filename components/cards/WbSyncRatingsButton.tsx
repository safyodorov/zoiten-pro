"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Star } from "lucide-react"
import { Button } from "@/components/ui/button"

// 2026-05-15 (v3): источник рейтингов — buyer-side endpoint feedbacks1.wb.ru.
// Возвращает уже отфильтрованные WB агрегаты (NLP-filter applied). Точное
// совпадение с витриной. Sync делает 2 шага:
//   Шаг 1 (~45с): card.wb.ru v4 — fallback wbStoreRating/Feedbacks per nmId.
//   Шаг 2 (~30с): feedbacks1.wb.ru per imt — основной источник рейтингов.

interface StorefrontV4Result {
  totalCards: number
  v4Batches: number
  updated: number
  failed: boolean
}

interface StorefrontResult {
  imtsFetched: number
  imtsFailed: number
  updatedNmIds: number
  updatedImts: number
  totalFeedbacksIncluded: number
  totalFeedbacksAllTime: number
}

interface SyncResponse {
  ok: boolean
  storefrontV4: StorefrontV4Result
  storefront: StorefrontResult
  error?: string
}

export function WbSyncRatingsButton() {
  const [isSyncing, setIsSyncing] = useState(false)
  const router = useRouter()

  async function handleSync() {
    setIsSyncing(true)
    try {
      const res = await fetch("/api/wb-ratings-sync", { method: "POST" })
      const data = (await res.json()) as SyncResponse

      if (res.ok && data.ok) {
        const v4 = data.storefrontV4
        const sf = data.storefront

        const v4Note = v4.failed
          ? `v4: ошибка (${v4.updated}/${v4.totalCards})`
          : `v4: ${v4.updated}/${v4.totalCards} карточек`
        const sfNote = `Витрина: ${sf.updatedImts} склеек, ${sf.updatedNmIds} карточек, ${sf.totalFeedbacksIncluded} учтённых / ${sf.totalFeedbacksAllTime} всего отзывов`

        toast.success(`${sfNote}\n${v4Note}`, { duration: 10000 })
        console.info("[ratings-sync]", { storefrontV4: v4, storefront: sf })
        router.refresh()
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
      title="Обновление рейтингов с витрины WB через feedbacks1.wb.ru — точное совпадение с тем что видит покупатель (NLP-фильтр невалидных отзывов применён WB-стороной)"
    >
      <Star className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
      {isSyncing ? "Рейтинги…" : "Рейтинги"}
    </Button>
  )
}
