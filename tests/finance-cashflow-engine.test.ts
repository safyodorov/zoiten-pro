import { describe, it, expect } from "vitest"
import { computeCashflow } from "@/lib/finance-cashflow/engine"
import type { CashflowInputs } from "@/lib/finance-cashflow/types"

// ──────────────────────────────────────────────────────────────────
// Golden inputs — 2 недели для проверки тайминга WB
//
// Выкупы 2026-07-01 (Ср):
//   dow=3 (Ср), daysSinceMonday=(3+6)%7=2
//   weekMondayMs = 2026-07-01 − 2д = 2026-06-29 (Пн)
//   reportMondayMs = 2026-06-29 + 7д = 2026-07-06 (Пн)
//   cashMs = 2026-07-06 + 1×7д = 2026-07-13 (Пн)
//
// Итог: выплата за 2026-07-01 → 2026-07-13
// ──────────────────────────────────────────────────────────────────

const goldenInputs: CashflowInputs = {
  horizonFrom: "2026-07-01",
  horizonTo: "2026-07-14",
  startingBalance: 15_600_000,
  gapThresholdRub: 0,
  revenueSeries: [
    { date: "2026-07-01", buyoutsRub: 1_000_000 },
    { date: "2026-07-02", buyoutsRub: 900_000 },
    { date: "2026-07-03", buyoutsRub: 1_100_000 },
    { date: "2026-07-04", buyoutsRub: 950_000 },
    { date: "2026-07-05", buyoutsRub: 850_000 },
    { date: "2026-07-06", buyoutsRub: 1_050_000 },
    { date: "2026-07-07", buyoutsRub: 800_000 },
    { date: "2026-07-08", buyoutsRub: 1_200_000 },
    { date: "2026-07-09", buyoutsRub: 1_100_000 },
    { date: "2026-07-10", buyoutsRub: 900_000 },
    { date: "2026-07-11", buyoutsRub: 950_000 },
    { date: "2026-07-12", buyoutsRub: 1_000_000 },
    { date: "2026-07-13", buyoutsRub: 1_150_000 },
    { date: "2026-07-14", buyoutsRub: 1_050_000 },
  ],
  wbPayoutPct: 55,
  wbPayoutLagWeeks: 1,
  payoutModel: "coefficient",
  realPurchasePayments: [],
  virtualPayments: [{ date: "2026-07-05", amountRub: 1_000_000 }],
  loanPayments: [{ date: "2026-07-15", amountRub: 5_200_000 }],
  taxPayments: [],
  opexMonthlyRub: 0,
}

describe("computeCashflow", () => {
  // ── Test 1: conservation ─────────────────────────────────────────
  it("Test 1 — conservation: остаток последнего дня = старт + Σ netFlow", () => {
    const result = computeCashflow(goldenInputs)
    const lastDay = result.days[result.days.length - 1]
    const sumNetFlow = result.days.reduce((acc, d) => acc + d.netFlow, 0)
    expect(lastDay.balanceEnd).toBeCloseTo(goldenInputs.startingBalance + sumNetFlow, 2)
  })

  // ── Test 2: тайминг WB ───────────────────────────────────────────
  it("Test 2 — тайминг WB: выкупы 2026-07-01 (Ср) → выплата 2026-07-13 (Пн)", () => {
    const result = computeCashflow(goldenInputs)
    // На 2026-07-01 не должно быть выплаты WB (выкуп за этот день придёт 2026-07-13)
    const day01 = result.days.find((d) => d.date === "2026-07-01")
    expect(day01?.wbPayoutRub).toBe(0)
    // На 2026-07-13 должна быть выплата (за неделю Пн 2026-06-29 — Вс 2026-07-05)
    const day13 = result.days.find((d) => d.date === "2026-07-13")
    expect(day13?.wbPayoutRub).toBeGreaterThan(0)
  })

  // ── Test 3: gap-детекция ─────────────────────────────────────────
  it("Test 3 — gap: большой отток → isGap=true + firstGapDate заполняется", () => {
    const gapInputs: CashflowInputs = {
      ...goldenInputs,
      startingBalance: 100,   // минимальный остаток
      gapThresholdRub: 0,
      virtualPayments: [{ date: "2026-07-05", amountRub: 50_000_000 }], // огромный отток
    }
    const result = computeCashflow(gapInputs)
    const gapDay = result.days.find((d) => d.date === "2026-07-05")
    expect(gapDay?.isGap).toBe(true)
    expect(result.firstGapDate).toBe("2026-07-05")
  })

  // ── Test 4: анти-двойной счёт ────────────────────────────────────
  it("Test 4 — анти-двойной счёт: virtualPayments передаются как есть, движок не переоценивает", () => {
    const vpInputs: CashflowInputs = {
      ...goldenInputs,
      virtualPayments: [
        { date: "2026-07-03", amountRub: 500_000 },
        { date: "2026-07-10", amountRub: 750_000 },
      ],
      realPurchasePayments: [],
    }
    const result = computeCashflow(vpInputs)
    // Сумма всех virtualPurchaseRub по дням = сумма переданных virtualPayments
    const totalVirtualOutflow = result.days.reduce((acc, d) => acc + d.virtualPurchaseRub, 0)
    expect(totalVirtualOutflow).toBeCloseTo(500_000 + 750_000, 2)
    // На конкретных датах совпадают
    const day03 = result.days.find((d) => d.date === "2026-07-03")
    const day10 = result.days.find((d) => d.date === "2026-07-10")
    expect(day03?.virtualPurchaseRub).toBeCloseTo(500_000, 2)
    expect(day10?.virtualPurchaseRub).toBeCloseTo(750_000, 2)
  })

  // ── Test 5: сменная payout-модель ───────────────────────────────
  it("Test 5 — сменная payout-модель: кастомная payoutFn применяется вместо wbPayoutPct", () => {
    // Кастомная payoutFn: 90% вместо стандартных 55%
    const customPayoutFn = (_d: string, rub: number) => rub * 0.9

    const resultDefault = computeCashflow(goldenInputs)
    const resultCustom = computeCashflow(goldenInputs, "month", customPayoutFn)

    // Сумма WB-приходов в горизонте при кастомной функции = сумма при дефолтной × (0.9/0.55)
    // (не все пейауты попадают в 2-недельный горизонт, но соотношение должно быть постоянным)
    const totalWbPayoutDefault = resultDefault.days.reduce((acc, d) => acc + d.wbPayoutRub, 0)
    const totalWbPayoutCustom = resultCustom.days.reduce((acc, d) => acc + d.wbPayoutRub, 0)

    // Кастомная функция даёт 0.9/0.55 ≈ 1.636 раза больше, чем дефолтная
    if (totalWbPayoutDefault > 0) {
      const ratio = totalWbPayoutCustom / totalWbPayoutDefault
      expect(ratio).toBeCloseTo(0.9 / 0.55, 3)
    }

    // Кастомная (90%) должна давать больше, чем дефолтная (55%)
    expect(totalWbPayoutCustom).toBeGreaterThan(totalWbPayoutDefault)
  })
})
