import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("@/lib/support-sync", () => ({
  syncSupport: vi
    .fn()
    .mockResolvedValue({ feedbacksSynced: 0, questionsSynced: 0, mediaSaved: 0, errors: [] }),
}))

beforeEach(() => {
  process.env.CRON_SECRET = "test-secret"
})

afterEach(() => vi.clearAllMocks())

function mockReq(headers: Record<string, string> = {}) {
  return {
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as any
}

describe("support-sync-reviews cron", () => {
  it("возвращает 401 без x-cron-secret", async () => {
    const { GET } = await import("@/app/api/cron/support-sync-reviews/route")
    const res = await GET(mockReq({}))
    expect(res.status).toBe(401)
  })

  it("возвращает 401 при неверном x-cron-secret", async () => {
    const { GET } = await import("@/app/api/cron/support-sync-reviews/route")
    const res = await GET(mockReq({ "x-cron-secret": "wrong" }))
    expect(res.status).toBe(401)
  })

  it("возвращает 200 и вызывает syncSupport при валидном x-cron-secret", async () => {
    const { GET } = await import("@/app/api/cron/support-sync-reviews/route")
    const { syncSupport } = await import("@/lib/support-sync")
    const res = await GET(mockReq({ "x-cron-secret": "test-secret" }))
    expect(res.status).toBe(200)
    expect(syncSupport).toHaveBeenCalledWith({ isAnswered: false })
  })
})
