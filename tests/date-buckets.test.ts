import { describe, it, expect } from "vitest"
import { bucketKey, bucketLabel, type Granularity } from "@/lib/date-buckets"

// ──────────────────────────────────────────────────────────────────
// Контракт lib/date-buckets.ts
//
// Функции вынесены из lib/loan-math.ts (сейчас только day|week|month)
// + добавлены quarter|halfyear|year для Plan продаж v2.
// Реализуется в Wave 1; этот стаб фиксирует контракт ДО реализации (RED).
// ──────────────────────────────────────────────────────────────────

describe("bucketKey — quarter (квартал)", () => {
  it("2026-07-15 → '2026-Q3'", () => {
    expect(bucketKey(new Date("2026-07-15"), "quarter")).toBe("2026-Q3")
  })

  it("2026-01-01 → '2026-Q1'", () => {
    expect(bucketKey(new Date("2026-01-01"), "quarter")).toBe("2026-Q1")
  })

  it("2026-04-30 → '2026-Q2'", () => {
    expect(bucketKey(new Date("2026-04-30"), "quarter")).toBe("2026-Q2")
  })

  it("2026-10-01 → '2026-Q4'", () => {
    expect(bucketKey(new Date("2026-10-01"), "quarter")).toBe("2026-Q4")
  })

  it("2025-12-31 → '2025-Q4'", () => {
    expect(bucketKey(new Date("2025-12-31"), "quarter")).toBe("2025-Q4")
  })
})

describe("bucketKey — halfyear (полугодие)", () => {
  it("2026-07-15 → '2026-H2'", () => {
    expect(bucketKey(new Date("2026-07-15"), "halfyear")).toBe("2026-H2")
  })

  it("2026-01-01 → '2026-H1'", () => {
    expect(bucketKey(new Date("2026-01-01"), "halfyear")).toBe("2026-H1")
  })

  it("2026-06-30 → '2026-H1'", () => {
    expect(bucketKey(new Date("2026-06-30"), "halfyear")).toBe("2026-H1")
  })

  it("2026-12-31 → '2026-H2'", () => {
    expect(bucketKey(new Date("2026-12-31"), "halfyear")).toBe("2026-H2")
  })
})

describe("bucketKey — year (год)", () => {
  it("2026-07-15 → '2026'", () => {
    expect(bucketKey(new Date("2026-07-15"), "year")).toBe("2026")
  })

  it("2025-01-01 → '2025'", () => {
    expect(bucketKey(new Date("2025-01-01"), "year")).toBe("2025")
  })

  it("2027-12-31 → '2027'", () => {
    expect(bucketKey(new Date("2027-12-31"), "year")).toBe("2027")
  })
})

describe("bucketKey — существующие гранулярности (регресс из loan-math.ts)", () => {
  it("month: 2026-07-15 → '2026-07'", () => {
    expect(bucketKey(new Date("2026-07-15"), "month")).toBe("2026-07")
  })

  it("month: 2026-01-01 → '2026-01'", () => {
    expect(bucketKey(new Date("2026-01-01"), "month")).toBe("2026-01")
  })

  it("month: 2026-12-31 → '2026-12'", () => {
    expect(bucketKey(new Date("2026-12-31"), "month")).toBe("2026-12")
  })

  it("day: 2026-07-15 → '2026-07-15'", () => {
    expect(bucketKey(new Date("2026-07-15"), "day")).toBe("2026-07-15")
  })

  it("week: 2026-07-15 → ISO-неделя формат (содержит год-W)", () => {
    // 2026-07-15 = среда недели 29 → '2026-W29'
    expect(bucketKey(new Date("2026-07-15"), "week")).toBe("2026-W29")
  })
})

describe("bucketLabel — человекочитаемые метки", () => {
  it("quarter: '2026-Q3' → 'Q3 2026'", () => {
    expect(bucketLabel("2026-Q3", "quarter")).toBe("Q3 2026")
  })

  it("halfyear: '2026-H2' → 'H2 2026' или 'П2 2026'", () => {
    const label = bucketLabel("2026-H2", "halfyear")
    // принимаем оба варианта: eng H2 или рус П2
    expect(label).toMatch(/^(H2|П2) 2026$/)
  })

  it("year: '2026' → '2026'", () => {
    expect(bucketLabel("2026", "year")).toBe("2026")
  })

  it("month: '2026-07' → человекочитаемое (содержит 2026)", () => {
    expect(bucketLabel("2026-07", "month")).toContain("2026")
  })

  it("day: '2026-07-15' → содержит 15", () => {
    expect(bucketLabel("2026-07-15", "day")).toContain("15")
  })

  it("week: '2026-W29' → содержит 29", () => {
    expect(bucketLabel("2026-W29", "week")).toContain("29")
  })
})

describe("Granularity type — все 6 значений поддерживаются", () => {
  const granularities: Granularity[] = ["day", "week", "month", "quarter", "halfyear", "year"]
  const testDate = new Date("2026-07-15")

  for (const g of granularities) {
    it(`bucketKey не бросает исключение для granularity="${g}"`, () => {
      expect(() => bucketKey(testDate, g)).not.toThrow()
    })
  }
})
