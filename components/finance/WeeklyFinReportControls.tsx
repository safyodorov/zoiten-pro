"use client"

// components/finance/WeeklyFinReportControls.tsx
// Тулбар понедельного WB фин-отчёта: выбор недели (Пн–Вс) + редактор ручных
// пулов затрат (только FINANCE MANAGE — placeholder до W3 банк-классификатора).
// Неделя живёт в URL ?week=YYYY-MM-DD (нормализуется до ISO-понедельника).
// Native <input>/<button> (CLAUDE.md: НЕ base-ui). Образец: PlanFactControls.tsx.
// Phase quick-260710-evz (W2a, 2026-07-10)

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { saveWeeklyPools } from "@/app/actions/finance-weekly"
import type { ManualPools } from "@/lib/finance-weekly/data"

// ── Helpers (UTC ISO-неделя) ────────────────────────────────────────────────────

function addDaysToIso(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Нормализует любую дату (ISO) к её ISO-понедельнику (UTC). */
function toIsoMonday(iso: string): string {
  const d = new Date(iso + "T00:00:00Z")
  const jsDay = d.getUTCDay() // 0=вс, 1=пн
  const isoDay = jsDay === 0 ? 7 : jsDay
  d.setUTCDate(d.getUTCDate() - (isoDay - 1))
  return d.toISOString().slice(0, 10)
}

function isoTodayMonday(): string {
  const msk = new Date(Date.now() + 3 * 60 * 60 * 1000)
  return toIsoMonday(msk.toISOString().slice(0, 10))
}

// ── Поля редактора ───────────────────────────────────────────────────────────────

const POOL_FIELDS: { key: keyof ManualPools; label: string; group: string }[] = [
  { key: "delivery", label: "Доставка до МП (общая)", group: "Общее" },
  { key: "overheadAppl", label: "Общие расходы", group: "Бытовая техника" },
  { key: "acceptanceAppl", label: "Приёмка / штрафы", group: "Бытовая техника" },
  { key: "storageAppl", label: "Хранение", group: "Бытовая техника" },
  { key: "overheadCloth", label: "Общие расходы", group: "Одежда" },
  { key: "acceptanceCloth", label: "Приёмка / штрафы", group: "Одежда" },
  { key: "storageCloth", label: "Хранение", group: "Одежда" },
]

const GROUP_ORDER = ["Общее", "Бытовая техника", "Одежда"]

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  weekStartISO: string
  weekEndISO: string
  manualPools: ManualPools
  canManage: boolean
}

// ── Компонент ───────────────────────────────────────────────────────────────────

export function WeeklyFinReportControls({
  weekStartISO,
  weekEndISO,
  manualPools,
  canManage,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pools, setPools] = useState<ManualPools>(manualPools)

  function goToWeek(mondayISO: string) {
    router.push(`/finance/weekly?week=${mondayISO}`)
  }

  const handleDate = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return
    goToWeek(toIsoMonday(e.target.value))
  }

  const handlePoolChange = (key: keyof ManualPools, raw: string) => {
    const n = Number(raw)
    setPools((prev) => ({ ...prev, [key]: Number.isFinite(n) ? n : 0 }))
  }

  const handleSave = () => {
    startTransition(async () => {
      const res = await saveWeeklyPools(weekStartISO, pools)
      if (res.ok) {
        toast.success("Пулы затрат сохранены")
        router.refresh()
      } else {
        toast.error(res.error || "Не удалось сохранить пулы")
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Выбор недели */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground whitespace-nowrap">Неделя (Пн):</span>
        <input
          type="date"
          value={weekStartISO}
          onChange={handleDate}
          className="rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          onClick={() => goToWeek(addDaysToIso(weekStartISO, -7))}
          className="px-2 py-1 text-xs text-muted-foreground border rounded hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          ‹ Пред.
        </button>
        <button
          type="button"
          onClick={() => goToWeek(addDaysToIso(weekStartISO, 7))}
          className="px-2 py-1 text-xs text-muted-foreground border rounded hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          След. ›
        </button>
        <button
          type="button"
          onClick={() => goToWeek(isoTodayMonday())}
          className="px-2 py-1 text-xs text-muted-foreground border rounded hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          Тек. неделя
        </button>
        <span className="text-muted-foreground whitespace-nowrap">
          {weekStartISO} — {weekEndISO}
        </span>
      </div>

      {/* Редактор ручных пулов — только MANAGE */}
      {canManage && (
        <div className="rounded-md border bg-card p-3">
          <div className="mb-2 text-sm font-semibold">
            Ручные пулы затрат за неделю, ₽
          </div>
          <div className="flex flex-wrap gap-4">
            {GROUP_ORDER.map((group) => (
              <div key={group} className="flex flex-col gap-1.5">
                <div className="text-xs font-medium text-muted-foreground">{group}</div>
                {POOL_FIELDS.filter((f) => f.group === group).map((f) => (
                  <label key={f.key} className="flex items-center gap-2 text-xs">
                    <span className="w-40 whitespace-nowrap text-muted-foreground">
                      {f.label}
                    </span>
                    <input
                      type="number"
                      step="any"
                      value={Number.isFinite(pools[f.key]) ? pools[f.key] : 0}
                      onChange={(e) => handlePoolChange(f.key, e.target.value)}
                      className="w-28 rounded border bg-background px-2 py-1 text-right text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Сохранение…" : "Сохранить"}
            </button>
            <span className="text-xs text-muted-foreground">
              Кредит (проценты) — авто из графика кредитов Зойтен, только бытовая техника.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
