"use client"
// components/settings/CronScheduleTab.tsx
// 2026-05-15 (quick 260515-o4o): UI таб «Расписание» для cron-времён.
// 2 карточки (Заказы / Цены) с native <select> на 288 опций (5-мин шаги).
// SUPERADMIN-only (RSC page.tsx уже отфильтровал; не-superadmin сюда не попадёт).

import { useState, useTransition, useMemo } from "react"
import { toast } from "sonner"
import {
  updateCronSchedule,
  type CronSchedule,
  type CronKey,
} from "@/app/actions/cron-schedule"
import { Clock } from "lucide-react"

function buildTimeOptions(): string[] {
  const out: string[] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 5) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`)
    }
  }
  return out // 288 options
}

interface Card {
  key: CronKey
  title: string
  description: string
}

const CARDS: Card[] = [
  {
    key: "wbOrdersDailyCronTime",
    title: "Заказы WB",
    description: "Daily snapshot заказов в WbCardOrdersDaily",
  },
  {
    key: "wbPricesDailyCronTime",
    title: "Цены WB",
    description:
      "Daily snapshot sellerPrice + buyerPrice через card.wb.ru v4 API",
  },
]

export function CronScheduleTab({ schedule }: { schedule: CronSchedule }) {
  const options = useMemo(() => buildTimeOptions(), [])
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {CARDS.map((c) => (
        <CronCard
          key={c.key}
          card={c}
          currentTime={
            c.key === "wbOrdersDailyCronTime"
              ? schedule.ordersTime
              : schedule.pricesTime
          }
          lastRun={
            c.key === "wbOrdersDailyCronTime"
              ? schedule.ordersLastRun
              : schedule.pricesLastRun
          }
          options={options}
        />
      ))}
    </div>
  )
}

function CronCard({
  card,
  currentTime,
  lastRun,
  options,
}: {
  card: Card
  currentTime: string
  lastRun: string | null
  options: string[]
}) {
  const [value, setValue] = useState(currentTime)
  const [isPending, startTransition] = useTransition()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    setValue(next)
    startTransition(async () => {
      const res = await updateCronSchedule(card.key, next)
      if (res.ok) {
        toast.success(`${card.title}: расписание сохранено (${next} МСК)`)
      } else {
        toast.error(res.error)
        setValue(currentTime)
      }
    })
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold">{card.title}</h3>
      </div>
      <p className="text-xs text-muted-foreground">{card.description}</p>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">
          Время запуска (МСК)
        </label>
        <select
          value={value}
          onChange={handleChange}
          disabled={isPending}
          className="w-full px-2 py-1 border rounded-md bg-background text-foreground disabled:opacity-50"
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
      <div className="text-xs text-muted-foreground">
        Последний запуск:{" "}
        <span className="font-mono">{lastRun ?? "—"}</span>
      </div>
    </div>
  )
}
