"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Percent } from "lucide-react"
import { Button } from "@/components/ui/button"

export function WbSyncSppButton() {
  const [isSyncing, setIsSyncing] = useState(false)
  const router = useRouter()

  async function handleSync() {
    setIsSyncing(true)
    try {
      const res = await fetch("/api/wb-sync-spp", { method: "POST" })
      const data = await res.json()

      if (res.ok) {
        const source = data.usedFallback ? " (fallback)" : " (v4)"
        toast.success(`Скидка WB обновлена: ${data.updated} карточек${source}`)
        router.refresh()
      } else {
        toast.error(data.error || "Ошибка")
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
    >
      <Percent className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
      {isSyncing ? "СПП…" : "Скидка WB"}
    </Button>
  )
}
