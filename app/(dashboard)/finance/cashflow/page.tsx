// app/(dashboard)/finance/cashflow/page.tsx
// Phase 28-02: RSC-страница ПДДС.
// force-dynamic, RBAC-гейт, loadCashflowInputs → computeCashflow → рендер.

import Link from "next/link"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import type { Granularity } from "@/lib/date-buckets"
import { FinanceTabs } from "@/components/finance/FinanceTabs"
import { CashflowKpiCards } from "@/components/finance/CashflowKpiCards"
import { CashflowChart } from "@/components/finance/CashflowChart"
import { CashflowMatrix } from "@/components/finance/CashflowMatrix"
import { loadCashflowInputs } from "@/lib/finance-cashflow/data"
import { computeCashflow } from "@/lib/finance-cashflow/engine"

export const metadata = { title: "Финансы — ОДДС — Zoiten ERP" }
export const dynamic = "force-dynamic"

/** "YYYY-MM-DD" сегодняшнего дня по МСК. */
function mskTodayDateString(): string {
  const ms = Date.now() + 3 * 3600_000
  return new Date(ms).toISOString().split("T")[0]
}

// ── Компонент ─────────────────────────────────────────────────────────────────

export default async function FinanceCashflowPage({
  searchParams,
}: {
  searchParams: Promise<{ granularity?: string }>
}) {
  // D-8: RBAC гейт на входе — до любой загрузки данных (T-28-04)
  await requireSection("FINANCE")

  // Валидация granularity allow-list (T-28-05: произвольное значение отбрасывается)
  const sp = await searchParams
  const granularity = (
    ["day", "week", "month"].includes(sp.granularity ?? "") ? sp.granularity : "month"
  ) as Granularity

  // Читаем ActiveVersionId + горизонт из AppSetting
  const settingRows = await prisma.appSetting.findMany({
    where: { key: { in: ["salesPlan.activeVersionId", "salesPlan.horizon"] } },
  })
  const settingsMap = new Map(settingRows.map((r) => [r.key, r.value]))

  const activeVersionId = settingsMap.get("salesPlan.activeVersionId") ?? null

  // D-7: Пустое состояние — нет fallback на драфт (T-28-06: текст безобиден за FINANCE-гейтом)
  if (!activeVersionId) {
    return (
      <div className="h-full flex flex-col gap-4">
        <FinanceTabs />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <p className="text-sm">Нет активной версии плана продаж</p>
            <p className="text-xs mt-1">
              Зафиксируйте план продаж в разделе «План продаж»
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Горизонт из AppSetting (fallback H2-2026)
  let horizon = { from: "2026-07-01", to: "2026-12-31" }
  const horizonRaw = settingsMap.get("salesPlan.horizon")
  if (horizonRaw) {
    try {
      const parsed = JSON.parse(horizonRaw) as { from?: string; to?: string }
      if (parsed.from && parsed.to) {
        horizon = { from: parsed.from, to: parsed.to }
      }
    } catch {
      // ignore, используем fallback
    }
  }

  // Загружаем входы и вычисляем ПДДС
  const inputs = await loadCashflowInputs(prisma, {
    versionId: activeVersionId,
    horizonFrom: horizon.from,
    horizonTo: horizon.to,
  })
  const result = computeCashflow(inputs, granularity)

  const today = mskTodayDateString()

  // Granularity-переключатель: метки и маршруты — статические классы (RSC trap)
  const GRANULARITY_OPTIONS = [
    { value: "day", label: "День" },
    { value: "week", label: "Неделя" },
    { value: "month", label: "Месяц" },
  ] as const

  return (
    <div className="h-full flex flex-col gap-4">
      <FinanceTabs />

      {/* Панель управления: переключатель гранулярности */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 border rounded-md p-0.5">
          {GRANULARITY_OPTIONS.map((opt) => (
            <Link
              key={opt.value}
              href={`/finance/cashflow?granularity=${opt.value}`}
              prefetch={false}
              className={
                granularity === opt.value
                  ? "px-2 py-1 text-xs rounded bg-muted font-medium"
                  : "px-2 py-1 text-xs rounded hover:bg-muted/50 text-muted-foreground"
              }
            >
              {opt.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Предупреждение: versionStale */}
      {result.versionStale && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          Виртуальные закупки изменили статус — рекомендуется перефиксация плана продаж.
        </div>
      )}

      {/* KPI-карточки */}
      <CashflowKpiCards result={result} />

      {/* График остатка: прогноз + факт + порог + сегодня */}
      <CashflowChart
        days={result.days}
        today={today}
        gapThresholdRub={inputs.gapThresholdRub}
      />

      {/* Sticky-матрица потоков × бакеты */}
      <CashflowMatrix
        buckets={result.buckets}
        gapThresholdRub={inputs.gapThresholdRub}
      />
    </div>
  )
}
