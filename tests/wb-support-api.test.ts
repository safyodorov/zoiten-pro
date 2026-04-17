import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const ORIGINAL_ENV = process.env.WB_API_TOKEN

beforeEach(() => {
  process.env.WB_API_TOKEN = "test-token"
  vi.stubGlobal("fetch", vi.fn())
})

afterEach(() => {
  process.env.WB_API_TOKEN = ORIGINAL_ENV
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

describe("listFeedbacks", () => {
  it("строит корректный URL с query params и шлёт Authorization header", async () => {
    const { listFeedbacks } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({ data: { feedbacks: [] } })
    )

    await listFeedbacks({ isAnswered: false, take: 5000, skip: 0 })

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toContain("https://feedbacks-api.wildberries.ru/api/v1/feedbacks?")
    expect(call[0]).toContain("isAnswered=false")
    expect(call[0]).toContain("take=5000")
    expect(call[0]).toContain("skip=0")
    expect(call[1].headers.Authorization).toBe("test-token")
  })

  it("парсит response в формате {data: {feedbacks: [...]}}", async () => {
    const { listFeedbacks } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({
        data: {
          feedbacks: [
            {
              id: "X",
              text: "t",
              productValuation: 5,
              createdDate: "",
              state: "wbRu",
              answer: null,
              productDetails: {
                imtId: 1,
                nmId: 2,
                productName: "",
                supplierArticle: "",
                brandName: "",
              },
              photoLinks: [],
              video: null,
            },
          ],
        },
      })
    )

    const res = await listFeedbacks({ take: 10, skip: 0 })

    expect(res).toHaveLength(1)
    expect(res[0].id).toBe("X")
    expect(res[0].productDetails.nmId).toBe(2)
  })

  it(
    "ретраит при 429 с заголовком X-Ratelimit-Retry",
    async () => {
      const { listFeedbacks } = await import("@/lib/wb-support-api")
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      fetchMock.mockResolvedValueOnce(mockResponse({}, 429, { "X-Ratelimit-Retry": "1" }))
      fetchMock.mockResolvedValueOnce(mockResponse({ data: { feedbacks: [] } }))

      const res = await listFeedbacks({ take: 10, skip: 0 })

      expect(res).toEqual([])
      expect(fetchMock).toHaveBeenCalledTimes(2)
    },
    10000
  )

  it("кидает русскую ошибку при 401", async () => {
    const { listFeedbacks } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({}, 401)
    )

    await expect(listFeedbacks({ take: 10, skip: 0 })).rejects.toThrow(
      "Неверный токен WB API"
    )
  })

  it("кидает русскую ошибку при 403 с упоминанием scope", async () => {
    const { listFeedbacks } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({}, 403)
    )

    await expect(listFeedbacks({ take: 10, skip: 0 })).rejects.toThrow(
      /scope токена/
    )
  })
})

describe("replyFeedback", () => {
  it("шлёт POST /api/v1/feedbacks/answer с body {id, text}", async () => {
    const { replyFeedback } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({})
    )

    await replyFeedback("ABC", "Спасибо!")

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toContain("/api/v1/feedbacks/answer")
    expect(call[1].method).toBe("POST")
    expect(JSON.parse(call[1].body)).toEqual({ id: "ABC", text: "Спасибо!" })
  })
})

describe("editFeedbackAnswer", () => {
  it("шлёт PATCH /api/v1/feedbacks/answer с body {id, text}", async () => {
    const { editFeedbackAnswer } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({})
    )

    await editFeedbackAnswer("ABC", "Исправленный ответ")

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toContain("/api/v1/feedbacks/answer")
    expect(call[1].method).toBe("PATCH")
    expect(JSON.parse(call[1].body)).toEqual({ id: "ABC", text: "Исправленный ответ" })
  })
})

describe("listQuestions", () => {
  it("строит корректный URL и парсит ответ", async () => {
    const { listQuestions } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({ data: { questions: [] } })
    )

    await listQuestions({ isAnswered: false, take: 10000, skip: 0 })

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toContain("/api/v1/questions?")
    expect(call[0]).toContain("isAnswered=false")
    expect(call[0]).toContain("take=10000")
  })
})

describe("replyQuestion", () => {
  it('шлёт PATCH /api/v1/questions с body {id, answer:{text}, state:"wbRu"}', async () => {
    const { replyQuestion } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({})
    )

    await replyQuestion("Q1", "Будет в наличии на следующей неделе")

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toContain("/api/v1/questions")
    expect(call[1].method).toBe("PATCH")
    expect(JSON.parse(call[1].body)).toEqual({
      id: "Q1",
      answer: { text: "Будет в наличии на следующей неделе" },
      state: "wbRu",
    })
  })
})

describe("getToken guard", () => {
  it("кидает ошибку если WB_API_TOKEN не настроен", async () => {
    delete process.env.WB_API_TOKEN
    const { listFeedbacks } = await import("@/lib/wb-support-api")

    await expect(listFeedbacks({ take: 10, skip: 0 })).rejects.toThrow(
      "WB_API_TOKEN не настроен"
    )
  })
})
