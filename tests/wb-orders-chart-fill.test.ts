import { describe, it, expect } from "vitest"
import { getLast28DaysMsk, fillTimeSeries } from "@/lib/wb-orders-chart"

describe("getLast28DaysMsk", () => {
  it("возвращает 28 дат от today-28 до today-1 MSK", () => {
    // 2026-05-15 12:00 UTC = 15:00 MSK
    const now = new Date("2026-05-15T12:00:00Z")
    const days = getLast28DaysMsk(now)
    expect(days.length).toBe(28)
    expect(days[0]).toBe("2026-04-17") // today-28
    expect(days[27]).toBe("2026-05-14") // today-1 (вчера)
  })
})

describe("fillTimeSeries", () => {
  const now = new Date("2026-05-15T12:00:00Z")

  it("заполняет 28 точек с qty=0 при пустом input", () => {
    const ts = fillTimeSeries([], now)
    expect(ts.length).toBe(28)
    expect(ts.every((p) => p.qty === 0)).toBe(true)
  })

  it("маппит запись с date=2026-05-14 в последний элемент", () => {
    const ts = fillTimeSeries([{ date: new Date("2026-05-14"), qty: 5 }], now)
    expect(ts[27]).toEqual({ date: "2026-05-14", qty: 5 })
    expect(ts.slice(0, 27).every((p) => p.qty === 0)).toBe(true)
  })

  it("игнорирует записи вне окна [today-28, today-1]", () => {
    const ts = fillTimeSeries(
      [
        { date: new Date("2026-04-16"), qty: 100 }, // = today-29, вне окна
        { date: new Date("2026-05-15"), qty: 50 }, // = today, вне окна (полный день не считаем)
        { date: new Date("2026-04-17"), qty: 7 }, // = today-28, в окне (граница)
      ],
      now,
    )
    expect(ts.length).toBe(28)
    expect(ts[0]).toEqual({ date: "2026-04-17", qty: 7 })
    expect(ts.reduce((s, p) => s + p.qty, 0)).toBe(7) // 100 и 50 отброшены
  })
})
