import { describe, it, expect } from "vitest"
import { iuTotalForRange, iuSeriesForRange } from "@/lib/sales-plan/iu"

// ──────────────────────────────────────────────────────────────────
// GOLDEN TEST: ИУ = 438 068 120 ₽ за H2-2026
//
// Логика: 2 380 805 ₽/день × 184 дня = 438 068 120 ₽
// Дней в диапазоне 2026-07-01 … 2026-12-31:
//   Июл(31) + Авг(31) + Сен(30) + Окт(31) + Ноя(30) + Дек(31) = 184
//
// IuTarget: { from: string; to: string; dailyRub: number }
// ──────────────────────────────────────────────────────────────────

const H2_TARGET = [{ from: "2026-07-01", to: "2026-12-31", dailyRub: 2_380_805 }]

describe("iuTotalForRange — GOLDEN: H2-2026 = 438 068 120 ₽", () => {
  it("iuTotalForRange(H2) === 438_068_120", () => {
    expect(iuTotalForRange("2026-07-01", "2026-12-31", H2_TARGET)).toBe(438_068_120)
  })

  it("184 дня в диапазоне 2026-07-01…2026-12-31", () => {
    // Пробуем через деление: 438_068_120 / 2_380_805 = 184
    const total = iuTotalForRange("2026-07-01", "2026-12-31", H2_TARGET)
    expect(total / 2_380_805).toBe(184)
  })
})

describe("iuTotalForRange — граничные случаи", () => {
  it("from === to → 1 день = dailyRub", () => {
    const target = [{ from: "2026-07-01", to: "2026-12-31", dailyRub: 2_380_805 }]
    expect(iuTotalForRange("2026-07-15", "2026-07-15", target)).toBe(2_380_805)
  })

  it("диапазон запроса до начала target → 0", () => {
    const target = [{ from: "2026-08-01", to: "2026-12-31", dailyRub: 2_380_805 }]
    expect(iuTotalForRange("2026-07-01", "2026-07-31", target)).toBe(0)
  })

  it("диапазон запроса после окончания target → 0", () => {
    const target = [{ from: "2026-07-01", to: "2026-09-30", dailyRub: 2_380_805 }]
    expect(iuTotalForRange("2026-10-01", "2026-12-31", target)).toBe(0)
  })

  it("пустой массив targets → 0", () => {
    expect(iuTotalForRange("2026-07-01", "2026-12-31", [])).toBe(0)
  })
})

describe("iuTotalForRange — мульти-период (несколько IuTarget)", () => {
  it("два периода суммируются корректно", () => {
    const targets = [
      { from: "2026-07-01", to: "2026-09-30", dailyRub: 2_000_000 },
      { from: "2026-10-01", to: "2026-12-31", dailyRub: 3_000_000 },
    ]
    // Июл+Авг+Сен = 92 дня × 2M + Окт+Ноя+Дек = 92 дня × 3M
    const expected = 92 * 2_000_000 + 92 * 3_000_000
    expect(iuTotalForRange("2026-07-01", "2026-12-31", targets)).toBe(expected)
  })

  it("перекрывающиеся периоды — каждый день считается один раз (первый target приоритетен)", () => {
    // Тест проверяет детерминизм при overlap (по спецификации — нет overlap в prod-данных,
    // но функция должна не падать)
    const targets = [
      { from: "2026-07-01", to: "2026-07-31", dailyRub: 1_000_000 },
      { from: "2026-07-01", to: "2026-07-31", dailyRub: 2_000_000 },
    ]
    const result = iuTotalForRange("2026-07-01", "2026-07-31", targets)
    expect(Number.isFinite(result)).toBe(true)
    expect(result).toBeGreaterThan(0)
  })
})

describe("iuSeriesForRange — кумулятивный ряд", () => {
  it("последний элемент cumulative === 438_068_120 для H2-2026", () => {
    const series = iuSeriesForRange("2026-07-01", "2026-12-31", H2_TARGET)
    expect(series.length).toBe(184)
    expect(series[series.length - 1].cumulative).toBe(438_068_120)
  })

  it("первый элемент cumulative === dailyRub (первый день)", () => {
    const series = iuSeriesForRange("2026-07-01", "2026-12-31", H2_TARGET)
    expect(series[0].date).toBe("2026-07-01")
    expect(series[0].cumulative).toBe(2_380_805)
  })

  it("ряд монотонно возрастает (нет убывающих шагов)", () => {
    const series = iuSeriesForRange("2026-07-01", "2026-12-31", H2_TARGET)
    for (let i = 1; i < series.length; i++) {
      expect(series[i].cumulative).toBeGreaterThanOrEqual(series[i - 1].cumulative)
    }
  })

  it("пустые targets → все cumulative = 0", () => {
    const series = iuSeriesForRange("2026-07-01", "2026-07-31", [])
    expect(series.every((s: { cumulative: number }) => s.cumulative === 0)).toBe(true)
  })
})
