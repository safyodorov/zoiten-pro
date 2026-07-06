// lib/sales-plan/plan-fact.ts
//
// Pure функция buildPlanFactReport — план/факт/ИУ по бакетам.
// Ноль импортов Prisma / React / Next.
//
// Источник: §6.2 RESEARCH.md (формулы план/факт: pro-rata, FAC, ИУ-блок, накопительный итог)
// Golden test: tests/sales-plan-plan-fact.test.ts
//
// Phase 25 (План продаж v2, 2026-07)

import { bucketKey, bucketLabel, type Granularity } from "@/lib/date-buckets"
import { eachDayIso, addDays } from "./dates"
import type { IuTarget } from "./types"

// ── Input types ───────────────────────────────────────────────────────────────

export interface PlanDayInput {
  date: string
  planOrdersUnits: number
  planOrdersRub: number
  planBuyoutsUnits: number
  planBuyoutsRub: number
  priceUsed: number
  buyoutPctUsed: number
  stockEndUnits: number
}

export interface FactDayInput {
  date: string
  ordersUnits: number
  buyoutsUnits: number
  buyoutsRub: number
  ordersRub: number
}

export interface BuildPlanFactReportInput {
  /** today (YYYY-MM-DD) — граница план/факт + pro-rata */
  today: string
  /** Дневные строки плана (из версии или номинального драфта) */
  planDays: PlanDayInput[]
  /** Дневные строки факта (product-level, привязанные nmId) */
  factDays: FactDayInput[]
  /** Разбивка: day | week | month | quarter | halfyear | year */
  granularity: Granularity
  /** Диапазон отчёта */
  from: string
  to: string
  /** Нарастающий итог (кумулятив) */
  cumulative?: boolean
  /** Дни ≤ settledThroughIso считаются settled (default: today−7) */
  settledThroughIso?: string
  /** Company-level факт (весь кабинет, включая непривязанные nmId) */
  companyFactDays?: FactDayInput[]
  /** ИУ-таргеты для расчёта ИУ-блока */
  iuTargets?: IuTarget[]
  /** Метрика (buyouts-rub | buyouts-units | orders-rub | orders-units; default buyouts-rub) */
  metric?: "buyouts-rub" | "buyouts-units" | "orders-rub" | "orders-units"
}

// ── Output types ──────────────────────────────────────────────────────────────

export interface PlanFactBucket {
  /** Ключ бакета: "2026-07", "2026-Q3", "2026-H2", "2026-W27" и т.д. */
  key: string
  /** Человекочитаемая метка: "июл 2026", "Q3 2026", "H2 2026", … */
  label: string
  /** true если бакет содержит today (текущий, незавершённый) */
  isCurrentBucket: boolean
  /** Сумма плана за бакет (pro-rata для текущего: только дни ≤ yesterday) */
  planRub: number
  /** Сумма факта (product-level) за бакет */
  factRub: number
  /** Отклонение = факт − план */
  deviationRub: number
  /** Отклонение % = (факт/план − 1) × 100 (null если план=0) */
  deviationPct: number | null
  /** ИУ-сумма за бакет */
  iuRub: number
  /** Факт − ИУ */
  factVsIuRub: number
  /** Выполнение ИУ % */
  iuFulfillmentPct: number | null
  /** Строка «Вне плана» = company − product (null если companyFactDays не передан) */
  unplannedRub: number | null
  /** Строка «Вне плана» в единицах */
  unplannedUnits: number | null
  /** Все дни этого бакета — settled или нет */
  hasUnsettledDays: boolean
  /** Количество дней бакета */
  dayCount: number
  /** Полный план бакета (без pro-rata; для текущего = весь месяц) */
  planRubFull: number
  /** План за прошедшие дни (≤ вчера); для текущего = planRub */
  planRubToDate: number
  /** Полный ИУ бакета (= iuRub, не обрезан) */
  iuRubFull: number
  /** ИУ за прошедшие дни (≤ вчера) */
  iuRubToDate: number
  /** Прогноз бакета = factRub + (planRubFull − planRubToDate).
   *  past → factRub, текущий → факт + план остатка, future → planRubFull. */
  forecastRub: number
  /** Прошедших дней в бакете (≤ вчера) */
  elapsedDays: number
  /** Всего дней в бакете (= dayCount) */
  totalDays: number
}

export interface PlanFactKpi {
  /** Суммарный факт за период */
  factTotalRub: number
  /** Суммарный план за период (pro-rata текущего бакета — как в buckets) */
  planTotalRub: number
  /** Полный план всего горизонта (без pro-rata текущего месяца) */
  planHorizonFullRub: number
  /** Итоговое отклонение ₽ */
  deviationTotalRub: number
  /** Итоговое отклонение % */
  deviationTotalPct: number | null
  /** Суммарный ИУ за период */
  iuTotalRub: number
  /** Факт нарастающим (до вчера включительно) */
  factCumToYesterday: number
  /** ИУ нарастающим (до вчера включительно) */
  iuCumToYesterday: number
  /** Отставание от ИУ нарастающим (факт_накоп − иу_накоп(вчера)) */
  vsIuGapRub: number
  /** Эквивалент в днях (/dailyIuRub) */
  vsIuGapDays: number | null
  /** FAC = факт_накоп + план_остатка (до конца горизонта) */
  facPrimaryRub: number
  /** Требуемый run-rate = (иу_total − факт_накоп) / оставшиеся_дни */
  requiredRunRateRub: number | null
}

export interface PlanFactReport {
  buckets: PlanFactBucket[]
  /** Колонка «Итог» = агрегат по всему горизонту */
  total: PlanFactBucket
  /** KPI-агрегаты */
  kpi: PlanFactKpi
  /** Дни (ISO-строки) > settledThroughIso — unsettled (потребитель приглушает) */
  unsettledDays: string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseIsoUtc(s: string): Date {
  return new Date(s + "T00:00:00Z")
}

function dayRub(day: FactDayInput, metric: BuildPlanFactReportInput["metric"]): number {
  switch (metric) {
    case "orders-rub":
      return day.ordersRub
    case "buyouts-units":
      return day.buyoutsUnits
    case "orders-units":
      return day.ordersUnits
    default:
      return day.buyoutsRub
  }
}

function planDayRub(day: PlanDayInput, metric: BuildPlanFactReportInput["metric"]): number {
  switch (metric) {
    case "orders-rub":
      return day.planOrdersRub
    case "buyouts-units":
      return day.planBuyoutsUnits
    case "orders-units":
      return day.planOrdersUnits
    default:
      return day.planBuyoutsRub
  }
}

// ── buildPlanFactReport ───────────────────────────────────────────────────────

/**
 * Строит отчёт план/факт/ИУ по бакетам.
 *
 * Pure — принимает уже загруженные дневные ряды, не обращается к Prisma.
 */
export function buildPlanFactReport(input: BuildPlanFactReportInput): PlanFactReport {
  const {
    today,
    planDays,
    factDays,
    granularity,
    from,
    to,
    companyFactDays,
    iuTargets = [],
    metric = "buyouts-rub",
  } = input

  // Вычисляем yesterday и settledThrough
  const yesterdayDate = new Date(parseIsoUtc(today).getTime() - 86_400_000)
  const yesterday = yesterdayDate.toISOString().slice(0, 10)
  const settledThroughIso = input.settledThroughIso ?? addDays(today, -7)

  // Индексируем дни по датам для O(1) lookup
  const planByDate = new Map<string, PlanDayInput>()
  for (const d of planDays) planByDate.set(d.date, d)

  const factByDate = new Map<string, FactDayInput>()
  for (const d of factDays) factByDate.set(d.date, d)

  const companyByDate = new Map<string, FactDayInput>()
  if (companyFactDays) {
    for (const d of companyFactDays) companyByDate.set(d.date, d)
  }

  // ИУ-таргеты: дневная ставка per дата
  function iuDailyRub(date: string): number {
    if (iuTargets.length === 0) return 0
    const target = iuTargets.find((t) => t.from <= date && date <= t.to)
    return target ? target.dailyRub : 0
  }

  // Ключ бакета today (для определения isCurrentBucket)
  const todayBucketKey = bucketKey(parseIsoUtc(today), granularity)

  // Все дни в горизонте
  const allDays = eachDayIso(from, to)

  // Unsettled days: дни > settledThroughIso (потребитель приглушает)
  const unsettledDays = allDays.filter((d) => d > settledThroughIso)

  // ── Бакетирование ──────────────────────────────────────────────────────────

  // Структура аккумулятора per бакет
  interface BucketAcc {
    key: string
    planRub: number
    // pro-rata: план только за дни ≤ yesterday (для текущего бакета)
    planRubProRata: number
    factRub: number
    iuRub: number
    iuRubToDate: number
    companyRub: number
    hasUnsettled: boolean
    dayCount: number
    elapsedDays: number
  }

  const bucketMap = new Map<string, BucketAcc>()
  // Для сохранения порядка
  const bucketOrder: string[] = []

  for (const date of allDays) {
    const d = parseIsoUtc(date)
    const key = bucketKey(d, granularity)

    if (!bucketMap.has(key)) {
      bucketMap.set(key, {
        key,
        planRub: 0,
        planRubProRata: 0,
        factRub: 0,
        iuRub: 0,
        iuRubToDate: 0,
        companyRub: 0,
        hasUnsettled: false,
        dayCount: 0,
        elapsedDays: 0,
      })
      bucketOrder.push(key)
    }

    const acc = bucketMap.get(key)!
    acc.dayCount++

    // План — полная сумма
    const planDay = planByDate.get(date)
    if (planDay) {
      acc.planRub += planDayRub(planDay, metric)
      // Pro-rata: только дни ≤ yesterday
      if (date <= yesterday) {
        acc.planRubProRata += planDayRub(planDay, metric)
      }
    }

    // Факт (product-level)
    const factDay = factByDate.get(date)
    if (factDay) {
      acc.factRub += dayRub(factDay, metric)
    }

    // ИУ (полный + за прошедшие дни)
    const iuDay = iuDailyRub(date)
    acc.iuRub += iuDay
    if (date <= yesterday) {
      acc.iuRubToDate += iuDay
      acc.elapsedDays++
    }

    // Company-level (для «Вне плана»)
    if (companyFactDays) {
      const companyDay = companyByDate.get(date)
      if (companyDay) {
        acc.companyRub += dayRub(companyDay, metric)
      }
    }

    // Unsettled
    if (date > settledThroughIso) {
      acc.hasUnsettled = true
    }
  }

  // ── Построение PlanFactBucket[] ────────────────────────────────────────────

  const buckets: PlanFactBucket[] = bucketOrder.map((key) => {
    const acc = bucketMap.get(key)!
    const isCurrentBucket = key === todayBucketKey

    // Pro-rata для текущего бакета: используем plan только за ≤ yesterday
    const planRub = isCurrentBucket ? acc.planRubProRata : acc.planRub

    const factRub = acc.factRub
    const deviationRub = factRub - planRub
    const deviationPct = planRub !== 0 ? (factRub / planRub - 1) * 100 : null

    const iuRub = acc.iuRub
    const factVsIuRub = factRub - iuRub
    const iuFulfillmentPct = iuRub !== 0 ? (factRub / iuRub) * 100 : null

    // Вне плана: company − product (только если companyFactDays переданы)
    const unplannedRub = companyFactDays != null ? acc.companyRub - factRub : null
    // units для «вне плана» — только если metric units-based
    const unplannedUnits = unplannedRub != null ? unplannedRub : null

    return {
      key,
      label: bucketLabel(key, granularity),
      isCurrentBucket,
      planRub,
      factRub,
      deviationRub,
      deviationPct,
      iuRub,
      factVsIuRub,
      iuFulfillmentPct,
      unplannedRub,
      unplannedUnits,
      hasUnsettledDays: acc.hasUnsettled,
      dayCount: acc.dayCount,
      planRubFull: acc.planRub,
      planRubToDate: acc.planRubProRata,
      iuRubFull: acc.iuRub,
      iuRubToDate: acc.iuRubToDate,
      forecastRub: acc.factRub + (acc.planRub - acc.planRubProRata),
      elapsedDays: acc.elapsedDays,
      totalDays: acc.dayCount,
    }
  })

  // ── Итоговая колонка «Итог» (весь горизонт) ───────────────────────────────

  const totalPlanRub = buckets.reduce((s, b) => s + b.planRub, 0)
  const totalFactRub = buckets.reduce((s, b) => s + b.factRub, 0)
  const totalIuRub = buckets.reduce((s, b) => s + b.iuRub, 0)
  const totalCompanyRub = companyFactDays != null
    ? buckets.reduce((s, b) => s + (b.unplannedRub ?? 0) + b.factRub, 0)
    : null

  const totalDeviationRub = totalFactRub - totalPlanRub
  const totalDeviationPct = totalPlanRub !== 0 ? (totalFactRub / totalPlanRub - 1) * 100 : null
  const totalFactVsIuRub = totalFactRub - totalIuRub
  const totalIuFulfillmentPct = totalIuRub !== 0 ? (totalFactRub / totalIuRub) * 100 : null
  const totalUnplannedRub = totalCompanyRub != null ? totalCompanyRub - totalFactRub : null

  const total: PlanFactBucket = {
    key: "_total",
    label: "Итог",
    isCurrentBucket: false,
    planRub: totalPlanRub,
    factRub: totalFactRub,
    deviationRub: totalDeviationRub,
    deviationPct: totalDeviationPct,
    iuRub: totalIuRub,
    factVsIuRub: totalFactVsIuRub,
    iuFulfillmentPct: totalIuFulfillmentPct,
    unplannedRub: totalUnplannedRub,
    unplannedUnits: totalUnplannedRub,
    hasUnsettledDays: buckets.some((b) => b.hasUnsettledDays),
    dayCount: allDays.length,
    planRubFull: buckets.reduce((s, b) => s + b.planRubFull, 0),
    planRubToDate: buckets.reduce((s, b) => s + b.planRubToDate, 0),
    iuRubFull: buckets.reduce((s, b) => s + b.iuRubFull, 0),
    iuRubToDate: buckets.reduce((s, b) => s + b.iuRubToDate, 0),
    forecastRub: buckets.reduce((s, b) => s + b.forecastRub, 0),
    elapsedDays: buckets.reduce((s, b) => s + b.elapsedDays, 0),
    totalDays: allDays.length,
  }

  // ── KPI ────────────────────────────────────────────────────────────────────

  // Нарастающий факт до вчера включительно
  let factCumToYesterday = 0
  let iuCumToYesterday = 0
  let planRemainingRub = 0

  for (const date of allDays) {
    const factDay = factByDate.get(date)
    const factVal = factDay ? dayRub(factDay, metric) : 0
    const iuVal = iuDailyRub(date)

    if (date <= yesterday) {
      factCumToYesterday += factVal
      iuCumToYesterday += iuVal
    } else {
      // Будущие дни — план остатка (для FAC)
      const planDay = planByDate.get(date)
      if (planDay) {
        planRemainingRub += planDayRub(planDay, metric)
      }
    }
  }

  // Отставание от ИУ нарастающим
  const vsIuGapRub = factCumToYesterday - iuCumToYesterday

  // Дни-эквивалент отставания
  const avgDailyIuRub = iuTargets.length > 0 ? iuTargets[0]?.dailyRub : undefined
  const vsIuGapDays =
    avgDailyIuRub != null && avgDailyIuRub > 0 ? vsIuGapRub / avgDailyIuRub : null

  // FAC = факт нарастающим + план_остатка
  const facPrimaryRub = factCumToYesterday + planRemainingRub

  // Оставшиеся дни
  const futureDays = allDays.filter((d) => d > yesterday)
  const remainingDays = futureDays.length

  // Требуемый run-rate = (иу_итого − факт_накоп) / оставшиеся_дни
  const requiredRunRateRub =
    remainingDays > 0 ? (totalIuRub - factCumToYesterday) / remainingDays : null

  const kpi: PlanFactKpi = {
    factTotalRub: totalFactRub,
    planTotalRub: totalPlanRub,
    planHorizonFullRub: total.planRubFull,
    deviationTotalRub: totalDeviationRub,
    deviationTotalPct: totalDeviationPct,
    iuTotalRub: totalIuRub,
    factCumToYesterday,
    iuCumToYesterday,
    vsIuGapRub,
    vsIuGapDays,
    facPrimaryRub,
    requiredRunRateRub,
  }

  return { buckets, total, kpi, unsettledDays }
}

// ── compareVersions (дрейф черновика vs версии) ───────────────────────────────

export interface VersionDriftResult {
  /** Суммарное отклонение плана B − плана A по горизонту (₽ метрика buyouts-rub) */
  driftRub: number
  /** Относительное отклонение % = (planB − planA) / planA × 100 (null если planA = 0) */
  driftPct: number | null
  /** Количество дней в горизонте */
  dayCount: number
}

/**
 * «Дрейф» — насколько текущие правки черновика уводят от зафиксированной версии.
 *
 * Pure: принимает уже загруженные дневные ряды (массивы PlanDayInput),
 * не обращается к Prisma.
 *
 * Семантика: versionA = зафиксированная версия (baseline), versionB = черновик.
 * driftRub > 0 → черновик выше версии (рост плана).
 * driftRub < 0 → черновик ниже версии (снижение плана).
 *
 * Метрика — buyouts-rub (планBuyoutsRub), соответствует iuMetric.
 */
export function compareVersions(
  versionA_days: PlanDayInput[],
  versionB_days: PlanDayInput[],
): VersionDriftResult {
  let planA = 0
  let planB = 0

  const mapA = new Map<string, number>()
  for (const d of versionA_days) {
    mapA.set(d.date, d.planBuyoutsRub)
  }

  const mapB = new Map<string, number>()
  for (const d of versionB_days) {
    mapB.set(d.date, d.planBuyoutsRub)
  }

  // Юнион дат
  const allDates = new Set([...mapA.keys(), ...mapB.keys()])
  for (const date of allDates) {
    planA += mapA.get(date) ?? 0
    planB += mapB.get(date) ?? 0
  }

  const driftRub = planB - planA
  const driftPct = planA !== 0 ? (driftRub / planA) * 100 : null

  return {
    driftRub,
    driftPct,
    dayCount: allDates.size,
  }
}
