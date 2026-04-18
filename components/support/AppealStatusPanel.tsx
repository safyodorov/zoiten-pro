"use client"

// components/support/AppealStatusPanel.tsx
// Блок в TicketSidePanel для тикетов в статусе APPEALED.
// Показывает причину/текст/даты обжалования + native <select> для ручного
// переключения статуса (WB API для опроса недоступен → ручной toggle).

import { useTransition } from "react"
import { toast } from "sonner"
import { updateAppealStatus } from "@/app/actions/appeals"
import type { AppealStatus } from "@prisma/client"

export interface AppealStatusPanelProps {
  appealId: string
  currentStatus: AppealStatus
  reason: string
  createdAt: Date | string
  appealResolvedAt: Date | string | null
  createdByName?: string | null
  resolvedByName?: string | null
}

type SelectValue = "PENDING" | "APPROVED" | "REJECTED"

function fmtDate(d: Date | string | null): string {
  if (!d) return "—"
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(new Date(d))
}

export function AppealStatusPanel({
  appealId,
  currentStatus,
  reason,
  createdAt,
  appealResolvedAt,
  createdByName,
  resolvedByName,
}: AppealStatusPanelProps) {
  const [isPending, startTransition] = useTransition()

  // NONE не должен встречаться в APPEALED тикете, но для совместимости селекта
  // показываем PENDING как дефолт.
  const selectValue: SelectValue =
    currentStatus === "NONE" ? "PENDING" : (currentStatus as SelectValue)

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as SelectValue
    if (next === selectValue) return
    startTransition(async () => {
      const res = await updateAppealStatus({ appealId, status: next })
      if (res.ok) toast.success("Статус обжалования обновлён")
      else toast.error(res.error)
    })
  }

  return (
    <div className="rounded-md border border-purple-300 bg-purple-50 dark:border-purple-900 dark:bg-purple-950/20 p-3 space-y-2">
      <h3 className="text-sm font-medium">Статус обжалования</h3>
      <select
        value={selectValue}
        onChange={onChange}
        disabled={isPending}
        className="w-full h-9 rounded-md border bg-background px-2 text-sm"
      >
        <option value="PENDING">🕐 Ещё ожидание</option>
        <option value="APPROVED">✅ Одобрено WB</option>
        <option value="REJECTED">❌ Отклонено WB</option>
      </select>
      <div className="text-xs text-muted-foreground space-y-0.5 pt-1">
        <div>
          <span className="font-medium">Причина:</span> {reason}
        </div>
        <div>
          <span className="font-medium">Создано:</span> {fmtDate(createdAt)}
          {createdByName ? ` · ${createdByName}` : ""}
        </div>
        <div>
          <span className="font-medium">Решено:</span>{" "}
          {fmtDate(appealResolvedAt)}
          {resolvedByName ? ` · ${resolvedByName}` : ""}
        </div>
      </div>
    </div>
  )
}
