"use client"

// components/support/AutoReplyForm.tsx
// Phase 10 Plan 04: Client форма настроек AutoReplyConfig (singleton id='default').
// Native inputs (toggle + 7 чекбоксов дней Пн-Вс ISO 1..7 + 2 time + textarea + select TZ).
// Submit → FormData → saveAutoReplyConfig → toast. Кнопка «Сохранить» (НЕ «Синхронизировать с WB»).

import { useState, useTransition } from "react"
import type React from "react"
import { toast } from "sonner"
import { Save, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { saveAutoReplyConfig } from "@/app/actions/support"
import type { AutoReplyConfig } from "@prisma/client"

// ISO 8601 day of week: 1=Mon..7=Sun (matches Plan 10-02 isWithinWorkingHours helper).
const DAY_LABELS: Array<{ iso: number; label: string }> = [
  { iso: 1, label: "Пн" },
  { iso: 2, label: "Вт" },
  { iso: 3, label: "Ср" },
  { iso: 4, label: "Чт" },
  { iso: 5, label: "Пт" },
  { iso: 6, label: "Сб" },
  { iso: 7, label: "Вс" },
]

const TIMEZONES: Array<{ value: string; label: string }> = [
  { value: "Europe/Moscow", label: "Москва (GMT+3)" },
  { value: "Europe/Kaliningrad", label: "Калининград (GMT+2)" },
  { value: "Asia/Yekaterinburg", label: "Екатеринбург (GMT+5)" },
  { value: "UTC", label: "UTC" },
]

const DEFAULT_MESSAGE =
  "Здравствуйте, {имя_покупателя}! Спасибо за обращение по товару «{название_товара}». Мы ответим в рабочее время."

interface Props {
  config: AutoReplyConfig | null
}

export function AutoReplyForm({ config }: Props) {
  const [isEnabled, setIsEnabled] = useState<boolean>(config?.isEnabled ?? false)
  const [workdayStart, setWorkdayStart] = useState<string>(
    config?.workdayStart ?? "09:00"
  )
  const [workdayEnd, setWorkdayEnd] = useState<string>(
    config?.workdayEnd ?? "18:00"
  )
  const [workDays, setWorkDays] = useState<number[]>(
    config?.workDays ?? [1, 2, 3, 4, 5]
  )
  const [messageText, setMessageText] = useState<string>(
    config?.messageText ?? DEFAULT_MESSAGE
  )
  const [timezone, setTimezone] = useState<string>(
    config?.timezone ?? "Europe/Moscow"
  )
  const [isPending, startTransition] = useTransition()

  function toggleDay(iso: number) {
    setWorkDays((prev) =>
      prev.includes(iso)
        ? prev.filter((d) => d !== iso)
        : [...prev, iso].sort((a, b) => a - b)
    )
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fd = new FormData()
    fd.set("isEnabled", String(isEnabled))
    fd.set("workdayStart", workdayStart)
    fd.set("workdayEnd", workdayEnd)
    for (const d of workDays) fd.append("workDays", String(d))
    fd.set("messageText", messageText)
    fd.set("timezone", timezone)

    startTransition(async () => {
      const res = await saveAutoReplyConfig(fd)
      if (res.ok) {
        toast.success("Настройки сохранены")
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5 rounded-lg border p-4 bg-card"
    >
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={(e) => setIsEnabled(e.target.checked)}
          className="h-4 w-4"
        />
        <span className="text-sm font-medium">Включить автоответ</span>
      </label>

      <div className="space-y-1">
        <span className="text-sm font-medium">Рабочие дни</span>
        <div className="flex flex-wrap gap-2">
          {DAY_LABELS.map(({ iso, label }) => (
            <label
              key={iso}
              className={`flex items-center gap-1 px-2 py-1 rounded border cursor-pointer text-sm ${
                workDays.includes(iso)
                  ? "bg-primary/10 border-primary"
                  : "border-input"
              }`}
            >
              <input
                type="checkbox"
                checked={workDays.includes(iso)}
                onChange={() => toggleDay(iso)}
                className="h-3 w-3"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-sm font-medium">Начало рабочего дня</span>
          <input
            type="time"
            value={workdayStart}
            onChange={(e) => setWorkdayStart(e.target.value)}
            className="w-full rounded border px-2 py-1 text-sm"
            required
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Конец рабочего дня</span>
          <input
            type="time"
            value={workdayEnd}
            onChange={(e) => setWorkdayEnd(e.target.value)}
            className="w-full rounded border px-2 py-1 text-sm"
            required
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Часовой пояс</span>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full rounded border px-2 py-1 text-sm"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">
          Текст автоответа ({messageText.length}/1000)
        </span>
        <textarea
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          maxLength={1000}
          rows={5}
          required
          className="w-full rounded border px-2 py-1 text-sm resize-none"
        />
        <p className="text-xs text-muted-foreground">
          Доступны переменные:{" "}
          <code className="px-1 rounded bg-muted">{"{имя_покупателя}"}</code>,{" "}
          <code className="px-1 rounded bg-muted">{"{название_товара}"}</code>
        </p>
      </label>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1 h-4 w-4" />
          )}
          Сохранить
        </Button>
      </div>
    </form>
  )
}
