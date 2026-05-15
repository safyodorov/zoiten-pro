"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { History } from "lucide-react"

export function WbOrdersBackfillButton() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleClick() {
    if (!confirm("Перезагрузить заказы с 2026-04-01? Может занять до минуты."))
      return
    setLoading(true)
    const id = toast.loading("Backfill заказов с 2026-04-01…")
    try {
      const res = await fetch("/api/wb-orders-backfill", { method: "POST" })
      const data = await res.json()
      toast.dismiss(id)
      if (data.ok) {
        toast.success(`Backfill завершён: ${data.upserted} строк`)
        router.refresh()
      } else if (res.status === 429) {
        toast.error(
          `Rate limit WB: retry через ${data.retryAfterSec ?? "?"}s`,
        )
      } else {
        toast.error(data.error ?? "Ошибка backfill")
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
      <History className="h-4 w-4 mr-1" />
      Backfill заказов
    </Button>
  )
}
