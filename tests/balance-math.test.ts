import { describe, it, expect } from "vitest"
import {
  computeQuarterAccrual,
  computeTaxLiability,
  computeCapital,
  computeDelta,
  type TaxLiabilityInputs,
} from "@/lib/balance-math"

// ──────────────────────────────────────────────────────────────────
// computeQuarterAccrual (D-16 начисление за ОДИН квартал, БЕЗ вычитания
// уплаченного — вычитание платежей делается глобально в computeTaxLiability).
// ──────────────────────────────────────────────────────────────────

describe("computeQuarterAccrual — D-16", () => {
  it("buyouts=1_000_000, vat=7, incomeTax=1 → 80_000", () => {
    const out = computeQuarterAccrual(1_000_000, 7, 1)
    expect(out).toBeCloseTo(80_000, 2)
  })

  it("buyouts=0 → 0", () => {
    const out = computeQuarterAccrual(0, 7, 1)
    expect(out).toBeCloseTo(0, 2)
  })
})

// ──────────────────────────────────────────────────────────────────
// computeTaxLiability (B3/M4 — accruedTotal − taxesPaidTotal, вычитание
// платежей ЕДИНОЖДЫ, вне ветвления факт/расчёт).
// ──────────────────────────────────────────────────────────────────

describe("computeTaxLiability — B3 (вычитание платежей единожды, глобально)", () => {
  it("Кейс 1 (golden): accruedTotal=90_000 (факт закрытого Q 50_000 + начисление текущего Q 40_000), taxesPaidTotal=30_000 → 60_000", () => {
    const inputs: TaxLiabilityInputs = { accruedTotal: 90_000, taxesPaidTotal: 30_000 }
    expect(computeTaxLiability(inputs)).toBeCloseTo(60_000, 2)
  })

  it("Кейс 2 (нулевая база): accruedTotal=0, taxesPaidTotal=0 → 0", () => {
    const inputs: TaxLiabilityInputs = { accruedTotal: 0, taxesPaidTotal: 0 }
    expect(computeTaxLiability(inputs)).toBeCloseTo(0, 2)
  })

  it("Кейс 3 (переплата уводит в минус): accruedTotal=8_000, taxesPaidTotal=50_000 → −42_000 (допустимо отрицательное)", () => {
    const inputs: TaxLiabilityInputs = { accruedTotal: 8_000, taxesPaidTotal: 50_000 }
    expect(computeTaxLiability(inputs)).toBeCloseTo(-42_000, 2)
  })

  it("Кейс 4 (B3 — факт за Q + платёж ВНУТРИ факт-квартала): accruedTotal=50_000 (факт закрытого Q), taxesPaidTotal=20_000 (платёж датирован внутри того же факт-квартала) → 30_000, НЕ 50_000 (платёж вычтен глобально, не потерян в факт-ветке — обязательство не завышено)", () => {
    const inputs: TaxLiabilityInputs = { accruedTotal: 50_000, taxesPaidTotal: 20_000 }
    const out = computeTaxLiability(inputs)
    expect(out).toBeCloseTo(30_000, 2)
    expect(out).not.toBeCloseTo(50_000, 2)
  })
})

// ──────────────────────────────────────────────────────────────────
// computeCapital (D-06 — Активы − Пассивы, балансирующая строка)
// ──────────────────────────────────────────────────────────────────

describe("computeCapital — D-06", () => {
  it("assets=1000, liabilities=400 → 600", () => {
    expect(computeCapital(1000, 400)).toBeCloseTo(600, 2)
  })

  it("assets=400, liabilities=1000 → −600 (капитал может быть отрицательным)", () => {
    expect(computeCapital(400, 1000)).toBeCloseTo(-600, 2)
  })
})

// ──────────────────────────────────────────────────────────────────
// computeDelta (D-09 — abs и pct с guard на деление на ноль)
// ──────────────────────────────────────────────────────────────────

describe("computeDelta — D-09", () => {
  it("current=150, compare=100 → { abs:50, pct:50 }", () => {
    const out = computeDelta(150, 100)
    expect(out.abs).toBeCloseTo(50, 2)
    expect(out.pct).toBeCloseTo(50, 2)
  })

  it("current=80, compare=100 → { abs:−20, pct:−20 }", () => {
    const out = computeDelta(80, 100)
    expect(out.abs).toBeCloseTo(-20, 2)
    expect(out.pct).toBeCloseTo(-20, 2)
  })

  it("current=50, compare=0 → { abs:50, pct:null } (guard деления на ноль)", () => {
    const out = computeDelta(50, 0)
    expect(out.abs).toBeCloseTo(50, 2)
    expect(out.pct).toBe(null)
  })

  it("compare отрицательное: current=−50, compare=−100 → { abs:50, pct:50 } (pct по |compare|)", () => {
    const out = computeDelta(-50, -100)
    expect(out.abs).toBeCloseTo(50, 2)
    expect(out.pct).toBeCloseTo(50, 2)
  })
})
