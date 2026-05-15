"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Star } from "lucide-react"
import { Button } from "@/components/ui/button"

// 2026-05-15: после слияния v4 storefront sync в /api/wb-ratings-sync
// одна кнопка делает 2 шага:
//   1. v4 batch (~45с) → wbStoreRating + wbStoreFeedbacks (точные WB-витрина значения)
//   2. Feedbacks API sweep + WB time-decay формула → ratingImt/reviewsTotalImt (наш расчёт)
// Если Шаг 2 заблокирован (cooldown bucket) — частичный успех со Шага 1.

interface StorefrontResult {
  totalCards: number
  v4Batches: number
  updated: number
  failed: boolean
}

interface OurAggregateResult {
  skipped: boolean
  reason?: string
  retryAfterSec?: number
  totalProcessed?: number
  updatedNmIds?: number
  updatedImtGroups?: number
  perNmIdCount?: number
  perImtIdCount?: number
  diagnostics?: {
    totalFeedbacks: number
    excludedByState: number
    excludedByAge: number
    includedInAggregate: number
    states: Record<string, number>
  }
}

interface SyncResponse {
  ok: boolean
  partial: boolean
  storefront: StorefrontResult
  ourAggregate: OurAggregateResult
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
        const sf = data.storefront
        const our = data.ourAggregate

        // Главная информация — что обновили с витрины WB (быстрый и точный шаг).
        const sfNote = sf.failed
          ? `WB-витрина: ОШИБКА (v4 недоступен)`
          : `WB-витрина: ${sf.updated} из ${sf.totalCards} карточек`

        // Информация по нашему расчёту.
        let ourNote: string
        if (our.skipped) {
          ourNote = `Наш агрегат пропущен — ${our.reason ?? "cooldown"}`
        } else {
          const diag = our.diagnostics
          const exclNote = diag
            ? `, исключено ${diag.excludedByState} обнулённых + ${diag.excludedByAge} старее 2 лет`
            : ""
          ourNote = `Наш агрегат (по WB-формуле): ${our.updatedNmIds} карточек / ${our.updatedImtGroups} склеек${exclNote}`
        }

        if (data.partial) {
          toast.warning(`${sfNote}\n${ourNote}`, { duration: 12000 })
        } else {
          toast.success(`${sfNote}\n${ourNote}`, { duration: 12000 })
        }

        console.info("[ratings-sync]", { storefront: sf, ourAggregate: our })
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
      title="Обновление рейтингов: (1) точные WB-витрина значения через card.wb.ru v4 ~45с, (2) наш расчёт по WB time-decay формуле через Feedbacks API ~минуты"
    >
      <Star className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
      {isSyncing ? "Рейтинги…" : "Рейтинги"}
    </Button>
  )
}
