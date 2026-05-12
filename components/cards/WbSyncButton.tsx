"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  buildPartialSyncMessage,
  formatRetryAfter,
  formatUnlockTime,
  type SyncFailure,
} from "@/lib/wb-sync-format"

// 2026-05-11: cooldown 5 минут после успешного запуска. Защита от случайных повторных
// нажатий — WB API лимиты (Tariffs 100/час, Statistics 5/мин, Analytics 3/день) легко
// исчерпываются если жать sync несколько раз подряд → 429 → разваливает синхронизацию.
//
// 2026-05-12: если последний sync вернул `failures[]` с retry-after — cooldown
// растягивается до max(retryAfterSec). Это уже не «вежливый» fix, а реальное
// уважение к WB rate-limit (раньше retryFetch бил в стену каждые 1/5/15 сек).
const COOLDOWN_DEFAULT_MS = 5 * 60 * 1000
const STORAGE_KEY_LAST_RUN = "zoiten.wbSync.lastRun"
const STORAGE_KEY_UNLOCK_AT = "zoiten.wbSync.unlockAt"

function formatMmSs(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

function readCooldownLeft(): number {
  const last = Number(localStorage.getItem(STORAGE_KEY_LAST_RUN) ?? 0)
  const unlockAt = Number(localStorage.getItem(STORAGE_KEY_UNLOCK_AT) ?? 0)
  const baseLeft = Math.max(0, last + COOLDOWN_DEFAULT_MS - Date.now())
  const rateLimitLeft = Math.max(0, unlockAt - Date.now())
  return Math.max(baseLeft, rateLimitLeft)
}

export function WbSyncButton() {
  const [isSyncing, setIsSyncing] = useState(false)
  const [cooldownLeft, setCooldownLeft] = useState(0)
  const router = useRouter()

  // Tick cooldown timer
  useEffect(() => {
    function tick() {
      setCooldownLeft(readCooldownLeft())
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
      const data: {
        synced?: number
        total?: number
        failures?: SyncFailure[]
        errors?: string[]
        error?: string
      } = await res.json()

      if (res.ok) {
        const failures = data.failures ?? []
        localStorage.setItem(STORAGE_KEY_LAST_RUN, String(Date.now()))

        if (failures.length === 0) {
          toast.success(`Синхронизировано: ${data.synced} из ${data.total} карточек`)
          localStorage.removeItem(STORAGE_KEY_UNLOCK_AT)
        } else {
          // 2026-05-12: партсинк → жёлтый toast вместо ложного «успех»
          const msg = buildPartialSyncMessage(failures)
          toast.warning(msg.title, {
            description: msg.description,
            duration: 15_000,
          })
          if (msg.maxRetryAfterSec > 0) {
            const unlockAt = Date.now() + msg.maxRetryAfterSec * 1000
            localStorage.setItem(STORAGE_KEY_UNLOCK_AT, String(unlockAt))
            toast.info(
              `Следующая попытка через ${formatRetryAfter(msg.maxRetryAfterSec)} (до ${formatUnlockTime(msg.maxRetryAfterSec)} МСК) — кнопка разблокируется автоматически`,
              { duration: 10_000 },
            )
          }
        }
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
