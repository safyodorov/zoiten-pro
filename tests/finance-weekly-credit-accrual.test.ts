// tests/finance-weekly-credit-accrual.test.ts
// Quick 260710-hkj (W2d, Фикс 4): unit-тесты pure-функции weeklyAccruedInterest —
// недельное НАЧИСЛЕНИЕ процентов по кредитам: остаток тела на weekStart ×
// ставка/100 × 7/365 (вместо платежей по дате — большинство недель было 0).
//
// Тест-файл pure: ноль импортов Prisma/React.

import { describe, it, expect } from "vitest"

import {
  weeklyAccruedInterest,
  type AccrualLoanInput,
} from "@/lib/finance-weekly/credit-accrual"

const WEEK_START = new Date("2026-06-29T00:00:00Z") // UTC-понедельник

describe("weeklyAccruedInterest", () => {
  it("один кредит без платежей: 1 000 000 × 28% × 7/365 = 5369.86", () => {
    const loans: AccrualLoanInput[] = [
      { amount: 1_000_000, annualRatePct: 28, payments: [] },
    ]
    expect(weeklyAccruedInterest(loans, WEEK_START)).toBe(5369.86)
  })

  it("платежи principal ДО weekStart уменьшают остаток; В ДЕНЬ weekStart и позже — нет", () => {
    // Платёж 400 000 строго до weekStart → остаток 600 000
    const reduced: AccrualLoanInput[] = [
      {
        amount: 1_000_000,
        annualRatePct: 28,
        payments: [{ date: "2026-06-28", principal: 400_000 }],
      },
    ]
    // 600 000 × 0.28 × 7/365 = 3221.92
    expect(weeklyAccruedInterest(reduced, WEEK_START)).toBe(3221.92)

    // Платёж В ДЕНЬ weekStart (2026-06-29) — НЕ уменьшает (строго date < weekStart)
    const onDay: AccrualLoanInput[] = [
      {
        amount: 1_000_000,
        annualRatePct: 28,
        payments: [{ date: "2026-06-29", principal: 400_000 }],
      },
    ]
    expect(weeklyAccruedInterest(onDay, WEEK_START)).toBe(5369.86)

    // Будущий плановый платёж — тоже не уменьшает
    const future: AccrualLoanInput[] = [
      {
        amount: 1_000_000,
        annualRatePct: 28,
        payments: [{ date: "2026-08-15", principal: 400_000 }],
      },
    ]
    expect(weeklyAccruedInterest(future, WEEK_START)).toBe(5369.86)
  })

  it("погашенный кредит (остаток <= 0) → вклад 0", () => {
    const paidOff: AccrualLoanInput[] = [
      {
        amount: 500_000,
        annualRatePct: 28,
        payments: [
          { date: "2026-01-15", principal: 300_000 },
          { date: "2026-03-15", principal: 200_000 },
        ],
      },
    ]
    expect(weeklyAccruedInterest(paidOff, WEEK_START)).toBe(0)

    // Отрицательный остаток (переплата тела) — тоже 0
    const overpaid: AccrualLoanInput[] = [
      {
        amount: 500_000,
        annualRatePct: 28,
        payments: [{ date: "2026-01-15", principal: 600_000 }],
      },
    ]
    expect(weeklyAccruedInterest(overpaid, WEEK_START)).toBe(0)
  })

  it("несколько кредитов → Σ вкладов", () => {
    const loans: AccrualLoanInput[] = [
      { amount: 1_000_000, annualRatePct: 28, payments: [] },
      {
        amount: 1_000_000,
        annualRatePct: 28,
        payments: [{ date: "2026-06-28", principal: 400_000 }],
      },
    ]
    // 5369.863... + 3221.917... = 8591.780... → round2(Σ) = 8591.78
    expect(weeklyAccruedInterest(loans, WEEK_START)).toBe(8591.78)
  })

  it("interest-поля платежей игнорируются (формула от тела, не от графика процентов)", () => {
    // Объект с лишним interest-полем через промежуточную const (structural typing)
    const paymentsWithInterest = [
      { date: "2026-06-28", principal: 400_000, interest: 99_999 },
    ]
    const loans: AccrualLoanInput[] = [
      { amount: 1_000_000, annualRatePct: 28, payments: paymentsWithInterest },
    ]
    expect(weeklyAccruedInterest(loans, WEEK_START)).toBe(3221.92)
  })

  it("issueDate guard: кредит, выданный ПОСЛЕ недели, вклада не даёт (листание в прошлое)", () => {
    // issueDate >= weekEnd (эксклюзивно, weekStart + 7д) → 0
    const issuedNextMonday: AccrualLoanInput[] = [
      {
        amount: 1_000_000,
        annualRatePct: 28,
        issueDate: "2026-07-06", // ровно weekStart + 7д (следующий Пн) → недели не застал
        payments: [],
      },
    ]
    expect(weeklyAccruedInterest(issuedNextMonday, WEEK_START)).toBe(0)

    const issuedLater: AccrualLoanInput[] = [
      {
        amount: 1_000_000,
        annualRatePct: 28,
        issueDate: "2026-08-01",
        payments: [],
      },
    ]
    expect(weeklyAccruedInterest(issuedLater, WEEK_START)).toBe(0)

    // issueDate ВНУТРИ недели → полный вклад (упрощение v1, без пропорции дней)
    const issuedMidWeek: AccrualLoanInput[] = [
      {
        amount: 1_000_000,
        annualRatePct: 28,
        issueDate: "2026-07-01",
        payments: [],
      },
    ]
    expect(weeklyAccruedInterest(issuedMidWeek, WEEK_START)).toBe(5369.86)

    // issueDate null/не задан → включать (задокументировано: ручное поле, nullable)
    const nullIssue: AccrualLoanInput[] = [
      { amount: 1_000_000, annualRatePct: 28, issueDate: null, payments: [] },
    ]
    expect(weeklyAccruedInterest(nullIssue, WEEK_START)).toBe(5369.86)
  })
})
