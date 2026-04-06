"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export function WbSyncButton() {
  const [isSyncing, setIsSyncing] = useState(false)
  const router = useRouter()

  async function handleSync() {
    setIsSyncing(true)
    try {
      const res = await fetch("/api/wb-sync", { method: "POST" })
      const data = await res.json()

      if (res.ok) {
        toast.success(`Синхронизировано: ${data.synced} из ${data.total} карточек`)
        if (data.errors?.length) {
          toast.error(`Ошибки: ${data.errors.length}. Проверьте логи.`)
        }
        router.refresh()
      } else {
        toast.error(data.error || "Ошибка синхронизации")
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
      className="gap-2"
    >
      <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
      {isSyncing ? "Синхронизация…" : "Синхронизировать с WB"}
    </Button>
  )
}
