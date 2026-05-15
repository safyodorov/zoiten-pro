"use client"
// components/cards/WbPricesRetroactiveBackfillButton.tsx
// 2026-05-15 (quick 260515-o4o): кнопка одноразового retro backfill цен в WbCardOrdersDaily.
// Безопасно повторять — UPDATE'ит только строки с sellerPrice IS NULL.

import { useState } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Coins } from "lucide-react"

export function WbPricesRetroactiveBackfillButton() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleClick() {
    if (
      !confirm(
        "Заполнить sellerPrice/buyerPrice для всех существующих строк WbCardOrdersDaily сегодняшними значениями? Безопасно повторять — будут обновлены только пустые строки.",
      )
    )
      return
    setLoading(true)
    const id = toast.loading("Backfill цен ретроактивно…")
    try {
      const res = await fetch("/api/wb-prices-retroactive-backfill", {
        method: "POST",
      })
      const data = await res.json()
      toast.dismiss(id)
      if (data.ok) {
        toast.success(
          `Backfill цен завершён: ${data.rowsUpdated} строк обновлено`,
        )
        router.refresh()
      } else {
        toast.error(data.error ?? "Ошибка backfill цен")
      }
    } catch (e) {
      toast.dismiss(id)
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={loading}
      onClick={handleClick}
    >
      <Coins className="h-4 w-4 mr-1" />
      Backfill цен
    </Button>
  )
}
