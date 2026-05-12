// components/stock/WbRefreshButton.tsx
// Phase 14 (STOCK-15): Primary CTA «Обновить из WB» в шапке /stock.
//
// Вызывает POST /api/wb-sync (расширен в Plan 14-03 per-warehouse).
// Длительность ~1-2 мин → обязателен toast.loading с dismiss.
//
// 2026-05-12: добавлена партсинк-логика — failures[] от route → жёлтый toast,
// cooldown растягивается на max(retryAfterSec), общая localStorage с WbSyncButton.

"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  buildPartialSyncMessage,
  formatRetryAfter,
  formatUnlockTime,
  type SyncFailure,
} from "@/lib/wb-sync-format"

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

export function WbRefreshButton() {
  const [isLoading, setIsLoading] = useState(false)
  const [cooldownLeft, setCooldownLeft] = useState(0)
  const router = useRouter()

  useEffect(() => {
    function tick() {
      setCooldownLeft(readCooldownLeft())
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const handleClick = async () => {
    if (isLoading) return
    if (cooldownLeft > 0) {
      toast.error(
        `Подождите ${formatMmSs(cooldownLeft)} до следующей синхронизации (WB rate-limit)`,
      )
      return
    }
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
          `Не удалось обновить остатки из WB: ${errorText}. Повторите через минуту.`,
        )
        return
      }

      const data: {
        synced?: number
        total?: number
        failures?: SyncFailure[]
        warehouseStocksUpdated?: number
      } = await res.json()

      const failures = data.failures ?? []
      localStorage.setItem(STORAGE_KEY_LAST_RUN, String(Date.now()))

      if (failures.length === 0) {
        toast.success("WB остатки обновлены")
        localStorage.removeItem(STORAGE_KEY_UNLOCK_AT)
      } else {
        // 2026-05-12: партсинк → жёлтый warning с указанием упавших API.
        // Раньше тут был toast.success даже когда Statistics 429 — пользователь
        // получал ложный сигнал, остатки на самом деле не обновлялись.
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

      router.refresh()
    } catch (e) {
      toast.dismiss(toastId)
      const message = e instanceof Error ? e.message : "Ошибка сети"
      toast.error(
        `Не удалось обновить остатки из WB: ${message}. Повторите через минуту.`,
      )
    } finally {
      setIsLoading(false)
    }
  }

  const disabled = isLoading || cooldownLeft > 0
  const label = isLoading
    ? "Обновление…"
    : cooldownLeft > 0
      ? `Подождите ${formatMmSs(cooldownLeft)}`
      : "Обновить из WB"

  return (
    <Button
      onClick={handleClick}
      disabled={disabled}
      title={
        cooldownLeft > 0
          ? "WB API rate-limit — кнопка разблокируется автоматически"
          : undefined
      }
    >
      <RefreshCw className={`mr-2 h-4 w-4${isLoading ? " animate-spin" : ""}`} />
      {label}
    </Button>
  )
}
