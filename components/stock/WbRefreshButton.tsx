// components/stock/WbRefreshButton.tsx
// Phase 14 (STOCK-15): Primary CTA «Обновить из WB» в шапке /stock.
//
// Вызывает POST /api/wb-sync (расширен в Plan 14-03 per-warehouse).
// Длительность ~1-2 мин → обязателен toast.loading с dismiss.
//
// Паттерн: components/cards/WbSyncButton.tsx + toast.loading/dismiss из plan 07-10.

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

// ──────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────

export function WbRefreshButton() {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleClick = async () => {
    if (isLoading) return
    setIsLoading(true)

    const toastId = toast.loading("Загружаем остатки из WB…")

    try {
      const res = await fetch("/api/wb-sync", { method: "POST" })
      toast.dismiss(toastId)

      if (!res.ok) {
        let errorText = `HTTP ${res.status}`
        try {
          const body = await res.json()
          if (body?.error) errorText = String(body.error)
        } catch {
          // тело не JSON — используем статус
        }
        toast.error(
          `Не удалось обновить остатки из WB: ${errorText}. Повторите через минуту.`
        )
        return
      }

      toast.success("WB остатки обновлены")
      router.refresh()
    } catch (e) {
      toast.dismiss(toastId)
      const message = e instanceof Error ? e.message : "Ошибка сети"
      toast.error(
        `Не удалось обновить остатки из WB: ${message}. Повторите через минуту.`
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button onClick={handleClick} disabled={isLoading}>
      <RefreshCw
        className={`mr-2 h-4 w-4${isLoading ? " animate-spin" : ""}`}
      />
      {isLoading ? "Обновление…" : "Обновить из WB"}
    </Button>
  )
}
