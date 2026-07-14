"use client"

// components/analytics/NicheRunStatusPoller.tsx
// Phase 30 (D-02) — опрос статуса фонового прогона каждые ~2.5с.
// COLLECTING → показывает progressNote; READY/PARTIAL → редирект на дашборд; FAILED → errorMessage.
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

interface StatusResp {
  status: string
  progressNote: string | null
  errorMessage: string | null
}

export function NicheRunStatusPoller({ runId }: { runId: string }) {
  const router = useRouter()
  const [state, setState] = useState<StatusResp>({ status: "PENDING", progressNote: "Запуск сбора…", errorMessage: null })
  const stopped = useRef(false)

  useEffect(() => {
    stopped.current = false
    let timer: ReturnType<typeof setTimeout>

    const poll = async () => {
      if (stopped.current) return
      try {
        const res = await fetch(`/api/analytics/runs/${runId}/status`, { cache: "no-store" })
        if (res.ok) {
          const data = (await res.json()) as StatusResp
          setState(data)
          if (data.status === "READY" || data.status === "PARTIAL") {
            stopped.current = true
            router.push(`/analytics/runs/${runId}`)
            return
          }
          if (data.status === "FAILED") {
            stopped.current = true
            return
          }
        }
      } catch {
        /* сеть моргнула — повторим на следующем тике */
      }
      timer = setTimeout(poll, 2500)
    }
    poll()

    return () => {
      stopped.current = true
      clearTimeout(timer)
    }
  }, [runId, router])

  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex items-center gap-2">
        {state.status !== "FAILED" && (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        )}
        <span className="text-sm font-medium">
          {state.status === "FAILED" ? "Сбор завершился ошибкой" : "Идёт сбор данных…"}
        </span>
      </div>
      {state.progressNote && state.status !== "FAILED" && (
        <div className="text-sm text-muted-foreground">{state.progressNote}</div>
      )}
      {state.status === "FAILED" && state.errorMessage && (
        <div className="text-sm text-destructive">{state.errorMessage}</div>
      )}
    </div>
  )
}
