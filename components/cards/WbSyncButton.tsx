"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

// 2026-05-11: cooldown 5 минут после успешного запуска. Защита от случайных повторных
// нажатий — WB API лимиты (Tariffs 100/час, Statistics 5/мин, Analytics 3/день) легко
// исчерпываются если жать sync несколько раз подряд → 429 → разваливает синхронизацию.
const COOLDOWN_MS = 5 * 60 * 1000
const STORAGE_KEY = "zoiten.wbSync.lastRun"

function formatMmSs(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

export function WbSyncButton() {
  const [isSyncing, setIsSyncing] = useState(false)
  const [cooldownLeft, setCooldownLeft] = useState(0)
  const router = useRouter()

  // Tick cooldown timer
  useEffect(() => {
    function tick() {
      const last = Number(localStorage.getItem(STORAGE_KEY) ?? 0)
      const left = Math.max(0, last + COOLDOWN_MS - Date.now())
      setCooldownLeft(left)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  async function handleSync() {
    if (cooldownLeft > 0) {
      toast.error(`Подождите ${formatMmSs(cooldownLeft)} до следующей синхронизации`)
      return
    }
    setIsSyncing(true)
    try {
      const res = await fetch("/api/wb-sync", { method: "POST" })
      const data = await res.json()

      if (res.ok) {
        toast.success(`Синхронизировано: ${data.synced} из ${data.total} карточек`)
        if (data.errors?.length) {
          toast.error(`Ошибки: ${data.errors.length}. Проверьте логи.`)
        }
        localStorage.setItem(STORAGE_KEY, String(Date.now()))
        router.refresh()
      } else {
        toast.error(data.error || "Ошибка синхронизации")
      }
    } catch {
      toast.error("Ошибка сети")
    }
    setIsSyncing(false)
  }

  const disabled = isSyncing || cooldownLeft > 0
  const label = isSyncing
    ? "Синхронизация…"
    : cooldownLeft > 0
      ? `Подождите ${formatMmSs(cooldownLeft)}`
      : "Синхронизировать с WB"

  return (
    <Button
      onClick={handleSync}
      disabled={disabled}
      variant="outline"
      className="gap-2"
      title={
        cooldownLeft > 0
          ? "Защита от частых запусков (WB API rate limits)"
          : undefined
      }
    >
      <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
      {label}
    </Button>
  )
}
