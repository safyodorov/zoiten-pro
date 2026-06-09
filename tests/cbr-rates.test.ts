import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { fetchCbrRates, ratePerUnit, getLatestRate } from "@/lib/cbr-rates"

// ──────────────────────────────────────────────────────────────────
// RED stub — план 20-00 Wave 0 (D-09)
// ──────────────────────────────────────────────────────────────────
//
// lib/cbr-rates.ts будет создан в плане 20-04. До этого тесты падают с
// "Cannot find module @/lib/cbr-rates" — корректное RED-состояние Wave 0.
//
// Контракт (20-RESEARCH.md §"Pattern 4" / §"CBR Rates — Detailed Integration Plan"):
//   endpoint: https://www.cbr-xml-daily.ru/daily_json.js (plain JSON, no auth)
//   ratePerUnit(valute) = Value / Nominal  (CNY Nominal=10 Value=8.1 → 0.81)
//   fetchCbrRates() парсит CbrResponse { Date, Valute: Record<code, CbrValute> }
//   fetchCbrRates() при res.ok=false → throws "CBR fetch failed"
//   getLatestRate(code, prisma) → fallback на последнюю сохранённую запись или null

// ──────────────────────────────────────────────────────────────────
// ratePerUnit (D-09: rateToRub = Value / Nominal)
// ──────────────────────────────────────────────────────────────────

describe("ratePerUnit", () => {
  it("CNY Nominal=10 Value=8.1 → 0.81", () => {
    expect(
      ratePerUnit({
        ID: "R01375",
        NumCode: "156",
        CharCode: "CNY",
        Nominal: 10,
        Name: "Китайский юань",
        Value: 8.1,
        Previous: 8.0,
      })
    ).toBeCloseTo(0.81, 6)
  })

  it("USD Nominal=1 Value=73.2644 → 73.2644", () => {
    expect(
      ratePerUnit({
        ID: "R01235",
        NumCode: "840",
        CharCode: "USD",
        Nominal: 1,
        Name: "Доллар США",
        Value: 73.2644,
        Previous: 73.4689,
      })
    ).toBe(73.2644)
  })
})

// ──────────────────────────────────────────────────────────────────
// fetchCbrRates (D-09: parse Valute, error on !ok)
// ──────────────────────────────────────────────────────────────────

describe("fetchCbrRates", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("парсит CbrResponse с Date + Valute{CNY,USD}", async () => {
    const mockResponse = {
      Date: "2026-06-09T11:30:00+03:00",
      PreviousDate: "2026-06-06T11:30:00+03:00",
      Timestamp: "2026-06-09T16:00:00+03:00",
      Valute: {
        CNY: {
          ID: "R01375",
          NumCode: "156",
          CharCode: "CNY",
          Nominal: 10,
          Name: "Китайский юань",
          Value: 8.1,
          Previous: 8.0,
        },
        USD: {
          ID: "R01235",
          NumCode: "840",
          CharCode: "USD",
          Nominal: 1,
          Name: "Доллар США",
          Value: 73.2644,
          Previous: 73.4689,
        },
      },
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      }))
    )

    const res = await fetchCbrRates()
    expect(res.Date).toBe("2026-06-09T11:30:00+03:00")
    expect(res.Valute.CNY.CharCode).toBe("CNY")
  })

  it("res.ok=false → throws CBR fetch failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({}),
      }))
    )

    await expect(fetchCbrRates()).rejects.toThrow("CBR fetch failed")
  })
})

// ──────────────────────────────────────────────────────────────────
// getLatestRate (D-09: fallback на последнюю сохранённую запись)
// ──────────────────────────────────────────────────────────────────

describe("getLatestRate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("возвращает последнюю сохранённую запись для существующего кода", async () => {
    const stored = { rateToRub: 0.81, date: new Date("2026-06-09") }
    const mockPrisma = {
      currencyRate: { findFirst: vi.fn().mockResolvedValue(stored) },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getLatestRate("CNY", mockPrisma as any)
    expect(result).toEqual(stored)
    expect(mockPrisma.currencyRate.findFirst).toHaveBeenCalled()
  })

  it("возвращает null если записи нет", async () => {
    const mockPrisma = {
      currencyRate: { findFirst: vi.fn().mockResolvedValue(null) },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getLatestRate("XXX", mockPrisma as any)
    expect(result).toBeNull()
  })
})
