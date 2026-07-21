// app/(dashboard)/finance/weekly/page.tsx
// RSC-страница понедельного WB фин-отчёта (/finance/weekly, W2a).
// RBAC-гейт FINANCE → резолв ISO-недели → снапшот ИЛИ live → рендер
// (табы + тулбар + роллап-таблица + водопад).
// force-dynamic: неделя из ?week + допущения из AppSetting.
// Phase quick-260710-evz (W2a, 2026-07-10)
// Quick 260710-gem (W2c): + план-факт недели/МТД (SalesPlanVersionDay).
// Quick 260710-mih (W3c): зафиксированная неделя рендерится ИЗ снапшота
// (WeeklyFinReportSnapshot.payloadJson) — live-расчёт НЕ вызывается;
// version mismatch → live-fallback + warning «снапшот устарел».
// Live-композиция вынесена в lib/finance-weekly/live.ts (loadWeeklyLiveBundle).

import { requireSection, getSectionRole } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { FinanceTabs } from "@/components/finance/FinanceTabs"
import { WeeklyFinReportControls } from "@/components/finance/WeeklyFinReportControls"
import { WeeklyFinReportTable } from "@/components/finance/WeeklyFinReportTable"
import { loadWeeklyLiveBundle } from "@/lib/finance-weekly/live"
import { parseWeeklySnapshotPayload, toIsoMonday } from "@/lib/finance-weekly/snapshot"

export const metadata = { title: "Финансы — Понедельный — Zoiten ERP" }
export const dynamic = "force-dynamic"

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** ISO-понедельник текущей недели (МСК-сегодня → UTC-понедельник). */
function currentIsoMonday(): string {
  const msk = new Date(Date.now() + 3 * 60 * 60 * 1000)
  return toIsoMonday(msk.toISOString().slice(0, 10))
}

export default async function FinanceWeeklyPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; rawBuyout?: string }>
}) {
  // RBAC-гейт на входе — до любой загрузки данных
  await requireSection("FINANCE")
  const canManage = (await getSectionRole("FINANCE")) === "MANAGE"

  // Резолв недели: валидный ?week → его ISO-понедельник, иначе текущая неделя
  const sp = await searchParams
  const mondayISO =
    sp.week && ISO_DATE_RE.test(sp.week) ? toIsoMonday(sp.week) : currentIsoMonday()
  const weekStart = new Date(mondayISO + "T00:00:00Z")
  // Quick 260714-or9: тумблер «Без учёта % выкупа (бытовая)» — view-only, URL-driven
  const rawBuyout = sp.rawBuyout === "1"

  // W3c: снапшот недели (если зафиксирована)
  const snapshot = await prisma.weeklyFinReportSnapshot.findUnique({
    where: { weekStart },
    include: { fixedBy: { select: { firstName: true, lastName: true, name: true } } },
  })
  const payload = snapshot ? parseWeeklySnapshotPayload(snapshot.payloadJson) : null

  // ── Зафиксированный режим: рендер ИЗ снапшота, live-расчёт НЕ вызывается ──
  if (snapshot && payload) {
    const fixedBy = snapshot.fixedBy
    const fixedByName =
      [fixedBy?.firstName, fixedBy?.lastName].filter(Boolean).join(" ") ||
      fixedBy?.name ||
      null
    const fixedAtLabel = snapshot.fixedAt.toLocaleString("ru-RU", {
      timeZone: "Europe/Moscow",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })

    return (
      <div className="h-full flex flex-col gap-4">
        <FinanceTabs />

        <WeeklyFinReportControls
          key={payload.weekStart}
          weekStartISO={payload.weekStart}
          weekEndISO={payload.weekEnd}
          manualPools={payload.manualPools}
          canManage={canManage}
          poolSources={payload.poolSources}
          bankAutos={payload.bankAutos}
          clothingOverheadPerUnitRub={payload.clothingOverheadPerUnitRub}
          bankPoolSources={payload.bankPoolSources}
          snapshot={{ fixedAtLabel, fixedByName }}
          jemOptionPct={payload.constants.jemOptionPct ?? 0.75}
        />

        <WeeklyFinReportTable
          articles={payload.articles}
          rollup={payload.rollup}
          waterfall={payload.waterfall}
          meta={payload.meta}
          planFact={payload.planFact}
        />
      </div>
    )
  }

  // ── Live-режим: нет снапшота ИЛИ снапшот с чужой version (stale → warning) ──
  const snapshotStale = Boolean(snapshot && !payload)
  const { data, result, planFact } = await loadWeeklyLiveBundle(weekStart, {
    skipAppliancesBuyoutDiscount: rawBuyout,
  })

  return (
    <div className="h-full flex flex-col gap-4">
      <FinanceTabs />

      <WeeklyFinReportControls
        key={data.weekStart}
        weekStartISO={data.weekStart}
        weekEndISO={data.weekEnd}
        manualPools={data.manualPools}
        canManage={canManage}
        poolSources={data.poolSources}
        bankAutos={data.bankAutos}
        clothingOverheadPerUnitRub={data.clothingOverheadPerUnitRub}
        bankPoolSources={data.bankPoolSources}
        snapshotStale={snapshotStale}
        jemOptionPct={data.jemOptionPct}
        skipAppliancesBuyoutDiscount={rawBuyout}
      />

      <WeeklyFinReportTable
        articles={result.articles}
        rollup={result.rollup}
        waterfall={result.waterfall}
        meta={data.meta}
        planFact={planFact}
        skipAppliancesBuyoutDiscount={rawBuyout}
      />
    </div>
  )
}
