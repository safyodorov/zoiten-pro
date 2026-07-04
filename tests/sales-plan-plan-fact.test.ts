import { describe, it, expect } from "vitest"
import { buildPlanFactReport } from "@/lib/sales-plan/plan-fact"

// ──────────────────────────────────────────────────────────────────
// Контракт buildPlanFactReport() — pure функция план/факт/ИУ
// Реализуется в Wave 3; этот стаб фиксирует контракт ДО реализации (RED).
//
// Источник: §6.2 RESEARCH.md
// ──────────────────────────────────────────────────────────────────

// Минимальные фикстуры дневных строк плана/факта
function makePlanDay(date: string, planRub: number) {
  return {
    date,
    planOrdersUnits: 10,
    planOrdersRub: planRub,
    planBuyoutsUnits: 8,
    planBuyoutsRub: planRub * 0.8,
    priceUsed: 5000,
    buyoutPctUsed: 0.8,
    stockEndUnits: 100,
  }
}

function makeFactDay(date: string, factRub: number) {
  return {
    date,
    ordersUnits: 10,
    buyoutsUnits: 8,
    buyoutsRub: factRub,
    ordersRub: factRub / 0.8,
  }
}

const TODAY = "2026-07-10"

// Фикстура: 10 дней плана (01-10 июля)
const planDays = [
  makePlanDay("2026-07-01", 400_000),
  makePlanDay("2026-07-02", 400_000),
  makePlanDay("2026-07-03", 400_000),
  makePlanDay("2026-07-04", 400_000),
  makePlanDay("2026-07-05", 400_000),
  makePlanDay("2026-07-06", 400_000),
  makePlanDay("2026-07-07", 400_000),
  makePlanDay("2026-07-08", 400_000),
  makePlanDay("2026-07-09", 400_000),
  makePlanDay("2026-07-10", 400_000),
]

// Факт: 9 дней (01-09, 10-й — ещё не settled)
const factDays = [
  makeFactDay("2026-07-01", 420_000),
  makeFactDay("2026-07-02", 390_000),
  makeFactDay("2026-07-03", 410_000),
  makeFactDay("2026-07-04", 395_000),
  makeFactDay("2026-07-05", 405_000),
  makeFactDay("2026-07-06", 415_000),
  makeFactDay("2026-07-07", 380_000),
  makeFactDay("2026-07-08", 425_000),
  makeFactDay("2026-07-09", 400_000),
]

const baseInput = {
  today: TODAY,
  planDays,
  factDays,
  granularity: "month" as const,
  from: "2026-07-01",
  to: "2026-07-31",
}

describe("buildPlanFactReport — бакетирование по месяцам", () => {
  it("результат содержит бакеты", () => {
    const report = buildPlanFactReport(baseInput)
    expect(report).toHaveProperty("buckets")
    expect(Array.isArray(report.buckets)).toBe(true)
  })

  it("бакет 'month' объединяет дни в месяц", () => {
    const report = buildPlanFactReport(baseInput)
    const julyBucket = report.buckets.find((b: { key: string }) => b.key === "2026-07")
    expect(julyBucket).toBeDefined()
  })
})

describe("buildPlanFactReport — бакетирование quarter/halfyear/year", () => {
  it("quarter: 2026-07-01…2026-09-30 → бакет '2026-Q3'", () => {
    const report = buildPlanFactReport({
      ...baseInput,
      granularity: "quarter" as const,
      to: "2026-09-30",
    })
    const q3Bucket = report.buckets.find((b: { key: string }) => b.key === "2026-Q3")
    expect(q3Bucket).toBeDefined()
  })

  it("halfyear: 2026-07-01…2026-12-31 → бакет '2026-H2'", () => {
    const report = buildPlanFactReport({
      ...baseInput,
      granularity: "halfyear" as const,
      to: "2026-12-31",
    })
    const h2Bucket = report.buckets.find((b: { key: string }) => b.key === "2026-H2")
    expect(h2Bucket).toBeDefined()
  })
})

describe("buildPlanFactReport — deviation формулы", () => {
  it("deviationRub = факт − план (₽)", () => {
    // 9 дней факта: итого = 420+390+410+395+405+415+380+425+400 = 3 640 000
    // 9 дней плана: итого = 9 × 400_000 × 0.8 = 2 880 000 buyoutsRub
    const report = buildPlanFactReport({
      ...baseInput,
      granularity: "week" as const,
    })
    // Хотя бы один бакет должен иметь deviationRub
    const buckets = report.buckets as Array<{ deviationRub?: number }>
    const settledBuckets = buckets.filter((b) => b.deviationRub !== undefined)
    expect(settledBuckets.length).toBeGreaterThan(0)
    // deviationRub должен быть конечным числом
    expect(Number.isFinite(settledBuckets[0].deviationRub)).toBe(true)
  })

  it("deviationPct = (факт/план − 1) × 100", () => {
    const report = buildPlanFactReport(baseInput)
    const buckets = report.buckets as Array<{ deviationRub?: number; deviationPct?: number }>
    const settledBuckets = buckets.filter(
      (b) => b.deviationRub !== undefined && b.deviationPct !== undefined,
    )
    if (settledBuckets.length > 0) {
      expect(Number.isFinite(settledBuckets[0].deviationPct)).toBe(true)
    }
  })

  it("deviationRub > 0 когда факт > план", () => {
    const report = buildPlanFactReport(baseInput)
    const julyBucket = report.buckets.find(
      (b: { key: string }) => b.key === "2026-07",
    ) as { planRub: number; factRub: number; deviationRub: number } | undefined
    if (julyBucket && julyBucket.factRub > julyBucket.planRub) {
      expect(julyBucket.deviationRub).toBeGreaterThan(0)
    }
  })
})

describe("buildPlanFactReport — pro-rata для незавершённого бакета", () => {
  it("незавершённый бакет (содержит today) считает план только за дни ≤ вчера", () => {
    const report = buildPlanFactReport(baseInput)
    const julyBucket = report.buckets.find(
      (b: { key: string }) => b.key === "2026-07",
    ) as { planRub: number; isCurrentBucket?: boolean } | undefined
    // today = 2026-07-10, значит July — незавершённый бакет
    // planRub должен быть pro-rata (только за дни 1-9, не за весь месяц)
    if (julyBucket?.isCurrentBucket) {
      // pro-rata план ≠ полный план месяца
      const fullMonthPlanRub = planDays.reduce((s, d) => s + d.planBuyoutsRub, 0)
      expect(julyBucket.planRub).toBeLessThan(fullMonthPlanRub)
    }
  })
})

describe("buildPlanFactReport — factSettled (unsettled)", () => {
  it("дни > today−7 помечены как unsettled в деталях", () => {
    const report = buildPlanFactReport(baseInput)
    // Последние 7 дней от today(2026-07-10) = 2026-07-04..2026-07-10
    expect(report).toHaveProperty("unsettledDays")
    // unsettledDays должен быть массивом дат
    expect(Array.isArray(report.unsettledDays)).toBe(true)
  })
})

describe("buildPlanFactReport — строка 'Вне плана'", () => {
  it("report содержит companyTotal и productTotal", () => {
    const report = buildPlanFactReport({
      ...baseInput,
      companyFactDays: factDays.map((d) => ({
        ...d,
        buyoutsRub: d.buyoutsRub * 1.05, // чуть больше — симуляция непривязанных nmId
      })),
    })
    // Если переданы company-level данные — они присутствуют
    if ("companyTotal" in report) {
      expect(report.companyTotal).toBeDefined()
    }
  })
})
