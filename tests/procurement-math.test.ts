import { describe, it, expect } from "vitest"
import {
  computeDepositDueDate,
  computeBalanceDueDate,
  recomputeAmountFromPercent,
  recomputePercentFromAmount,
  computePurchaseTotal,
} from "@/lib/procurement-math"

// ──────────────────────────────────────────────────────────────────
// RED stub — план 20-00 Wave 0 (D-08)
// ──────────────────────────────────────────────────────────────────
//
// lib/procurement-math.ts будет создан в плане 20-03. До этого тесты
// падают с "Cannot find module @/lib/procurement-math" — корректное
// RED-состояние Wave 0.
//
// Формулы (20-VALIDATION.md / 20-RESEARCH.md §"Pattern 6"):
//   depositDueDate = createdAt + 3 calendar days
//   balanceDueDate = depositDueDate + leadTimeDays
//   amount = totalAmount × percent / 100
//   percent = amount / totalAmount × 100 (guard total=0 → 0)
//   total = Σ(quantity × unitPrice)

// ──────────────────────────────────────────────────────────────────
// computeDepositDueDate (D-08)
// ──────────────────────────────────────────────────────────────────

describe("computeDepositDueDate", () => {
  it("adds exactly 3 calendar days", () => {
    const created = new Date("2026-06-09T10:00:00Z")
    const due = computeDepositDueDate(created)
    expect(due.toISOString().slice(0, 10)).toBe("2026-06-12")
  })

  it("crosses month boundary", () => {
    const created = new Date("2026-06-29T10:00:00Z")
    const due = computeDepositDueDate(created)
    expect(due.toISOString().slice(0, 10)).toBe("2026-07-02")
  })
})

// ──────────────────────────────────────────────────────────────────
// computeBalanceDueDate (D-08)
// ──────────────────────────────────────────────────────────────────

describe("computeBalanceDueDate", () => {
  it("depositDue + 30 leadDays = 30 days later", () => {
    const deposit = new Date("2026-06-12")
    const balance = computeBalanceDueDate(deposit, 30)
    expect(balance.toISOString().slice(0, 10)).toBe("2026-07-12")
  })
})

// ──────────────────────────────────────────────────────────────────
// recomputeAmountFromPercent (D-08 percent→amount)
// ──────────────────────────────────────────────────────────────────

describe("recomputeAmountFromPercent", () => {
  // totalAmount = 10 items × 500 CNY = 5000 CNY; deposit 30%
  it("30% of 5000 = 1500.00", () => {
    expect(recomputeAmountFromPercent(5000, 30)).toBe(1500)
  })

  it("handles non-round percent: 33.33% of 3000 ≈ 999.9", () => {
    const result = recomputeAmountFromPercent(3000, 33.33)
    expect(result).toBeCloseTo(999.9, 1)
  })
})

// ──────────────────────────────────────────────────────────────────
// recomputePercentFromAmount (D-08 amount→percent)
// ──────────────────────────────────────────────────────────────────

describe("recomputePercentFromAmount", () => {
  it("1500 / 5000 = 30.00%", () => {
    expect(recomputePercentFromAmount(5000, 1500)).toBe(30)
  })

  it("guard: totalAmount === 0 → 0", () => {
    expect(recomputePercentFromAmount(0, 100)).toBe(0)
  })
})

// ──────────────────────────────────────────────────────────────────
// computePurchaseTotal
// ──────────────────────────────────────────────────────────────────

describe("computePurchaseTotal", () => {
  it("одна позиция 10 × 500 = 5000", () => {
    expect(computePurchaseTotal([{ quantity: 10, unitPrice: 500 }])).toBe(5000)
  })
})
