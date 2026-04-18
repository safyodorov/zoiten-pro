import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import chatsSample from "./fixtures/wb-chat-chats-sample.json"
import eventsSample from "./fixtures/wb-chat-events-sample.json"

const ORIGINAL_API = process.env.WB_API_TOKEN
const ORIGINAL_CHAT = process.env.WB_CHAT_TOKEN

beforeEach(() => {
  process.env.WB_API_TOKEN = "test-token"
  process.env.WB_CHAT_TOKEN = "test-chat-token"
  vi.stubGlobal("fetch", vi.fn())
  vi.resetModules()
})

afterEach(() => {
  process.env.WB_API_TOKEN = ORIGINAL_API
  process.env.WB_CHAT_TOKEN = ORIGINAL_CHAT
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

describe("pingChat", () => {
  it("GET /ping с Authorization: WB_CHAT_TOKEN", async () => {
    const { pingChat } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse({}))
    await pingChat()
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe("https://buyer-chat-api.wildberries.ru/ping")
    expect(call[1].headers.Authorization).toBe("test-chat-token")
  })
})

describe("listChats", () => {
  it("GET /api/v1/seller/chats и парсит result[]", async () => {
    const { listChats } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse(chatsSample)
    )
    const res = await listChats()
    expect(res).toHaveLength(2)
    expect(res[0].chatID).toBe("9e1b3f80-a8d6-4c7f-b9aa-8e11f2c4dd01")
    expect(res[0].replySign).toBe("base64signature==")
    expect(res[0].clientName).toBe("Иван П.")
    expect(res[0].goodCard?.nmID).toBe(123456789)
  })

  it("возвращает [] если result отсутствует", async () => {
    const { listChats } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({ errors: null })
    )
    const res = await listChats()
    expect(res).toEqual([])
  })
})

describe("getChatEvents", () => {
  it("без next — GET без query", async () => {
    const { getChatEvents } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse(eventsSample)
    )
    await getChatEvents()
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toBe("https://buyer-chat-api.wildberries.ru/api/v1/seller/events")
  })

  it("с next cursor — GET с query next=X", async () => {
    const { getChatEvents } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse(eventsSample)
    )
    await getChatEvents(1713355200123)
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain("next=1713355200123")
  })

  it("парсит events + next + totalEvents из fixture", async () => {
    const { getChatEvents } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse(eventsSample)
    )
    const res = await getChatEvents()
    expect(res.events).toHaveLength(2)
    expect(res.events[0].eventID).toBe("evt-abc123")
    expect(res.events[0].sender).toBe("client")
    expect(res.events[1].isNewChat).toBe(true)
    expect(res.next).toBe(1713355200123)
    expect(res.totalEvents).toBe(2)
  })
})

describe("sendChatMessage", () => {
  it("POST multipart с replySign + message, body — FormData, Content-Type НЕ application/json", async () => {
    const { sendChatMessage } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({ result: { addTime: 1234567890, chatID: "9e1b3f80" } })
    )
    await sendChatMessage({ replySign: "sign", message: "Здравствуйте!" })
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toContain("/api/v1/seller/message")
    expect(call[1].method).toBe("POST")
    expect(call[1].body).toBeInstanceOf(FormData)
    expect(call[1].headers.Authorization).toBe("test-chat-token")
    expect(call[1].headers["Content-Type"]).toBeUndefined()
    const fd = call[1].body as FormData
    expect(fd.get("replySign")).toBe("sign")
    expect(fd.get("message")).toBe("Здравствуйте!")
  })

  it("прикрепляет файлы через form.append('file', blob, name)", async () => {
    const { sendChatMessage } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({ result: {} })
    )
    const data = Buffer.from([1, 2, 3, 4, 5])
    await sendChatMessage({
      replySign: "sign",
      message: "With file",
      files: [{ name: "photo.jpg", data, contentType: "image/jpeg" }],
    })
    const fd = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as FormData
    const file = fd.get("file") as File | null
    expect(file).toBeTruthy()
    expect(file?.name).toBe("photo.jpg")
  })

  it("throws если replySign > 255 символов", async () => {
    const { sendChatMessage } = await import("@/lib/wb-support-api")
    await expect(sendChatMessage({ replySign: "x".repeat(256) })).rejects.toThrow("255")
  })

  it("throws если message > 1000 символов", async () => {
    const { sendChatMessage } = await import("@/lib/wb-support-api")
    await expect(
      sendChatMessage({ replySign: "s", message: "x".repeat(1001) })
    ).rejects.toThrow("1000")
  })

  it("throws если файл больше 5 МБ", async () => {
    const { sendChatMessage } = await import("@/lib/wb-support-api")
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 0)
    await expect(
      sendChatMessage({
        replySign: "s",
        files: [{ name: "big.jpg", data: big, contentType: "image/jpeg" }],
      })
    ).rejects.toThrow("больше 5")
  })
})

describe("downloadChatAttachment", () => {
  it("GET /api/v1/seller/download/{id} → Buffer", async () => {
    const { downloadChatAttachment } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(new Uint8Array([7, 8, 9]), { status: 200 })
    )
    const buf = await downloadChatAttachment("file-xyz")
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain("/api/v1/seller/download/file-xyz")
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.length).toBe(3)
  })
})

describe("Chat API — 429 + 401/403 errors", () => {
  it(
    "ретраит при 429 с X-Ratelimit-Retry",
    async () => {
      const { listChats } = await import("@/lib/wb-support-api")
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      fetchMock.mockResolvedValueOnce(mockResponse({}, 429, { "X-Ratelimit-Retry": "1" }))
      fetchMock.mockResolvedValueOnce(mockResponse({ result: [] }))
      const res = await listChats()
      expect(res).toEqual([])
      expect(fetchMock).toHaveBeenCalledTimes(2)
    },
    10000
  )

  it("бросает русскую ошибку на 401", async () => {
    const { listChats } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({}, 401)
    )
    await expect(listChats()).rejects.toThrow("Неверный токен WB API")
  })

  it("бросает ошибку с 'bit 9 Buyers chat' на 403 от buyer-chat-api", async () => {
    const { listChats } = await import("@/lib/wb-support-api")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({}, 403)
    )
    await expect(listChats()).rejects.toThrow("bit 9")
  })
})
