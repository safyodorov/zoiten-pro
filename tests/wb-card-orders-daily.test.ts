import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock prisma + getWbToken + cooldown до import lib/wb-api
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/wb-token", () => ({
  getWbToken: vi.fn().mockResolvedValue("test-token"),
}))
vi.mock("@/lib/wb-cooldown", () => ({
  getWbCooldownSecondsRemaining: vi.fn().mockResolvedValue(0),
  setWbCooldownUntil: vi.fn(),
}))

import { fetchOrdersForRange } from "@/lib/wb-api"

beforeEach(() => {
  vi.restoreAllMocks()
})

describe("fetchOrdersForRange", () => {
  it("группирует по (nmId, date MSK), фильтрует isCancel=true + агрегирует цены", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => [
        { nmId: 111, date: "2026-05-14T10:00:00", isCancel: false, priceWithDisc: 5000, finishedPrice: 3800 },
        { nmId: 111, date: "2026-05-14T15:00:00", isCancel: false, priceWithDisc: 5500, finishedPrice: 3800 },
        { nmId: 222, date: "2026-05-14T11:00:00", isCancel: true, priceWithDisc: 9999, finishedPrice: 9999 },
        { nmId: 222, date: "2026-05-13T11:00:00", isCancel: false, priceWithDisc: 1500, finishedPrice: 1200 },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any

    const rows = await fetchOrdersForRange(new Date("2026-05-13"))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const key = (r: any) => `${r.nmId}::${r.date.toISOString().slice(0, 10)}`
    const byKey = new Map(rows.map((r) => [key(r), r]))
    expect(byKey.get("111::2026-05-14")?.qty).toBe(2)
    expect(byKey.get("222::2026-05-13")?.qty).toBe(1)
    expect(byKey.has("222::2026-05-14")).toBe(false) // isCancel:true отброшен

    // Golden: avg(5000, 5500) = 5250 → sellerPrice; finishedPrice = 3800 (одинаковые)
    expect(byKey.get("111::2026-05-14")?.sellerPrice).toBe(5250)
    expect(byKey.get("111::2026-05-14")?.buyerPrice).toBe(3800)
    expect(byKey.get("222::2026-05-13")?.sellerPrice).toBe(1500)
    expect(byKey.get("222::2026-05-13")?.buyerPrice).toBe(1200)
  })

  it("обрабатывает snake_case nm_id + price aggregation", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => [
        { nm_id: 333, date: "2026-05-14T10:00:00", isCancel: false, priceWithDisc: 1000, finishedPrice: 900 },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
    const rows = await fetchOrdersForRange(new Date("2026-05-13"))
    const r = rows.find((r) => r.nmId === 333)!
    expect(r.qty).toBe(1)
    expect(r.sellerPrice).toBe(1000)
    expect(r.buyerPrice).toBe(900)
  })

  it("date MSK интерпретация: 23:30 остаётся в той же дате + цены пробрасываются", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => [
        { nmId: 444, date: "2026-05-14T23:30:00", isCancel: false, priceWithDisc: 2000, finishedPrice: 1500 },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
    const rows = await fetchOrdersForRange(new Date("2026-05-13"))
    expect(rows[0].date.toISOString().slice(0, 10)).toBe("2026-05-14")
    expect(rows[0].sellerPrice).toBe(2000)
    expect(rows[0].buyerPrice).toBe(1500)
  })

  it("80k pagination: продолжает с lastChangeDate + цены агрегируются через pagination", async () => {
    const first80k = Array.from({ length: 80_000 }, () => ({
      nmId: 555,
      date: "2026-04-10T10:00:00",
      isCancel: false,
      lastChangeDate: "2026-04-15T12:00:00",
      priceWithDisc: 1234,
      finishedPrice: 1000,
    }))
    // Все 80k за тот же (nmId,date) — qty=80000. Второй ответ — ещё 1.
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => first80k,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => [
          {
            nmId: 555,
            date: "2026-04-20T10:00:00",
            isCancel: false,
            lastChangeDate: "2026-04-20T10:01:00",
            priceWithDisc: 2000,
            finishedPrice: 1700,
          },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any

    const rows = await fetchOrdersForRange(new Date("2026-04-01"))
    const map = new Map(
      rows.map((r) => [`${r.nmId}::${r.date.toISOString().slice(0, 10)}`, r]),
    )
    expect(map.get("555::2026-04-10")?.qty).toBe(80_000)
    expect(map.get("555::2026-04-20")?.qty).toBe(1)
    expect(map.get("555::2026-04-10")?.sellerPrice).toBe(1234) // все одинаковые → avg=1234
    expect(map.get("555::2026-04-10")?.buyerPrice).toBe(1000)
    expect(map.get("555::2026-04-20")?.sellerPrice).toBe(2000)
    expect(map.get("555::2026-04-20")?.buyerPrice).toBe(1700)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((global.fetch as any).mock.calls.length).toBe(2)
  })

  it("пустой ответ → пустой массив", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
    const rows = await fetchOrdersForRange(new Date("2026-05-13"))
    expect(rows).toEqual([])
  })

  it("aggregates priceWithDisc/finishedPrice as Math.round(avg) per (nmId, date)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => [
        { nmId: 999, date: "2026-05-14T10:00:00", isCancel: false, priceWithDisc: 5000, finishedPrice: 3800 },
        { nmId: 999, date: "2026-05-14T11:00:00", isCancel: false, priceWithDisc: 5500, finishedPrice: 3850 },
        { nmId: 999, date: "2026-05-14T12:00:00", isCancel: false, priceWithDisc: 6000, finishedPrice: 3900 },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
    const rows = await fetchOrdersForRange(new Date("2026-05-13"))
    const r = rows.find((x) => x.nmId === 999)!
    expect(r.qty).toBe(3)
    expect(r.sellerPrice).toBe(5500) // avg(5000,5500,6000) = 5500
    expect(r.buyerPrice).toBe(3850) // avg(3800,3850,3900) = 3850
  })

  it("returns null prices when priceWithDisc/finishedPrice отсутствуют или 0", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => [
        { nmId: 888, date: "2026-05-14T10:00:00", isCancel: false }, // нет полей
        { nmId: 888, date: "2026-05-14T11:00:00", isCancel: false, priceWithDisc: 0, finishedPrice: 0 },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
    const rows = await fetchOrdersForRange(new Date("2026-05-13"))
    const r = rows.find((x) => x.nmId === 888)!
    expect(r.qty).toBe(2)
    expect(r.sellerPrice).toBeNull()
    expect(r.buyerPrice).toBeNull()
  })
})
