import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("node:fs", () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}))

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn())
  process.env.UPLOAD_DIR = "/tmp/test-uploads"
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("downloadMedia", () => {
  it("пишет файл в {UPLOAD_DIR}/support/{ticketId}/{messageId}/{sanitized}", async () => {
    const { downloadMedia } = await import("@/lib/support-media")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), { status: 200 })
    )
    const res = await downloadMedia({
      wbUrl: "https://feedback04.wbbasket.ru/abc/def/fs.webp",
      ticketId: "T1",
      messageId: "M1",
    })
    // path.join может использовать обратные слеши на Windows — проверяем части
    expect(res.localPath).toMatch(/support/)
    expect(res.localPath).toMatch(/T1/)
    expect(res.localPath).toMatch(/M1/)
    expect(res.localPath).toMatch(/fs\.webp$/)
    expect(res.sizeBytes).toBe(3)
    expect(res.error).toBeUndefined()
  })

  it(
    "ретраит 1 раз при fetch error, затем возвращает error",
    async () => {
      const { downloadMedia } = await import("@/lib/support-media")
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      fetchMock.mockRejectedValueOnce(new Error("network fail"))
      fetchMock.mockRejectedValueOnce(new Error("network fail again"))
      const res = await downloadMedia({
        wbUrl: "https://x/y.jpg",
        ticketId: "T",
        messageId: "M",
      })
      expect(res.error).toBeDefined()
      expect(fetchMock).toHaveBeenCalledTimes(2)
    },
    10000
  )

  it(
    "успешно завершается на 2-й попытке после первого fail",
    async () => {
      const { downloadMedia } = await import("@/lib/support-media")
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      fetchMock.mockRejectedValueOnce(new Error("first"))
      fetchMock.mockResolvedValueOnce(
        new Response(new Uint8Array([9]), { status: 200 })
      )
      const res = await downloadMedia({
        wbUrl: "https://x/ok.jpg",
        ticketId: "T",
        messageId: "M",
      })
      expect(res.error).toBeUndefined()
      expect(res.sizeBytes).toBe(1)
    },
    10000
  )
})

describe("downloadMediaBatch", () => {
  it(
    "обрабатывает пакеты concurrency=5, не ломается на одном failing",
    async () => {
      const { downloadMediaBatch } = await import("@/lib/support-media")
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      // 3 успех, 1 fail (fail делает 2 попытки, итого 5 fetch-вызовов)
      fetchMock
        .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200 }))
        .mockResolvedValueOnce(new Response(new Uint8Array([2]), { status: 200 }))
        .mockResolvedValueOnce(new Response(new Uint8Array([3]), { status: 200 }))
        .mockRejectedValueOnce(new Error("fail"))
        .mockRejectedValueOnce(new Error("fail"))
      const items = [
        { wbUrl: "https://x/1.jpg", ticketId: "T", messageId: "M1" },
        { wbUrl: "https://x/2.jpg", ticketId: "T", messageId: "M2" },
        { wbUrl: "https://x/3.jpg", ticketId: "T", messageId: "M3" },
        { wbUrl: "https://x/4.jpg", ticketId: "T", messageId: "M4" },
      ]
      const res = await downloadMediaBatch(items, 5)
      expect(res).toHaveLength(4)
      expect(res.filter((r) => r.localPath).length).toBe(3)
      expect(res.filter((r) => r.error).length).toBe(1)
    },
    10000
  )
})
