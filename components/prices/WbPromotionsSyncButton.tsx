// components/prices/WbPromotionsSyncButton.tsx
// Phase 7 (07-10): Кнопка синхронизации акций WB.
// Вызывает POST /api/wb-promotions-sync (см. 07-04). Показывает loading toast,
// т.к. запрос может занимать 30-90 сек из-за rate limit WB Promotions API.

"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Calendar, RefreshCw } from "lucide-react"
import { toast } from "sonner"

export function WbPromotionsSyncButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleClick = () => {
    startTransition(async () => {
      const loadingToast = toast.loading("Синхронизация акций…")

      try {
        const res = await fetch("/api/wb-promotions-sync", {
          method: "POST",
        })
        const data = await res.json()

        toast.dismiss(loadingToast)

        if (!res.ok) {
          throw new Error(
            data.error ||
              "Не удалось синхронизировать акции. Попробуйте ещё раз через минуту (WB API rate limit).",
          )
        }

        toast.success(
          `Синхронизировано ${data.synced ?? 0} акций, ${data.nomenclatures ?? 0} номенклатур`,
        )
        router.refresh()
      } catch (e) {
        toast.dismiss(loadingToast)
        toast.error((e as Error).message)
      }
    })
  }

  return (
    <Button
      variant="outline"
      onClick={handleClick}
      disabled={isPending}
      className="gap-2"
    >
      {isPending ? (
        <RefreshCw className="h-4 w-4 animate-spin" />
      ) : (
        <Calendar className="h-4 w-4" />
      )}
      {isPending ? "Синхронизация…" : "Синхронизировать акции"}
    </Button>
  )
}
