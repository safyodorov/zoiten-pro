// lib/wb-realization-sync.ts
// W1 (quick 260710-jgs): syncRealizationWeek(weekStart) — общая логика импорта
// отчёта реализации WB одной ISO-недели. Используется route'ом
// /api/wb-realization-sync (кнопка «Реализация WB») и кроном
// /api/cron/wb-realization-weekly (вторник 05:50 МСК, прошлая неделя).
//
// Поток: list → фильтр отчётов недели → detailed (пагинация) → normalize →
// classify → accumulate per nmId → clean-replace недели в WbRealizationWeekly.
//
// Rate limit sales-reports = 1 req/мин → sleep(FINANCE_REPORTS_SLEEP_MS) перед
// каждым detailed-вызовом (пагинацию внутри detailed клиент спит сам).

import { prisma } from "@/lib/prisma"
import {
  FINANCE_REPORTS_SLEEP_MS,
  accumulateRealizationRows,
  emptyRealizationBuckets,
  fetchSalesReportDetailed,
  listSalesReports,
  normalizeRealizationRow,
  type NormalizedRealizationRow,
  type RealizationBucketTotals,
  type SalesReportListItem,
} from "@/lib/wb-realization-api"

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Диагностика классификатора (plan-checker INFO): сверяет Σ бакетов по всем nmId
 * с list-агрегатами отчётов (deliveryServiceSum / paidStorageSum / penaltySum
 * и т.п.). console.warn при относительном расхождении > 1% — сигнал, что
 * классификатор недоучитывает какой-то тип операций (диагностика первого
 * реального синка). Сверка приблизительная: deduction-fallback'и в classify
 * могут смещать бакеты, list-агрегаты могут не покрывать все строки.
 */
function reconcileWithListAggregates(
  acc: Map<number, RealizationBucketTotals>,
  reports: SalesReportListItem[],
  weekStartISO: string,
): void {
  const totals = emptyRealizationBuckets()
  for (const buckets of acc.values()) {
    for (const key of Object.keys(totals) as (keyof RealizationBucketTotals)[]) {
      totals[key] += buckets[key]
    }
  }

  const listSum = (pick: (r: SalesReportListItem) => number): number =>
    reports.reduce((s, r) => s + pick(r), 0)

  const pairs: { label: string; bucketSum: number; aggregateSum: number }[] = [
    {
      label: "delivery vs deliveryServiceSum",
      bucketSum: totals.delivery,
      aggregateSum: listSum((r) => r.deliveryServiceSum),
    },
    {
      label: "storage vs paidStorageSum",
      bucketSum: totals.storage,
      aggregateSum: listSum((r) => r.paidStorageSum),
    },
    {
      label: "acceptance vs paidAcceptanceSum",
      bucketSum: totals.acceptance,
      aggregateSum: listSum((r) => r.paidAcceptanceSum),
    },
    {
      label: "penalty vs penaltySum",
      bucketSum: totals.penalty,
      aggregateSum: listSum((r) => r.penaltySum),
    },
    {
      label: "forPay vs forPaySum",
      bucketSum: totals.forPay,
      aggregateSum: listSum((r) => r.forPaySum),
    },
    {
      label: "reviewPoints+promotion+deductionOther vs deductionSum",
      bucketSum: totals.reviewPoints + totals.promotion + totals.deductionOther,
      aggregateSum: listSum((r) => r.deductionSum),
    },
  ]

  for (const { label, bucketSum, aggregateSum } of pairs) {
    const denom = Math.max(Math.abs(aggregateSum), Math.abs(bucketSum))
    if (denom < 1) continue // обе суммы ~0 — сверять нечего
    const relDiff = Math.abs(bucketSum - aggregateSum) / denom
    if (relDiff > 0.01) {
      console.warn(
        `[wb-realization-sync] week=${weekStartISO} сверка ${label}: ` +
          `бакеты=${bucketSum.toFixed(2)} vs list-агрегат=${aggregateSum.toFixed(2)} ` +
          `(расхождение ${(relDiff * 100).toFixed(1)}%) — проверьте классификатор`,
      )
    }
  }
}

/**
 * Импортирует отчёт(ы) реализации WB, пересекающие ISO-неделю [weekStart, +6д],
 * и clean-replace'ом записывает агрегаты per nmId в WbRealizationWeekly.
 *
 * @param weekStart UTC-понедельник 00:00:00Z (нормализуется caller'ом)
 * @throws Error если WB ещё не сформировал отчёт недели (0 пересекающих отчётов)
 * @throws WbRateLimitError при активном cooldown / повторном 429
 */
export async function syncRealizationWeek(
  weekStart: Date,
): Promise<{ reports: number; rows: number; written: number }> {
  const weekStartISO = isoDate(weekStart)
  const weekEnd = new Date(weekStart.getTime() + 6 * 86_400_000)
  const weekEndISO = isoDate(weekEnd)

  const list = await listSalesReports(weekStartISO, weekEndISO)

  // Отчёты, пересекающие неделю (обычно ровно 1 недельный отчёт Пн–Вс).
  // dateFrom/dateTo могут приходить как RFC3339 → сравниваем по датной части.
  const overlapping = list.filter((r) => {
    const from = r.dateFrom.slice(0, 10)
    const to = r.dateTo.slice(0, 10)
    return from <= weekEndISO && to >= weekStartISO
  })

  if (overlapping.length === 0) {
    throw new Error(
      `Отчёт реализации за неделю ${weekStartISO} ещё не сформирован WB ` +
        `(появляется в понедельник после закрытия недели)`,
    )
  }

  // detailed по каждому отчёту (1 req/мин → пауза перед каждым вызовом)
  const normalized: NormalizedRealizationRow[] = []
  for (const report of overlapping) {
    await sleep(FINANCE_REPORTS_SLEEP_MS)
    const rawRows = await fetchSalesReportDetailed(report.reportId)
    for (const raw of rawRows) {
      normalized.push(normalizeRealizationRow(raw))
    }
  }

  const acc = accumulateRealizationRows(normalized)
  reconcileWithListAggregates(acc, overlapping, weekStartISO)

  const reportIds = overlapping.map((r) => r.reportId)
  const data = Array.from(acc.entries()).map(([nmId, b]) => ({
    weekStart,
    nmId,
    forPayRub: b.forPay,
    deliveryRub: b.delivery,
    storageRub: b.storage,
    acceptanceRub: b.acceptance,
    penaltyRub: b.penalty,
    reviewPointsRub: b.reviewPoints,
    promotionRub: b.promotion,
    deductionOtherRub: b.deductionOther,
    reportIds,
  }))

  // clean-replace недели (образец wb-sales-daily) — идемпотентно, повторный
  // импорт не задваивает.
  const written = await prisma.$transaction(async (tx) => {
    await tx.wbRealizationWeekly.deleteMany({ where: { weekStart } })
    if (data.length === 0) return 0
    const created = await tx.wbRealizationWeekly.createMany({ data })
    return created.count
  })

  return { reports: overlapping.length, rows: normalized.length, written }
}
