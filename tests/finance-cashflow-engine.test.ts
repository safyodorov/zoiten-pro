import { describe, it, expect, vi } from "vitest"
import type { PrismaClient } from "@prisma/client"
import { computeCashflow } from "@/lib/finance-cashflow/engine"
import { loadCashflowInputs } from "@/lib/finance-cashflow/data"
import { getBankBalanceAsOf } from "@/lib/balance-data"
import type { CashflowInputs } from "@/lib/finance-cashflow/types"

// Моки prisma-зависимых модулей для регрессии CR-01 (loadCashflowInputs).
// Фабрики хойстятся vitest'ом — engine-тесты они не затрагивают (engine их не импортирует).
vi.mock("@/lib/balance-data", () => ({
  // id-aware: "acc-no-anchor" моделирует счёт без closingBalance/balanceDate → null (WR-09)
  getBankBalanceAsOf: vi.fn(async (accountId: string) =>
    accountId === "acc-no-anchor" ? null : 1_000,
  ),
  getRateForDate: vi.fn(async () => null),
}))
vi.mock("@/lib/sales-plan/pdds-feed", () => ({
  getPlannedRevenueSeries: vi.fn(async () => []),
  getPlannedVirtualPayments: vi.fn(async () => ({ payments: [], versionStale: false })),
}))

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
  // Дата внутри горизонта (to = 2026-07-14) — иначе ветка loanRub не проверяется (IN-06)
  loanPayments: [{ date: "2026-07-14", amountRub: 5_200_000 }],
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

  // ── Test 6: кредитные оттоки ─────────────────────────────────────
  it("Test 6 — loanRub: кредитный платёж в горизонте попадает в отток своего дня", () => {
    const result = computeCashflow(goldenInputs)
    const day14 = result.days.find((d) => d.date === "2026-07-14")
    expect(day14?.loanRub).toBe(5_200_000)
    expect(day14?.totalOutflow).toBeGreaterThanOrEqual(5_200_000)
    // Ни на какой другой день кредитный отток не попадает
    const totalLoan = result.days.reduce((acc, d) => acc + d.loanRub, 0)
    expect(totalLoan).toBe(5_200_000)
  })
})

// ──────────────────────────────────────────────────────────────────
// CR-01 регрессия: граница horizonFrom в loadCashflowInputs.
// Транзакция, датированная ровно первым днём горизонта, должна попасть
// в факт-ряд РОВНО один раз и НЕ попасть в стартовый баланс.
// ──────────────────────────────────────────────────────────────────

describe("loadCashflowInputs — CR-01: потоки первого дня горизонта не удваиваются", () => {
  it("старт якорится на конец предыдущего дня; дельта дня 1 — только в факт-ряду", async () => {
    const horizonFromDate = new Date("2025-01-01T00:00:00Z")

    // Fake db: только методы, реально используемые loadCashflowInputs
    const raw = {
      appSetting: { findMany: vi.fn(async () => []) },
      bankAccount: { findMany: vi.fn(async () => [{ id: "acc-1" }]) },
      cashEntry: {
        groupBy: vi.fn(async (_args: unknown) => []),
        findMany: vi.fn(async () => []),
      },
      purchasePayment: { findMany: vi.fn(async () => []) },
      loanPayment: { findMany: vi.fn(async () => []) },
      bankTransaction: {
        findMany: vi.fn(async () => [
          // транзакция ровно в день horizonFrom
          { date: horizonFromDate, direction: "CREDIT", amount: 500 },
        ]),
      },
    }
    const db = raw as unknown as PrismaClient

    const inputs = await loadCashflowInputs(db, {
      versionId: "v-test",
      horizonFrom: "2025-01-01",
      horizonTo: "2025-01-31",
    })

    // Банк: asOf = конец предыдущего дня (2024-12-31), НЕ horizonFrom
    expect(vi.mocked(getBankBalanceAsOf)).toHaveBeenCalledWith(
      "acc-1",
      new Date("2024-12-31T00:00:00Z"),
    )

    // Касса: строго ДО первого дня горизонта (lt, не lte)
    const groupByArgs = raw.cashEntry.groupBy.mock.calls[0]?.[0] as {
      where?: { date?: { lt?: Date; lte?: Date } }
    }
    expect(groupByArgs?.where?.date?.lt).toEqual(horizonFromDate)
    expect(groupByArgs?.where?.date?.lte).toBeUndefined()

    // Транзакция 500 ₽ дня horizonFrom НЕ входит в стартовый баланс…
    expect(inputs.startingBalance).toBe(1_000)
    // …но ровно один раз входит в факт-ряд первого дня
    const day1 = inputs.actualBalanceSeries?.find((d) => d.date === "2025-01-01")
    expect(day1?.balanceRub).toBe(1_500)
  })
})

// ──────────────────────────────────────────────────────────────────
// WR-04 регрессия: повреждённое значение AppSetting (нечисловая или
// пустая строка) не должно протекать NaN'ом в CashflowInputs.
// ──────────────────────────────────────────────────────────────────

describe("loadCashflowInputs — WR-04: NaN-guard настроек AppSetting", () => {
  it("нечисловая/пустая строка в AppSetting → дефолт, NaN не утекает", async () => {
    const raw = {
      appSetting: {
        findMany: vi.fn(async () => [
          { key: "finance.cashflow.wbPayoutPct", value: "мусор" }, // Number() → NaN
          { key: "finance.cashflow.opexMonthlyRub", value: "" },   // Number("") → 0, но это «нет значения»
          { key: "finance.cashflow.gapThresholdRub", value: "250000" }, // валидное — сохраняется
        ]),
      },
      bankAccount: { findMany: vi.fn(async () => []) },
      cashEntry: {
        groupBy: vi.fn(async () => []),
        findMany: vi.fn(async () => []),
      },
      purchasePayment: { findMany: vi.fn(async () => []) },
      loanPayment: { findMany: vi.fn(async () => []) },
      bankTransaction: { findMany: vi.fn(async () => []) },
    }
    const db = raw as unknown as PrismaClient

    const inputs = await loadCashflowInputs(db, {
      versionId: "v-test",
      horizonFrom: "2025-01-01",
      horizonTo: "2025-01-31",
    })

    expect(inputs.wbPayoutPct).toBe(55)        // дефолт вместо NaN
    expect(inputs.opexMonthlyRub).toBe(0)      // дефолт вместо «пустой строки»
    expect(inputs.gapThresholdRub).toBe(250_000) // валидное значение не трогается
    expect(inputs.wbPayoutLagWeeks).toBe(1)    // отсутствующий ключ → дефолт
    expect(Number.isFinite(inputs.startingBalance)).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────────────
// WR-09 регрессия: транзакции счёта без анкера (getBankBalanceAsOf → null)
// не должны попадать в факт-ряд — набор счетов един со стартовым балансом.
// ──────────────────────────────────────────────────────────────────

describe("loadCashflowInputs — WR-09: счета без анкера исключены из факт-ряда", () => {
  it("txRows фильтруются по счетам, вошедшим в стартовый баланс", async () => {
    const raw = {
      appSetting: { findMany: vi.fn(async () => []) },
      bankAccount: {
        // acc-1 — с анкером (1000 ₽), acc-no-anchor — без (null)
        findMany: vi.fn(async () => [{ id: "acc-1" }, { id: "acc-no-anchor" }]),
      },
      cashEntry: {
        groupBy: vi.fn(async () => []),
        findMany: vi.fn(async () => []),
      },
      purchasePayment: { findMany: vi.fn(async () => []) },
      loanPayment: { findMany: vi.fn(async () => []) },
      bankTransaction: { findMany: vi.fn(async () => []) },
    }
    const db = raw as unknown as PrismaClient

    const inputs = await loadCashflowInputs(db, {
      versionId: "v-test",
      horizonFrom: "2025-01-01",
      horizonTo: "2025-01-31",
    })

    // Счёт без анкера не даёт вклад в стартовый баланс…
    expect(inputs.startingBalance).toBe(1_000)

    // …и его транзакции исключены из факт-ряда (шаг 8)
    const txArgs = raw.bankTransaction.findMany.mock.calls[0]?.[0] as {
      where?: { accountId?: { in?: string[] } }
    }
    expect(txArgs?.where?.accountId?.in).toEqual(["acc-1"])
  })
})
