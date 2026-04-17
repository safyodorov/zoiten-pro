import { describe, it, expect, vi, beforeEach } from "vitest"

const unlinkMock = vi.fn()
vi.mock("node:fs", () => ({
  promises: { unlink: unlinkMock },
}))

const findManyMock = vi.fn()
const deleteManyMock = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: {
    supportMedia: {
      findMany: findManyMock,
      deleteMany: deleteManyMock,
    },
  },
}))

beforeEach(() => {
  process.env.CRON_SECRET = "test-secret"
  unlinkMock.mockReset()
  findManyMock.mockReset()
  deleteManyMock.mockReset()
})

function mockReq(headers: Record<string, string> = {}) {
  return {
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as any
}

describe("support-media-cleanup cron", () => {
  it("возвращает 401 без секрета", async () => {
    const { GET } = await import("@/app/api/cron/support-media-cleanup/route")
    const res = await GET(mockReq({}))
    expect(res.status).toBe(401)
  })

  it("удаляет файлы и записи SupportMedia где expiresAt < now()", async () => {
    findManyMock.mockResolvedValueOnce([
      { id: "M1", localPath: "/tmp/a.jpg" },
      { id: "M2", localPath: "/tmp/b.jpg" },
    ])
    unlinkMock.mockResolvedValue(undefined)
    deleteManyMock.mockResolvedValueOnce({ count: 2 })

    const { GET } = await import("@/app/api/cron/support-media-cleanup/route")
    const res = await GET(mockReq({ "x-cron-secret": "test-secret" }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.rowsDeleted).toBe(2)
    expect(body.filesDeleted).toBe(2)
    expect(unlinkMock).toHaveBeenCalledTimes(2)
  })

  it("игнорирует ENOENT при fs.unlink", async () => {
    findManyMock.mockResolvedValueOnce([{ id: "M1", localPath: "/tmp/missing.jpg" }])
    const enoent = Object.assign(new Error("not found"), { code: "ENOENT" })
    unlinkMock.mockRejectedValueOnce(enoent)
    deleteManyMock.mockResolvedValueOnce({ count: 1 })

    const { GET } = await import("@/app/api/cron/support-media-cleanup/route")
    const res = await GET(mockReq({ "x-cron-secret": "test-secret" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rowsDeleted).toBe(1)
  })
})
