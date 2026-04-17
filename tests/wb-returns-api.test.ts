import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import sampleResponse from "./fixtures/wb-claim-sample.json"

const ORIGINAL_ENV = process.env.WB_API_TOKEN
const ORIGINAL_RETURNS_ENV = process.env.WB_RETURNS_TOKEN

beforeEach(() => {
  process.env.WB_API_TOKEN = "test-token"
  process.env.WB_RETURNS_TOKEN = "test-returns-token"
  vi.stubGlobal("fetch", vi.fn())
  vi.resetModules()
})

afterEach(() => {
  process.env.WB_API_TOKEN = ORIGINAL_ENV
  process.env.WB_RETURNS_TOKEN = ORIGINAL_RETURNS_ENV
  vi.unstubAllGlobals()
})

function mockResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })
}

describe("listReturns", () => {
  it("строит URL returns-api.wildberries.ru/api/v1/claims с is_archive и шлёт Authorization", async () => {
    const { listReturns } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({ claims: [], total: 0 })
    )

    await listReturns({ is_archive: false, limit: 200, offset: 0 })

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toContain("returns-api.wildberries.ru")
    expect(call[0]).toContain("/api/v1/claims?")
    expect(call[0]).toContain("is_archive=false")
    expect(call[0]).toContain("limit=200")
    expect(call[0]).toContain("offset=0")
    expect(call[1].headers.Authorization).toBe("test-returns-token")
  })

  it("парсит {claims, total} из canonical fixture", async () => {
    const { listReturns } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse(sampleResponse)
    )

    const res = await listReturns({ is_archive: false })

    expect(res.claims).toHaveLength(1)
    expect(res.claims[0].id).toBe("fe3e9337-e9f9-423c-8930-946a8ebef80")
    expect(res.claims[0].actions).toContain("approve1")
    expect(res.total).toBe(1)
  })

  it("поддерживает offset pagination", async () => {
    const { listReturns } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({ claims: [], total: 500 })
    )

    await listReturns({ is_archive: true, limit: 200, offset: 400 })

    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain("is_archive=true")
    expect(url).toContain("offset=400")
  })

  it(
    "ретраит при 429 с заголовком X-Ratelimit-Retry",
    async () => {
      const { listReturns } = await import("@/lib/wb-support-api")
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      fetchMock.mockResolvedValueOnce(mockResponse({}, 429, { "X-Ratelimit-Retry": "1" }))
      fetchMock.mockResolvedValueOnce(mockResponse({ claims: [], total: 0 }))

      const res = await listReturns({ is_archive: false })

      expect(res.claims).toEqual([])
      expect(fetchMock).toHaveBeenCalledTimes(2)
    },
    10000
  )

  it("кидает русскую ошибку при 401", async () => {
    const { listReturns } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({}, 401)
    )

    await expect(listReturns({ is_archive: false })).rejects.toThrow(
      "Неверный токен WB API"
    )
  })

  it("кидает ошибку про scope bit 11 при 403 от returns-api", async () => {
    const { listReturns } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({}, 403)
    )

    await expect(listReturns({ is_archive: false })).rejects.toThrow("bit 11 Buyers Returns")
  })

  it("добавляет nm_id и id фильтры в query params", async () => {
    const { listReturns } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({ claims: [], total: 0 })
    )

    await listReturns({ is_archive: false, id: "uuid-1", nm_id: 196320101 })

    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain("id=uuid-1")
    expect(url).toContain("nm_id=196320101")
  })
})

describe("approveReturn", () => {
  it("шлёт PATCH /api/v1/claim с body {id, action}", async () => {
    const { approveReturn } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({})
    )

    await approveReturn("uuid-1", "approve1")

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toContain("returns-api.wildberries.ru/api/v1/claim")
    expect(call[1].method).toBe("PATCH")
    expect(JSON.parse(call[1].body)).toEqual({ id: "uuid-1", action: "approve1" })
  })

  it("добавляет comment для approvecc1 если передан", async () => {
    const { approveReturn } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({})
    )

    await approveReturn("uuid-2", "approvecc1", "С пояснением от продавца")

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(call[1].body as string)
    expect(body).toEqual({
      id: "uuid-2",
      action: "approvecc1",
      comment: "С пояснением от продавца",
    })
  })
})

describe("rejectReturn", () => {
  it("шлёт PATCH с action rejectcustom + comment", async () => {
    const { rejectReturn } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({})
    )

    await rejectReturn("uuid-3", "Фото не соответствует товару из заявки")

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(call[1].body as string)
    expect(body).toEqual({
      id: "uuid-3",
      action: "rejectcustom",
      comment: "Фото не соответствует товару из заявки",
    })
  })

  it("throws если reason < 10 символов", async () => {
    const { rejectReturn } = await import("@/lib/wb-support-api")
    await expect(rejectReturn("uuid", "Коротко")).rejects.toThrow("от 10 до 1000")
  })

  it("throws если reason > 1000 символов", async () => {
    const { rejectReturn } = await import("@/lib/wb-support-api")
    await expect(rejectReturn("uuid", "x".repeat(1001))).rejects.toThrow("от 10 до 1000")
  })
})

describe("reconsiderReturn", () => {
  it("шлёт PATCH с переданным wbAction (обычно approve1) без comment", async () => {
    const { reconsiderReturn } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({})
    )

    await reconsiderReturn("uuid-4", "approve1")

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(call[1].body as string)
    expect(body).toEqual({ id: "uuid-4", action: "approve1" })
  })
})
