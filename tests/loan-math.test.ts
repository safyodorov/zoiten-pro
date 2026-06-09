import { describe, it, expect } from "vitest"
import {
  computeSchedule,
  computeLoanAggregates,
  computeStatus,
  bucketKey,
  bucketLabel,
  type PaymentInput,
} from "@/lib/loan-math"

// ──────────────────────────────────────────────────────────────────
// computeSchedule
// ──────────────────────────────────────────────────────────────────

describe("computeSchedule", () => {
  const payments: PaymentInput[] = [
    { date: "2026-01-15", principal: 100000, interest: 5000 },
    { date: "2026-02-15", principal: 100000, interest: 4500 },
  ]

  it("строка 1: balance = 900000 (amount 1000000 минус 100000)", () => {
    const rows = computeSchedule(1000000, payments)
    expect(rows[0].balance).toBe(900000)
  })

  it("строка 2: balance = 800000 (накопительно минус 200000)", () => {
    const rows = computeSchedule(1000000, payments)
    expect(rows[1].balance).toBe(800000)
  })

  it("строки отсортированы по дате ASC", () => {
    const reversed: PaymentInput[] = [
      { date: "2026-02-15", principal: 100000, interest: 4500 },
      { date: "2026-01-15", principal: 100000, interest: 5000 },
    ]
    const rows = computeSchedule(1000000, reversed)
    expect(rows[0].date.getTime()).toBeLessThan(rows[1].date.getTime())
    expect(rows[0].balance).toBe(900000)
    expect(rows[1].balance).toBe(800000)
  })

  it("правильно передаёт principal и interest в каждую строку", () => {
    const rows = computeSchedule(1000000, payments)
    expect(rows[0].principal).toBe(100000)
    expect(rows[0].interest).toBe(5000)
    expect(rows[1].principal).toBe(100000)
    expect(rows[1].interest).toBe(4500)
  })

  it("пустой payments[] → пустой массив строк", () => {
    const rows = computeSchedule(1000000, [])
    expect(rows).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────────────────────────
// computeLoanAggregates
// ──────────────────────────────────────────────────────────────────

describe("computeLoanAggregates", () => {
  const payments: PaymentInput[] = [
    { date: "2026-01-15", principal: 100000, interest: 5000 },
    { date: "2026-02-15", principal: 100000, interest: 4500 },
  ]

  it("totalPrincipalPaid = 200000", () => {
    const agg = computeLoanAggregates(1000000, payments)
    expect(agg.totalPrincipalPaid).toBe(200000)
  })

  it("totalInterestPaid = 9500", () => {
    const agg = computeLoanAggregates(1000000, payments)
    expect(agg.totalInterestPaid).toBe(9500)
  })

  it("currentBalance = 800000 (amount − totalPrincipalPaid)", () => {
    const agg = computeLoanAggregates(1000000, payments)
    expect(agg.currentBalance).toBe(800000)
  })

  it("overpayment = 9500 (= totalInterestPaid)", () => {
    const agg = computeLoanAggregates(1000000, payments)
    expect(agg.overpayment).toBe(9500)
  })

  it("Guard: пустой payments[] → currentBalance = amount", () => {
    const agg = computeLoanAggregates(1000000, [])
    expect(agg.currentBalance).toBe(1000000)
  })

  it("Guard: пустой payments[] → totalInterestPaid = 0", () => {
    const agg = computeLoanAggregates(1000000, [])
    expect(agg.totalInterestPaid).toBe(0)
  })

  it("Guard: пустой payments[] → totalPrincipalPaid = 0", () => {
    const agg = computeLoanAggregates(1000000, [])
    expect(agg.totalPrincipalPaid).toBe(0)
  })

  // asOf: будущие плановые платежи графика не считаются оплаченными.
  // Регрессия: seed загружает ПОЛНЫЙ график (Σtело == amount) → без asOf currentBalance == 0
  // и кредит ошибочно «погашен». С asOf учитываются только платежи с датой ≤ asOf.
  describe("asOf (полный график амортизации)", () => {
    const full: PaymentInput[] = [
      { date: "2024-06-15", principal: 300000, interest: 20000 }, // прошлый
      { date: "2026-01-15", principal: 300000, interest: 15000 }, // прошлый
      { date: "2027-06-15", principal: 400000, interest: 10000 }, // будущий плановый
    ]

    it("без asOf: Σтело == amount → currentBalance = 0 (баг полного графика)", () => {
      const agg = computeLoanAggregates(1000000, full)
      expect(agg.currentBalance).toBe(0)
      expect(agg.totalPrincipalPaid).toBe(1000000)
    })

    it("с asOf=2026-06-09: учтены только прошлые платежи → остаток 400000", () => {
      const agg = computeLoanAggregates(1000000, full, new Date(Date.UTC(2026, 5, 9)))
      expect(agg.totalPrincipalPaid).toBe(600000)
      expect(agg.totalInterestPaid).toBe(35000)
      expect(agg.currentBalance).toBe(400000)
    })

    it("платёж ровно в день asOf считается оплаченным (≤)", () => {
      const agg = computeLoanAggregates(
        1000000,
        [{ date: "2026-06-09", principal: 250000, interest: 1000 }],
        new Date(Date.UTC(2026, 5, 9))
      )
      expect(agg.currentBalance).toBe(750000)
    })
  })
})

// ──────────────────────────────────────────────────────────────────
// computeStatus
// ──────────────────────────────────────────────────────────────────

describe("computeStatus", () => {
  it("balance > 0 → 'active'", () => {
    expect(computeStatus(800000)).toBe("active")
  })

  it("balance = 0 → 'paid'", () => {
    expect(computeStatus(0)).toBe("paid")
  })

  it("balance < 0 → 'paid' (переплата)", () => {
    expect(computeStatus(-100)).toBe("paid")
  })

  it("небольшой остаток > 0 → 'active'", () => {
    expect(computeStatus(0.01)).toBe("active")
  })
})

// ──────────────────────────────────────────────────────────────────
// bucketKey
// ──────────────────────────────────────────────────────────────────

describe("bucketKey", () => {
  it('"day" → YYYY-MM-DD', () => {
    const d = new Date(Date.UTC(2026, 5, 9)) // 2026-06-09
    expect(bucketKey(d, "day")).toBe("2026-06-09")
  })

  it('"month" → YYYY-MM', () => {
    const d = new Date(Date.UTC(2026, 5, 9)) // June 2026
    expect(bucketKey(d, "month")).toBe("2026-06")
  })

  it('"week" → корректная ISO 8601 неделя для 2026-06-09 (вторник) → 2026-W24', () => {
    // 2026-06-09 — вторник, ISO-неделя 24 (понедельник 2026-06-08 — начало недели 24)
    const d = new Date(Date.UTC(2026, 5, 9))
    expect(bucketKey(d, "week")).toBe("2026-W24")
  })

  it('"week" → ISO 8601 для 2026-01-01 (четверг) → 2026-W01', () => {
    // 2026-01-01 — четверг, входит в ISO-неделю 1 2026
    const d = new Date(Date.UTC(2026, 0, 1))
    expect(bucketKey(d, "week")).toBe("2026-W01")
  })

  it('"week" → ISO 8601 для 2024-12-30 (понедельник) → 2025-W01', () => {
    // 2024-12-30 — понедельник, начало ISO-недели 1 2025 (ISO-год = 2025)
    const d = new Date(Date.UTC(2024, 11, 30))
    expect(bucketKey(d, "week")).toBe("2025-W01")
  })
})

// ──────────────────────────────────────────────────────────────────
// bucketLabel
// ──────────────────────────────────────────────────────────────────

describe("bucketLabel", () => {
  it('"day" → "09.06"', () => {
    expect(bucketLabel("2026-06-09", "day")).toBe("09.06")
  })

  it('"month" → "июн 2026"', () => {
    expect(bucketLabel("2026-06", "month")).toBe("июн 2026")
  })

  it('"week" → "нед. 24"', () => {
    expect(bucketLabel("2026-W24", "week")).toBe("нед. 24")
  })
})
