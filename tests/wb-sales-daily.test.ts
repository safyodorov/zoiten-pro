import { describe, it, expect } from "vitest"
import { aggregateSalesRows } from "@/lib/wb-api"

describe("aggregateSalesRows", () => {
  const rows = [
    { date: "2026-07-01T10:00:00", nmId: 100, saleID: "S001", priceWithDisc: 1000, forPay: 800 },
    { date: "2026-07-01T12:00:00", nmId: 100, saleID: "S002", priceWithDisc: 500,  forPay: 400 },
    { date: "2026-07-01T14:00:00", nmId: 100, saleID: "R003", priceWithDisc: 300,  forPay: 0   }, // возврат
    { date: "2026-07-02T09:00:00", nmId: 100, saleID: "S004", priceWithDisc: 700,  forPay: 560 },
    { date: "2026-07-01T11:00:00", nmId: 200, saleID: "S005", priceWithDisc: 2000, forPay: 1600 },
    { date: "2026-07-01T13:00:00", nmId: 200, saleID: "R006", priceWithDisc: 900,  forPay: 0   },
  ]

  it("суммирует priceWithDisc по (nmId, дата реализации), разделяя выкуп/возврат", () => {
    const agg = aggregateSalesRows(rows)
    const get = (nm: number, d: string) => agg.find((a) => a.nmId === nm && a.date === d)!

    const a = get(100, "2026-07-01")
    expect(a.buyoutsRub).toBe(1500)
    expect(a.buyoutsCount).toBe(2)
    expect(a.forPayRub).toBe(1200)
    expect(a.returnsRub).toBe(300)
    expect(a.returnsCount).toBe(1)

    expect(get(100, "2026-07-02").buyoutsRub).toBe(700)

    const b = get(200, "2026-07-01")
    expect(b.buyoutsRub).toBe(2000)
    expect(b.returnsRub).toBe(900)
    expect(b.returnsCount).toBe(1)
  })

  it("пропускает записи с невалидными nmId/date", () => {
    expect(
      aggregateSalesRows([
        { date: "", nmId: NaN as unknown as number, saleID: "S", priceWithDisc: 1, forPay: 1 },
      ])
    ).toEqual([])
  })
})
