// tests/finance-weekly-credit-accrual.test.ts
// Quick 260710-hkj (W2d, Фикс 4): unit-тесты pure-функции weeklyAccruedInterest —
// недельное НАЧИСЛЕНИЕ процентов по кредитам: остаток тела на weekStart ×
// ставка/100 × 7/365 (вместо платежей по дате — большинство недель было 0).
//
// Тест-файл pure: ноль импортов Prisma/React.

import { describe, it, expect } from "vitest"

import {
  weeklyAccruedInterest,
  weeklyLoanExtras,
  type AccrualLoanInput,
  type LoanExtrasInput,
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

// quick 260714-ij9 (кредитный пул /finance/weekly v2, W3b): unit-тесты
// weeklyLoanExtras — недельная доля амортизации комиссии JetLend + НДФЛ.
describe("weeklyLoanExtras", () => {
  it("базовый ×7/30: 30000 × 7/30 = 7000", () => {
    const loans: LoanExtrasInput[] = [
      { monthlyCommissionRub: 30_000, monthlyNdflRub: 0, payments: [] },
    ]
    expect(weeklyLoanExtras(loans, WEEK_START)).toBe(7000)
  })

  it("сумма комиссии + НДФЛ: 45000 × 7/30 = 10500", () => {
    const loans: LoanExtrasInput[] = [
      {
        monthlyCommissionRub: 30_000,
        monthlyNdflRub: 15_000,
        payments: [{ date: "2026-07-15" }],
      },
    ]
    expect(weeklyLoanExtras(loans, WEEK_START)).toBe(10500)
  })

  it("оба поля null/undefined → вклад 0 (monthly <= 0)", () => {
    const loans: LoanExtrasInput[] = [
      { monthlyCommissionRub: null, monthlyNdflRub: null, payments: [] },
      { monthlyCommissionRub: undefined, monthlyNdflRub: undefined, payments: [] },
      { payments: [] },
    ]
    expect(weeklyLoanExtras(loans, WEEK_START)).toBe(0)
  })

  it("гейт issueDate: >= weekEndExclusive (2026-07-06) → 0; внутри недели → полный вклад", () => {
    const issuedNextMonday: LoanExtrasInput[] = [
      { monthlyCommissionRub: 30_000, issueDate: "2026-07-06", payments: [] },
    ]
    expect(weeklyLoanExtras(issuedNextMonday, WEEK_START)).toBe(0)

    const issuedLater: LoanExtrasInput[] = [
      { monthlyCommissionRub: 30_000, issueDate: "2026-08-01", payments: [] },
    ]
    expect(weeklyLoanExtras(issuedLater, WEEK_START)).toBe(0)

    const issuedMidWeek: LoanExtrasInput[] = [
      { monthlyCommissionRub: 30_000, issueDate: "2026-07-01", payments: [] },
    ]
    expect(weeklyLoanExtras(issuedMidWeek, WEEK_START)).toBe(7000)
  })

  it("гейт последнего планового платежа: max date < weekStart → 0; >= weekStart → полный вклад", () => {
    const expiredTerm: LoanExtrasInput[] = [
      {
        monthlyCommissionRub: 30_000,
        payments: [{ date: "2026-06-15" }],
      },
    ]
    expect(weeklyLoanExtras(expiredTerm, WEEK_START)).toBe(0)

    const activeTerm: LoanExtrasInput[] = [
      {
        monthlyCommissionRub: 30_000,
        payments: [{ date: "2026-07-15" }],
      },
    ]
    expect(weeklyLoanExtras(activeTerm, WEEK_START)).toBe(7000)

    // Ровно = weekStart (граница, включительно)
    const exactWeekStart: LoanExtrasInput[] = [
      {
        monthlyCommissionRub: 30_000,
        payments: [{ date: "2026-06-29" }],
      },
    ]
    expect(weeklyLoanExtras(exactWeekStart, WEEK_START)).toBe(7000)
  })

  it("кредит без платежей + issueDate null → включается (гейт последнего платежа не применяется)", () => {
    const loans: LoanExtrasInput[] = [
      { monthlyCommissionRub: 30_000, issueDate: null, payments: [] },
    ]
    expect(weeklyLoanExtras(loans, WEEK_START)).toBe(7000)
  })

  it("смесь кредитов → Σ вкладов: 7000 + 10500 + 0 = 17500", () => {
    const loans: LoanExtrasInput[] = [
      { monthlyCommissionRub: 30_000, payments: [] },
      {
        monthlyCommissionRub: 30_000,
        monthlyNdflRub: 15_000,
        payments: [{ date: "2026-07-15" }],
      },
      {
        monthlyCommissionRub: 99_999,
        payments: [{ date: "2026-06-15" }], // срок истёк → 0
      },
    ]
    expect(weeklyLoanExtras(loans, WEEK_START)).toBe(17500)
  })
})
