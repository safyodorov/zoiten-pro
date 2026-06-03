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
    // quick 260515-o4o: DayPoint расширен полем buyerPrice (по умолчанию null).
    // 260515-phv: DayPoint также расширен sellerPrice (null по умолчанию).
    expect(ts[27]).toEqual({ date: "2026-05-14", qty: 5, sellerPrice: null, buyerPrice: null, discountWb: null })
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
    expect(ts[0]).toEqual({ date: "2026-04-17", qty: 7, sellerPrice: null, buyerPrice: null, discountWb: null })
    expect(ts.reduce((s, p) => s + p.qty, 0)).toBe(7) // 100 и 50 отброшены
  })

  it("прокидывает buyerPrice из raw в DayPoint", () => {
    // quick 260515-o4o: rows с buyerPrice → линия цены в ComposedChart
    // 260515-phv: forward-fill добавлен. raw row на 2026-05-14 имеет buyerPrice=3817,
    // на 2026-05-13 явный null, на 2026-05-12 нет цены. Так как leading null остаются null
    // (нет previous значения слева от day 27), assertions остаются валидны.
    const ts = fillTimeSeries(
      [
        { date: new Date("2026-05-14"), qty: 3, buyerPrice: 3817 },
        { date: new Date("2026-05-13"), qty: 1, buyerPrice: null }, // явный null → остаётся null
        { date: new Date("2026-05-12"), qty: 2 }, // без buyerPrice → null
      ],
      now,
    )
    expect(ts[27]).toEqual({ date: "2026-05-14", qty: 3, sellerPrice: null, buyerPrice: 3817, discountWb: null })
    expect(ts[26]).toEqual({ date: "2026-05-13", qty: 1, sellerPrice: null, buyerPrice: null, discountWb: null })
    expect(ts[25]).toEqual({ date: "2026-05-12", qty: 2, sellerPrice: null, buyerPrice: null, discountWb: null })
  })

  it("forward-fill: дни без заказов наследуют последнюю известную цену", () => {
    // now = 2026-05-15 → window 2026-04-17 (day 0) .. 2026-05-14 (day 27)
    // Заказы только на day 5 (=2026-04-22), day 10 (=2026-04-27), day 20 (=2026-05-07)
    const ts = fillTimeSeries(
      [
        { date: new Date("2026-04-22"), qty: 1, sellerPrice: 5000, buyerPrice: 3800 },
        { date: new Date("2026-04-27"), qty: 2, sellerPrice: 5500, buyerPrice: 4000 },
        { date: new Date("2026-05-07"), qty: 1, sellerPrice: 6000, buyerPrice: 4500 },
      ],
      now,
    )
    expect(ts.length).toBe(28)

    // days 0..4 (до первой цены) — null
    for (let i = 0; i < 5; i++) {
      expect(ts[i].sellerPrice).toBeNull()
      expect(ts[i].buyerPrice).toBeNull()
    }
    // day 5 — 5000/3800
    expect(ts[5].sellerPrice).toBe(5000)
    expect(ts[5].buyerPrice).toBe(3800)
    // days 6..9 — наследуют 5000/3800 (forward-fill)
    for (let i = 6; i < 10; i++) {
      expect(ts[i].sellerPrice).toBe(5000)
      expect(ts[i].buyerPrice).toBe(3800)
    }
    // day 10 — 5500/4000
    expect(ts[10].sellerPrice).toBe(5500)
    expect(ts[10].buyerPrice).toBe(4000)
    // days 11..19 — наследуют 5500/4000
    for (let i = 11; i < 20; i++) {
      expect(ts[i].sellerPrice).toBe(5500)
      expect(ts[i].buyerPrice).toBe(4000)
    }
    // day 20 — 6000/4500
    expect(ts[20].sellerPrice).toBe(6000)
    expect(ts[20].buyerPrice).toBe(4500)
    // days 21..27 — наследуют 6000/4500
    for (let i = 21; i < 28; i++) {
      expect(ts[i].sellerPrice).toBe(6000)
      expect(ts[i].buyerPrice).toBe(4500)
    }
    // qty НЕ forward-fill'ится: только дни с заказом имеют qty>0
    const qtyByDay = ts.map((p) => p.qty)
    expect(qtyByDay[5]).toBe(1)
    expect(qtyByDay[10]).toBe(2)
    expect(qtyByDay[20]).toBe(1)
    // Сумма qty = 4, не больше (forward-fill ничего не добавил)
    expect(qtyByDay.reduce((s, q) => s + q, 0)).toBe(4)
  })

  it("forward-fill: все цены null → все точки null (не падает)", () => {
    const ts = fillTimeSeries(
      [
        { date: new Date("2026-05-14"), qty: 1 }, // без цен
        { date: new Date("2026-05-10"), qty: 2, sellerPrice: null, buyerPrice: null },
      ],
      now,
    )
    expect(ts.length).toBe(28)
    for (const p of ts) {
      expect(p.sellerPrice).toBeNull()
      expect(p.buyerPrice).toBeNull()
    }
  })

  it("forward-fill: только day-27 имеет цену → days 0..26 остаются null (нет backward-fill)", () => {
    const ts = fillTimeSeries(
      [{ date: new Date("2026-05-14"), qty: 1, sellerPrice: 5000, buyerPrice: 3800 }],
      now,
    )
    expect(ts.length).toBe(28)
    // days 0..26 — null (нет previous)
    for (let i = 0; i < 27; i++) {
      expect(ts[i].sellerPrice).toBeNull()
      expect(ts[i].buyerPrice).toBeNull()
    }
    // day 27 — заданная цена
    expect(ts[27].sellerPrice).toBe(5000)
    expect(ts[27].buyerPrice).toBe(3800)
  })
})

describe("fillTimeSeries — СПП (discountWb)", () => {
  const now = new Date("2026-05-15T12:00:00Z")

  it("использует stored discountWb из raw (приоритет над выводом из цен)", () => {
    const ts = fillTimeSeries(
      [{ date: new Date("2026-05-14"), qty: 1, sellerPrice: 5000, buyerPrice: 3800, discountWb: 22.2 }],
      now,
    )
    // stored 22.2 используется как есть, не пересчитывается из 5000/3800 (=24.0)
    expect(ts[27].discountWb).toBe(22.2)
  })

  it("выводит СПП из seller/buyer, если stored нет", () => {
    const ts = fillTimeSeries(
      [{ date: new Date("2026-05-14"), qty: 1, sellerPrice: 5000, buyerPrice: 3800 }],
      now,
    )
    // (1 − 3800/5000) × 100 = 24.0
    expect(ts[27].discountWb).toBe(24)
  })

  it("forward-fill: СПП наследуется на дни без snapshot", () => {
    const ts = fillTimeSeries(
      [
        { date: new Date("2026-05-07"), qty: 1, sellerPrice: 6000, buyerPrice: 4500, discountWb: 25 },
      ],
      now,
    )
    // day 20 = 2026-05-07 → 25; days 21..27 наследуют 25
    expect(ts[20].discountWb).toBe(25)
    for (let i = 21; i < 28; i++) expect(ts[i].discountWb).toBe(25)
    // до первого значения (days 0..19) — null
    for (let i = 0; i < 20; i++) expect(ts[i].discountWb).toBeNull()
  })

  it("нет цен и нет stored → discountWb null", () => {
    const ts = fillTimeSeries([{ date: new Date("2026-05-14"), qty: 1 }], now)
    expect(ts.every((p) => p.discountWb == null)).toBe(true)
  })
})
