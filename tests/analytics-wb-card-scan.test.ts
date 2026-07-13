import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

// fetchWbDiscounts мокается — реальный lib/wb-api (prisma/curl) не грузится.
vi.mock("@/lib/wb-api", () => ({
  fetchWbDiscounts: vi.fn(),
}))

import { fetchWbDiscounts } from "@/lib/wb-api"
import {
  cardJsonUrl,
  scanCardMedia,
  verifyPricesBatch,
  basketHostForVol,
} from "@/lib/analytics/wb-card-scan"

const __dirname = dirname(fileURLToPath(import.meta.url))
const cardFixture = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "analytics-card-sample.json"), "utf8"),
)
const NM = 899301731
const MAIN_PHOTO = `https://basket-39.wbbasket.ru/vol8993/part899301/${NM}/images/c246x328/1.webp`

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

beforeEach(() => {
  vi.mocked(fetchWbDiscounts).mockReset()
})

describe("cardJsonUrl — построение URL + анти-SSRF (T-30-02)", () => {
  it("валидный nmId + host из mainPhoto → корректный card.json URL", () => {
    expect(cardJsonUrl(NM, "basket-39.wbbasket.ru")).toBe(
      `https://basket-39.wbbasket.ru/vol8993/part899301/${NM}/info/ru/card.json`,
    )
  })

  it("без host → host из карты vol→host (vol 8993 → basket-39)", () => {
    expect(basketHostForVol(8993)).toBe(39)
    expect(cardJsonUrl(NM)).toContain("basket-39.wbbasket.ru")
  })

  it("отрицательный / нечисловой / ≥2^31 nmID → throw (анти-SSRF)", () => {
    expect(() => cardJsonUrl(-1)).toThrow(/недопустимый nmID/)
    expect(() => cardJsonUrl(2 ** 31)).toThrow(/недопустимый nmID/)
    expect(() => cardJsonUrl(1.5)).toThrow(/недопустимый nmID/)
    expect(() => cardJsonUrl(Number.NaN)).toThrow(/недопустимый nmID/)
  })
})

describe("scanCardMedia — фото листинга + характеристики (ANL-04)", () => {
  it("на реальной фикстуре → 5 фото + непустые характеристики", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(cardFixture))
    const { listingPhotos, characteristics } = await scanCardMedia(NM, MAIN_PHOTO, fetchImpl)
    expect(listingPhotos).toHaveLength(5) // photo_count=18 → лимит 5
    expect(listingPhotos[0]).toBe(
      `https://basket-39.wbbasket.ru/vol8993/part899301/${NM}/images/c516x688/1.webp`,
    )
    expect(characteristics.length).toBeGreaterThan(0)
    expect(characteristics).toContainEqual({ name: "Высота упаковки", value: "24 см" })
  })

  it("404 на ожидаемом host → пробует соседний host (fallback, T-30-10)", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes("basket-39")) return jsonResponse({}, 404) // authoritative host 404
      if (u.includes("basket-40")) return jsonResponse(cardFixture) // сосед +1 отдаёт
      return jsonResponse({}, 404)
    })
    const { listingPhotos } = await scanCardMedia(NM, MAIN_PHOTO, fetchImpl)
    expect(listingPhotos.length).toBeGreaterThan(0)
    // сосед был запрошен
    const calledHosts = fetchImpl.mock.calls.map((c) => String(c[0]))
    expect(calledHosts.some((u) => u.includes("basket-39"))).toBe(true)
    expect(calledHosts.some((u) => u.includes("basket-40"))).toBe(true)
  })

  it("все хосты 404 → throw с перечнем проверенных хостов", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 404))
    await expect(scanCardMedia(NM, MAIN_PHOTO, fetchImpl)).rejects.toThrow(/card\.json недоступен/)
  })

  it("характеристики из grouped_options, если options пуст (fallback)", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        media: { photo_count: 2 },
        options: [],
        grouped_options: [{ group_name: "G", options: [{ name: "Цвет", value: "черный" }] }],
      }),
    )
    const { characteristics, listingPhotos } = await scanCardMedia(NM, MAIN_PHOTO, fetchImpl)
    expect(characteristics).toContainEqual({ name: "Цвет", value: "черный" })
    expect(listingPhotos).toHaveLength(2) // photo_count=2 < лимит 5
  })
})

describe("verifyPricesBatch — ОДИН батч-вызов card.wb.ru (T-30-16, реюз)", () => {
  it("fetchWbDiscounts вызван РОВНО 1 раз на все 30 nmId (не per-SKU)", async () => {
    const nmIds = Array.from({ length: 30 }, (_, i) => 100000 + i)
    vi.mocked(fetchWbDiscounts).mockImplementation(async (ids, _sp, storefront) => {
      // имитируем сбор storefront рейтинга по первому nmId
      storefront?.ratings.set(ids[0], 4.9)
      storefront?.feedbacks.set(ids[0], 1438)
      return new Map<number, number>([[ids[0], 12.5]])
    })
    const res = await verifyPricesBatch(nmIds)
    expect(vi.mocked(fetchWbDiscounts)).toHaveBeenCalledTimes(1) // НЕ 30
    expect(vi.mocked(fetchWbDiscounts).mock.calls[0][0]).toHaveLength(30) // весь массив
    expect(res.get(100000)).toEqual({ sppDiscount: 12.5, rating: 4.9, feedbacks: 1438 })
  })

  it("сбой v4 (reject) → best-effort пустая Map, без падения и без per-SKU ретраев", async () => {
    const nmIds = [1, 2, 3]
    vi.mocked(fetchWbDiscounts).mockRejectedValue(new Error("v4 403"))
    const res = await verifyPricesBatch(nmIds)
    expect(res.size).toBe(0)
    expect(vi.mocked(fetchWbDiscounts)).toHaveBeenCalledTimes(1) // один раз, не ретраит per-SKU
  })
})
