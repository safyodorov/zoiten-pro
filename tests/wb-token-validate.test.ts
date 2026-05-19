// tests/wb-token-validate.test.ts
// Quick 260512-jxh: Unit-тесты для lib/wb-token-validate.ts
// 7 тестов: full scope+200, missing scope, probe 401, probe 403, timeout, REQUIRED_SCOPE_BITS.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Нет Prisma-зависимостей в wb-token-validate — мокировать не нужно.
// Мокируем только global.fetch.

// ── Helper ────────────────────────────────────────────────────────

function makeJwt(payload: object): string {
  const b64 = (s: string) =>
    Buffer.from(s)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
  const header = b64('{"alg":"HS256","typ":"JWT"}')
  const body = b64(JSON.stringify(payload))
  return `${header}.${body}.fakesig`
}

// WB_API_TOKEN scope: bits {1,2,3,5,6,7} = 2+4+8+32+64+128 = 238
const FULL_SCOPE_BITMASK = 238
const PARTIAL_SCOPE_BITMASK = 2 + 4 + 8 // bits 1,2,3 только — нет 5,6,7

const validFullToken = makeJwt({
  s: FULL_SCOPE_BITMASK,
  iat: 1700000000,
  exp: 1800000000,
  sid: "seller-1",
  oid: "org-1",
})

const partialScopeToken = makeJwt({
  s: PARTIAL_SCOPE_BITMASK,
  iat: 1700000000,
  exp: 1800000000,
})

function mockFetchResponse(status: number, body = "{}"): Response {
  return new Response(body, { status })
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("validateWbToken", () => {
  it("Test 1: valid token с полным scope + probe 200 → ok:true + decoded", async () => {
    const { validateWbToken } = await import("@/lib/wb-token-validate")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse(200)
    )
    const result = await validateWbToken("WB_API_TOKEN", validFullToken)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.decoded.scopeBitmask).toBe(FULL_SCOPE_BITMASK)
      expect(result.decoded.sellerId).toBe("seller-1")
    }
  })

  it("Test 2: scope с {1,2,3} (нет 5,6,7) → ok:false, error содержит Отзывы Статистика Тарифы", async () => {
    const { validateWbToken } = await import("@/lib/wb-token-validate")
    const result = await validateWbToken("WB_API_TOKEN", partialScopeToken)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("Отзывы")
      expect(result.error).toContain("Статистика")
      expect(result.error).toContain("Тарифы")
    }
    // fetch не вызван (scope check провалился до probe)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it("Test 3: probe 401 → ok:false, error содержит 'Неверный токен'", async () => {
    const { validateWbToken } = await import("@/lib/wb-token-validate")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse(401)
    )
    const result = await validateWbToken("WB_API_TOKEN", validFullToken)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("Неверный токен")
    }
  })

  it("Test 4: probe 403 → ok:false, error содержит 'scope' или 'доступ'", async () => {
    const { validateWbToken } = await import("@/lib/wb-token-validate")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse(403)
    )
    const result = await validateWbToken("WB_API_TOKEN", validFullToken)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.toLowerCase()).toMatch(/scope|доступ/i)
    }
  })

  it("Test 5: probe timeout (AbortController) → ok:false, error содержит 'timeout' или 'недоступен'", async () => {
    const { validateWbToken } = await import("@/lib/wb-token-validate")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          // Симулируем AbortError
          const err = new DOMException("Aborted", "AbortError")
          reject(err)
        })
    )
    const result = await validateWbToken("WB_API_TOKEN", validFullToken)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.toLowerCase()).toMatch(/timeout|недоступен/i)
    }
  })

  it("Test 6: REQUIRED_SCOPE_BITS.WB_API_TOKEN deep-equal [1,2,3,5,6,7]", async () => {
    const { REQUIRED_SCOPE_BITS } = await import("@/lib/wb-token-validate")
    expect(REQUIRED_SCOPE_BITS.WB_API_TOKEN).toEqual([1, 2, 3, 5, 6, 7])
  })

  it("Test 7: REQUIRED_SCOPE_BITS для WB_RETURNS_TOKEN=[11] и WB_CHAT_TOKEN=[9]", async () => {
    const { REQUIRED_SCOPE_BITS } = await import("@/lib/wb-token-validate")
    expect(REQUIRED_SCOPE_BITS.WB_RETURNS_TOKEN).toEqual([11])
    expect(REQUIRED_SCOPE_BITS.WB_CHAT_TOKEN).toEqual([9])
  })

  // ── Phase 19 — WB_ADS_TOKEN ───────────────────────────────────────

  it("Test 8 (Phase 19): REQUIRED_SCOPE_BITS.WB_ADS_TOKEN существует и содержит bit для scope «Реклама/Продвижение»", async () => {
    const { REQUIRED_SCOPE_BITS } = await import("@/lib/wb-token-validate")
    expect(REQUIRED_SCOPE_BITS.WB_ADS_TOKEN).toBeDefined()
    expect(REQUIRED_SCOPE_BITS.WB_ADS_TOKEN).toHaveLength(1)
    // НЕ хардкодим конкретный bit — W0-NOTES.md = source of truth, читаем из импорта
    expect(REQUIRED_SCOPE_BITS.WB_ADS_TOKEN[0]).toBeTypeOf("number")
  })

  it("Test 9 (Phase 19): WB_ADS_TOKEN без bit «Реклама» → ok:false, error упоминает Реклама/Продвижение", async () => {
    const { validateWbToken, REQUIRED_SCOPE_BITS } = await import(
      "@/lib/wb-token-validate"
    )
    const adsBit = REQUIRED_SCOPE_BITS.WB_ADS_TOKEN[0]
    // Токен с пустым scopeBitmask — bit отсутствует
    const tokenWithoutAdsScope = makeJwt({
      s: 0,
      exp: 1800000000,
    })
    const result = await validateWbToken("WB_ADS_TOKEN", tokenWithoutAdsScope)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/Реклам|Продвижен/)
    }
    // fetch не вызван (scope check провалился до probe)
    expect(globalThis.fetch).not.toHaveBeenCalled()
    // Sanity: убеждаемся что adsBit > 0 (тест не пуст)
    expect(adsBit).toBeGreaterThan(0)
  })

  it("Test 10 (Phase 19): WB_ADS_TOKEN с bit «Реклама» + probe 200 → ok:true", async () => {
    const { validateWbToken, REQUIRED_SCOPE_BITS } = await import(
      "@/lib/wb-token-validate"
    )
    const adsBit = REQUIRED_SCOPE_BITS.WB_ADS_TOKEN[0]
    const adsBitmask = 1 << adsBit
    const adsToken = makeJwt({
      s: adsBitmask,
      exp: 1800000000,
      sid: "seller-ads",
      oid: "org-ads",
    })
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse(200)
    )
    const result = await validateWbToken("WB_ADS_TOKEN", adsToken)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.decoded.scopeBits).toContain(adsBit)
    }
    // Проверяем что probe запрос был к advert-api
    expect(globalThis.fetch).toHaveBeenCalledOnce()
    const [calledUrl] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(String(calledUrl)).toContain("advert-api.wildberries.ru")
  })

  it("Test 11 (Phase 19): WB_ADS_TOKEN с bit + probe 401 → ok:false, error содержит '401'", async () => {
    const { validateWbToken, REQUIRED_SCOPE_BITS } = await import(
      "@/lib/wb-token-validate"
    )
    const adsBit = REQUIRED_SCOPE_BITS.WB_ADS_TOKEN[0]
    const adsBitmask = 1 << adsBit
    const adsToken = makeJwt({ s: adsBitmask, exp: 1800000000 })
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse(401)
    )
    const result = await validateWbToken("WB_ADS_TOKEN", adsToken)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("401")
    }
  })
})
