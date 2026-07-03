// app/(dashboard)/finance/balance/page.tsx
// Phase 24 Plan 24-07 — RSC отчёт «Баланс»: loadBalanceSheet × 2 даты (выбранная + сравнения),
// вертикальная таблица Активы→Пассивы→Капитал (D-06), дельты Δ₽/Δ% (D-09).
//
// M5: default compare = date.slice(0, 7) + "-01" — НЕ конвертировать через startOfMonthMsk +
// toISOString (та комбинация даёт UTC-сдвиг → 30-е число ПРЕДЫДУЩЕГО месяца, ниже начала
// истории D-03). Clamp compare не ниже HISTORY_START.
//
// 24-08: управляющий слой (RecalcButton/ManualAdjustmentsModal/TaxSettingsModal) отрендерен
// только для MANAGE (getSectionRole) — сами server actions в любом случае вернут FORBIDDEN
// без MANAGE, но кнопки лучше не показывать read-only пользователям (паттерн /cash).
import { requireSection, getSectionRole } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { FinanceTabs } from "@/components/finance/FinanceTabs"
import { BalanceDatePicker } from "@/components/finance/BalanceDatePicker"
import { BalanceMethodologyDialog } from "@/components/finance/BalanceMethodologyDialog"
import { BalanceSheetTable } from "@/components/finance/BalanceSheetTable"
import { RecalcButton } from "@/components/finance/RecalcButton"
import { ManualAdjustmentsModal } from "@/components/finance/ManualAdjustmentsModal"
import { TaxSettingsModal } from "@/components/finance/TaxSettingsModal"
import { loadBalanceSheet } from "@/lib/balance-data"

export const metadata = { title: "Финансы — Баланс — Zoiten ERP" }
export const dynamic = "force-dynamic"

/** D-03 — история снапшотов начинается 01.07.2026, ретроспектива не восстанавливается. */
const HISTORY_START = "2026-07-01"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** "YYYY-MM-DD" вчерашнего дня МСК (D-02 — «утром за вчера»), паттерн lib/finance-snapshot.ts. */
function mskYesterdayDateString(): string {
  const ms = Date.now() + 3 * 3600_000 - 24 * 3600_000
  return new Date(ms).toISOString().split("T")[0]
}

export default async function FinanceBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; compare?: string }>
}) {
  await requireSection("FINANCE")
  const canManage = (await getSectionRole("FINANCE")) === "MANAGE"
  const sp = await searchParams

  const date = sp.date && DATE_RE.test(sp.date) ? sp.date : mskYesterdayDateString()

  // M5: compare-дефолт — начало месяца ВЫБРАННОЙ даты, строкой (без Date/toISOString конвертации).
  let compare = sp.compare && DATE_RE.test(sp.compare) ? sp.compare : date.slice(0, 7) + "-01"
  if (compare < HISTORY_START) compare = HISTORY_START

  // Нормализованная дата снапшота (полночь UTC) — консистентно с @db.Date записями cron 24-06 (m6).
  const dateObj = new Date(date)
  const compareObj = new Date(compare)

  const [current, compareSheet, manualAdjustmentRows, taxActualRows, taxSettingRows] = await Promise.all([
    loadBalanceSheet(dateObj),
    loadBalanceSheet(compareObj),
    prisma.financeManualAdjustment.findMany({
      where: { deletedAt: null },
      orderBy: { effectiveFrom: "desc" },
    }),
    prisma.financeTaxPeriodActual.findMany(),
    prisma.appSetting.findMany({
      where: { key: { in: ["finance.vatPct", "finance.incomeTaxPct"] } },
    }),
  ])

  const labelFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC" })
  const currentLabel = labelFmt.format(dateObj)
  const compareLabel = labelFmt.format(compareObj)

  // 24-08: сериализация Decimal→Number, Date→"YYYY-MM-DD" на границе RSC→client.
  const manualAdjustments = manualAdjustmentRows.map((a) => ({
    id: a.id,
    label: a.label,
    type: a.type,
    amountRub: Number(a.amountRub),
    effectiveFrom: a.effectiveFrom.toISOString().slice(0, 10),
    comment: a.comment,
  }))

  const taxActuals = taxActualRows.map((a) => ({
    year: a.year,
    quarter: a.quarter,
    vatActualRub: a.vatActualRub != null ? Number(a.vatActualRub) : null,
    incomeTaxActualRub: a.incomeTaxActualRub != null ? Number(a.incomeTaxActualRub) : null,
  }))

  const settingsMap = new Map(taxSettingRows.map((r) => [r.key, r.value]))
  const vatPct = Number(settingsMap.get("finance.vatPct") ?? "7")
  const incomeTaxPct = Number(settingsMap.get("finance.incomeTaxPct") ?? "1")

  return (
    <div className="h-full flex flex-col gap-4">
      <FinanceTabs />
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2">
          <BalanceMethodologyDialog />
          {canManage && (
            <>
              <RecalcButton date={date} />
              <ManualAdjustmentsModal adjustments={manualAdjustments} />
              <TaxSettingsModal vatPct={vatPct} incomeTaxPct={incomeTaxPct} actuals={taxActuals} />
            </>
          )}
        </div>
        <div className="ml-auto">
          <BalanceDatePicker date={date} compare={compare} />
        </div>
      </div>
      <BalanceSheetTable current={current} compare={compareSheet} currentLabel={currentLabel} compareLabel={compareLabel} />
    </div>
  )
}
