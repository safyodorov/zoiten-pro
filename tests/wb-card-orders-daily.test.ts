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
  it("группирует по (nmId, date MSK), фильтрует isCancel=true", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => [
        { nmId: 111, date: "2026-05-14T10:00:00", isCancel: false },
        { nmId: 111, date: "2026-05-14T15:00:00", isCancel: false },
        { nmId: 222, date: "2026-05-14T11:00:00", isCancel: true },
        { nmId: 222, date: "2026-05-13T11:00:00", isCancel: false },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any

    const rows = await fetchOrdersForRange(new Date("2026-05-13"))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const key = (r: any) => `${r.nmId}::${r.date.toISOString().slice(0, 10)}`
    const byKey = new Map(rows.map((r) => [key(r), r.qty]))
    expect(byKey.get("111::2026-05-14")).toBe(2)
    expect(byKey.get("222::2026-05-13")).toBe(1)
    expect(byKey.has("222::2026-05-14")).toBe(false) // isCancel:true отброшен
  })

  it("обрабатывает snake_case nm_id", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => [
        { nm_id: 333, date: "2026-05-14T10:00:00", isCancel: false },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
    const rows = await fetchOrdersForRange(new Date("2026-05-13"))
    expect(rows.find((r) => r.nmId === 333)?.qty).toBe(1)
  })

  it("date MSK интерпретация: 23:30 остаётся в той же дате", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => [
        { nmId: 444, date: "2026-05-14T23:30:00", isCancel: false },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
    const rows = await fetchOrdersForRange(new Date("2026-05-13"))
    expect(rows[0].date.toISOString().slice(0, 10)).toBe("2026-05-14")
  })

  it("80k pagination: продолжает с lastChangeDate", async () => {
    const first80k = Array.from({ length: 80_000 }, () => ({
      nmId: 555,
      date: "2026-04-10T10:00:00",
      isCancel: false,
      lastChangeDate: "2026-04-15T12:00:00",
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
          },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any

    const rows = await fetchOrdersForRange(new Date("2026-04-01"))
    const map = new Map(
      rows.map((r) => [`${r.nmId}::${r.date.toISOString().slice(0, 10)}`, r.qty]),
    )
    expect(map.get("555::2026-04-10")).toBe(80_000)
    expect(map.get("555::2026-04-20")).toBe(1)
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
})
