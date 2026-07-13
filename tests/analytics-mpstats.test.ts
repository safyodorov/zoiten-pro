import { describe, it, expect, vi, afterEach } from "vitest"
import {
  fetchPositions,
  fetchNicheQueries,
  mapWordsToSeries,
  buildByKeywordsPath,
  MpstatsRateLimitError,
  MPSTATS_BASE,
} from "@/lib/analytics/mpstats"

// Мок-ответ by_keywords в ПОДТВЕРЖДЁННОЙ Wave 0 форме (30-01-WAVE0-NOTES.md §1).
const axis = ["2026-06-11", "2026-06-12", "2026-06-13"]
function mockByKeywords() {
  return {
    days_formatted: axis,
    words: {
      // высокочастотный запрос с органикой И рекламой
      кофемашина: {
        wb_count: 202088,
        organic_pos: [5, 0, 3], // день 2 — нет в органике (0 → null)
        auto: [
          [120, 0, "b", 2], // реклама: cpm 120, тип "b", позиция 2
          null,
          [0, 0, "b", 0], // позиция 0 → рекламы нет
        ],
        ad_type: ["b", "", "b"],
      },
      // низкочастотный запрос — должен отфильтроваться (≤500)
      "редкий запрос": {
        wb_count: 400,
        organic_pos: [10, 11, 12],
        auto: [null, null, null],
      },
      // ровно на пороге частотности 600 — остаётся
      "кофе зерновой": {
        wb_count: 600,
        organic_pos: [7, 8, 0],
        auto: [null, null, null],
      },
    },
  }
}

function stubFetchOnce(body: unknown, status = 200) {
  const spy = vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  )
  vi.stubGlobal("fetch", spy)
  return spy
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("mapWordsToSeries — organic/ad разделение (PURE)", () => {
  it("organic_pos=0 → null; auto → ad с cpm/placementType/boostPosition", () => {
    const series = mapWordsToSeries(mockByKeywords())
    const coffee = series.find((s) => s.query === "кофемашина")!
    expect(coffee.days[0]).toEqual({
      dt: "2026-06-11",
      organic: 5,
      ad: { position: 2, cpm: 120, placementType: "b", boostPosition: 2 },
    })
    expect(coffee.days[1]).toEqual({ dt: "2026-06-12", organic: null, ad: null }) // organic 0 + auto null
    expect(coffee.days[2]).toEqual({ dt: "2026-06-13", organic: 3, ad: null }) // auto position 0 → нет рекламы
  })

  it("avgPosition = средняя organic по дням присутствия (игнор null)", () => {
    const coffee = mapWordsToSeries(mockByKeywords()).find((s) => s.query === "кофемашина")!
    expect(coffee.avgPosition).toBeCloseTo((5 + 3) / 2, 9) // день с organic=0 исключён
  })
})

describe("fetchNicheQueries — фильтр частотности > 500 (ANL-03)", () => {
  it("frequency 400 отфильтрован, 600 и 202088 — оставлены", async () => {
    const spy = stubFetchOnce(mockByKeywords())
    const res = await fetchNicheQueries(899301731, "2026-06-11", "2026-06-13", "TOK")
    const queries = res.map((q) => q.query).sort()
    expect(queries).toEqual(["кофе зерновой", "кофемашина"])
    expect(res.find((q) => q.query === "редкий запрос")).toBeUndefined()
    // окно дат ушло в запрос
    const url = String(spy.mock.calls[0][0])
    expect(url).toContain("d1=2026-06-11")
    expect(url).toContain("d2=2026-06-13")
  })

  it("шлёт заголовок X-Mpstats-TOKEN, токен = параметр", async () => {
    const spy = stubFetchOnce(mockByKeywords())
    await fetchNicheQueries(1, "2026-06-11", "2026-06-13", "SECRET-TOKEN")
    const init = spy.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>)["X-Mpstats-TOKEN"]).toBe("SECRET-TOKEN")
    expect(String(spy.mock.calls[0][0])).toContain(MPSTATS_BASE)
  })
})

describe("fetchPositions — ряд позиций по основному (частотному) запросу", () => {
  it("возвращает PositionDay[] самого частотного запроса (organic + ad)", async () => {
    stubFetchOnce(mockByKeywords())
    const days = await fetchPositions(899301731, "2026-06-11", "2026-06-13", "TOK")
    expect(days).toHaveLength(3)
    expect(days[0].ad).toEqual({ position: 2, cpm: 120, placementType: "b", boostPosition: 2 })
    expect(days[1].organic).toBeNull()
  })
})

describe("обработка лимита тарифа (T-30-04)", () => {
  it("status 429 → MpstatsRateLimitError (не generic, не падение)", async () => {
    stubFetchOnce({ error: "too many requests" }, 429)
    await expect(fetchNicheQueries(1, "2026-06-11", "2026-06-13", "TOK")).rejects.toBeInstanceOf(
      MpstatsRateLimitError,
    )
  })

  it("иной !ok статус → generic Error с телом", async () => {
    stubFetchOnce("Server Error", 500)
    await expect(fetchPositions(1, "2026-06-11", "2026-06-13", "TOK")).rejects.toThrow(/MPSTATS 500/)
  })
})

describe("buildByKeywordsPath — подтверждённый путь", () => {
  it("формирует /get/item/{nmId}/by_keywords?d1&d2", () => {
    expect(buildByKeywordsPath(123, "2026-06-11", "2026-07-10")).toBe(
      "/get/item/123/by_keywords?d1=2026-06-11&d2=2026-07-10",
    )
  })
})
