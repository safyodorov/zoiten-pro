import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  getPeriod,
  startOfMonthMsk,
  startOfQuarterMsk,
  startOfDayMsk,
  endOfDayMsk,
  PERIOD_PRESETS,
} from "@/lib/date-periods"

describe("startOfMonthMsk", () => {
  it("15 April 2026 14:30 UTC → 1 April 2026 00:00 МСК", () => {
    const input = new Date("2026-04-15T14:30:00Z")
    expect(startOfMonthMsk(input).toISOString()).toBe("2026-03-31T21:00:00.000Z")
    // 1 апреля 00:00 МСК (+03:00) == 31 марта 21:00 UTC
  })

  it("1 января 02:00 МСК попадает в январь МСК (не декабрь прошлого года)", () => {
    // 1 Jan 2026 02:00 МСК = 31 Dec 2025 23:00 UTC
    const input = new Date("2025-12-31T23:00:00Z")
    expect(startOfMonthMsk(input).toISOString()).toBe("2025-12-31T21:00:00.000Z")
    // 1 января 00:00 МСК (+03:00) == 31 декабря 21:00 UTC
  })

  it("по умолчанию использует текущее время", () => {
    const r = startOfMonthMsk()
    expect(r).toBeInstanceOf(Date)
    expect(r.getUTCDate()).toBeGreaterThanOrEqual(1)
  })
})

describe("startOfQuarterMsk (календарный)", () => {
  it("Q1: 15 February 2026 → 1 January 2026 00:00 МСК", () => {
    expect(startOfQuarterMsk(new Date("2026-02-15T10:00:00Z")).toISOString()).toBe("2025-12-31T21:00:00.000Z")
  })

  it("Q2: 15 May 2026 → 1 April 2026 00:00 МСК", () => {
    expect(startOfQuarterMsk(new Date("2026-05-15T10:00:00Z")).toISOString()).toBe("2026-03-31T21:00:00.000Z")
  })

  it("Q3: 15 August 2026 → 1 July 2026 00:00 МСК", () => {
    expect(startOfQuarterMsk(new Date("2026-08-15T10:00:00Z")).toISOString()).toBe("2026-06-30T21:00:00.000Z")
  })

  it("Q4: 15 November 2026 → 1 October 2026 00:00 МСК", () => {
    expect(startOfQuarterMsk(new Date("2026-11-15T10:00:00Z")).toISOString()).toBe("2026-09-30T21:00:00.000Z")
  })

  it("Граница: 1 April 2026 00:00 МСК → 1 April 2026 (не 1 January)", () => {
    // 1 April 2026 00:00 МСК = 31 Mar 2026 21:00 UTC
    expect(startOfQuarterMsk(new Date("2026-03-31T21:00:00Z")).toISOString()).toBe("2026-03-31T21:00:00.000Z")
  })
})

describe("startOfDayMsk / endOfDayMsk", () => {
  it("startOfDayMsk возвращает 00:00 МСК того же дня в МСК", () => {
    // 15 April 14:30 UTC → 15 April 17:30 МСК → startOfDayMsk = 15 April 00:00 МСК = 14 April 21:00 UTC
    expect(startOfDayMsk(new Date("2026-04-15T14:30:00Z")).toISOString()).toBe("2026-04-14T21:00:00.000Z")
  })

  it("endOfDayMsk возвращает 23:59:59.999 МСК того же дня", () => {
    // 15 April 00:00 МСК = 14 April 21:00 UTC → endOfDay = 15 April 23:59:59.999 МСК = 15 April 20:59:59.999 UTC
    expect(endOfDayMsk(new Date("2026-04-15T10:00:00Z")).toISOString()).toBe("2026-04-15T20:59:59.999Z")
  })
})

describe("getPeriod presets", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-15T12:00:00Z"))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("7d: dateFrom = now - 7 дней, dateTo = now", () => {
    const r = getPeriod("7d")
    expect(r.dateTo.toISOString()).toBe("2026-04-15T12:00:00.000Z")
    expect(r.dateFrom.toISOString()).toBe("2026-04-08T12:00:00.000Z")
  })

  it("30d: dateFrom = now - 30 дней", () => {
    const r = getPeriod("30d")
    expect(r.dateFrom.toISOString()).toBe("2026-03-16T12:00:00.000Z")
  })

  it("quarter: dateFrom = startOfQuarterMsk(now) — календарный Q2 = 1 April", () => {
    const r = getPeriod("quarter")
    expect(r.dateFrom.toISOString()).toBe("2026-03-31T21:00:00.000Z")
    // = 1 April 2026 00:00 МСК
  })

  it("custom: dateFrom = 00:00 МСК from, dateTo = 23:59:59.999 МСК to", () => {
    const r = getPeriod("custom", { from: "2026-04-01", to: "2026-04-10" })
    expect(r.dateFrom.toISOString()).toBe("2026-03-31T21:00:00.000Z") // 1 Apr 00:00 МСК
    expect(r.dateTo.toISOString()).toBe("2026-04-10T20:59:59.999Z") // 10 Apr 23:59 МСК
  })

  it("custom без custom arg → throw", () => {
    expect(() => getPeriod("custom")).toThrowError(/custom preset requires custom arg/)
  })
})

describe("PERIOD_PRESETS const", () => {
  it("содержит 4 пресета в правильном порядке", () => {
    expect(PERIOD_PRESETS).toEqual(["7d", "30d", "quarter", "custom"])
  })
})
