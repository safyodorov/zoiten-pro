// app/(dashboard)/credits/schedule/page.tsx
// RSC — сводный горизонтальный график выплат (D-13..D-17), Phase 21-07.
// RBAC: requireSection("CREDITS")

import { requireSection } from "@/lib/rbac"
import {
  loadSummarySchedule,
  defaultScheduleWindow,
  type LoanGranularity,
} from "@/lib/credits-schedule-data"
import { CreditsTabs } from "@/components/credits/CreditsTabs"
import { ScheduleControls } from "@/components/credits/ScheduleControls"
import { SummaryScheduleTable } from "@/components/credits/SummaryScheduleTable"
import { getSectionRole } from "@/lib/rbac"

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseGranularity(raw: string | undefined): LoanGranularity {
  if (raw === "day" || raw === "week" || raw === "month") return raw
  return "month"
}

function parseDate(raw: string | undefined, fallback: Date): Date {
  if (!raw) return fallback
  const parsed = new Date(raw + "T00:00:00Z")
  if (isNaN(parsed.getTime())) return fallback
  return parsed
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CreditsSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{
    granularity?: string
    from?: string
    to?: string
  }>
}) {
  await requireSection("CREDITS")

  const canManage = (await getSectionRole("CREDITS")) === "MANAGE"

  const defaults = defaultScheduleWindow()
  const { granularity: granParam, from: fromParam, to: toParam } = await searchParams

  const granularity = parseGranularity(granParam)
  const from = parseDate(fromParam, defaults.from)
  const to = parseDate(toParam, defaults.to)

  const schedule = await loadSummarySchedule(granularity, from, to)

  return (
    <div className="h-full flex flex-col gap-3">
      {/* ── Шапка: табы + контролы ── */}
      <div className="flex flex-col gap-2">
        <CreditsTabs />
        <ScheduleControls
          granularity={granularity}
          from={from}
          to={to}
          defaultFrom={defaults.from}
          defaultTo={defaults.to}
          defaultGranularity={defaults.granularity}
        />
      </div>

      {/* ── Таблица (flex-1 min-h-0 → sticky + horizontal scroll) ── */}
      <div className="flex-1 min-h-0">
        <SummaryScheduleTable schedule={schedule} canManage={canManage} />
      </div>
    </div>
  )
}
