// components/prices/WbBoxTariffsSyncButton.tsx
// Фаза B (2026-07-07): кнопка «Тарифы складов» — POST /api/wb-box-tariffs-sync.
// Паттерн WbSyncSppButton (components/cards/WbSyncSppButton.tsx).

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Warehouse } from "lucide-react"
import { Button } from "@/components/ui/button"

export function WbBoxTariffsSyncButton() {
  const [isSyncing, setIsSyncing] = useState(false)
  const router = useRouter()

  async function handleSync() {
    setIsSyncing(true)
    try {
      const res = await fetch("/api/wb-box-tariffs-sync", { method: "POST" })
      const data = await res.json()

      if (res.ok) {
        toast.success(`Тарифы складов обновлены: ${data.warehouses} складов`)
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
      <Warehouse className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
      {isSyncing ? "Тарифы…" : "Тарифы складов"}
    </Button>
  )
}
