// tests/wb-cooldown.test.ts
// Backlog 999.1: WB Cooldown Bus — AppSetting('wbCooldownUntil').

import { describe, it, expect, vi, beforeEach } from "vitest"

const findUniqueMock = vi.fn()
const upsertMock = vi.fn()
const deleteMock = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appSetting: {
      findUnique: findUniqueMock,
      upsert: upsertMock,
      delete: deleteMock,
    },
  },
}))

beforeEach(() => {
  findUniqueMock.mockReset()
  upsertMock.mockReset()
  deleteMock.mockReset()
  upsertMock.mockResolvedValue({})
  deleteMock.mockResolvedValue({})
})

describe("getWbCooldownUntil", () => {
  it("возвращает null если нет записи", async () => {
    findUniqueMock.mockResolvedValueOnce(null)
    const { getWbCooldownUntil } = await import("@/lib/wb-cooldown")
    expect(await getWbCooldownUntil()).toBeNull()
  })

  it("возвращает Date если cooldown в будущем", async () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    findUniqueMock.mockResolvedValueOnce({ value: future })
    const { getWbCooldownUntil } = await import("@/lib/wb-cooldown")
    const result = await getWbCooldownUntil()
    expect(result).toBeInstanceOf(Date)
    expect(result!.getTime()).toBeGreaterThan(Date.now())
  })

  it("истёкший lock удаляется и возвращается null", async () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    findUniqueMock.mockResolvedValueOnce({ value: past })
    const { getWbCooldownUntil } = await import("@/lib/wb-cooldown")
    expect(await getWbCooldownUntil()).toBeNull()
    expect(deleteMock).toHaveBeenCalledWith({ where: { key: "wbCooldownUntil" } })
  })

  it("невалидный value возвращает null без crash", async () => {
    findUniqueMock.mockResolvedValueOnce({ value: "not-a-date" })
    const { getWbCooldownUntil } = await import("@/lib/wb-cooldown")
    expect(await getWbCooldownUntil()).toBeNull()
  })
})

describe("setWbCooldownUntil", () => {
  it("записывает новый cooldown если нет существующего", async () => {
    findUniqueMock.mockResolvedValueOnce(null)
    const { setWbCooldownUntil } = await import("@/lib/wb-cooldown")
    const before = Date.now()
    const unlockAt = await setWbCooldownUntil(720)
    const after = Date.now()

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: "wbCooldownUntil" } })
    )
    expect(unlockAt.getTime()).toBeGreaterThanOrEqual(before + 720 * 1000 - 5)
    expect(unlockAt.getTime()).toBeLessThanOrEqual(after + 720 * 1000 + 5)
  })

  it("игнорирует короткий retry если существующий cooldown дольше (max-логика)", async () => {
    const longExisting = new Date(Date.now() + 3600 * 1000).toISOString()
    findUniqueMock.mockResolvedValueOnce({ value: longExisting })
    const { setWbCooldownUntil } = await import("@/lib/wb-cooldown")

    const result = await setWbCooldownUntil(60) // 1 min — короче существующего часа
    expect(upsertMock).not.toHaveBeenCalled()
    expect(result.toISOString()).toBe(longExisting)
  })

  it("расширяет cooldown если новый retry дольше существующего", async () => {
    const shortExisting = new Date(Date.now() + 60 * 1000).toISOString()
    findUniqueMock.mockResolvedValueOnce({ value: shortExisting })
    const { setWbCooldownUntil } = await import("@/lib/wb-cooldown")

    const result = await setWbCooldownUntil(3600) // 1h — длиннее
    expect(upsertMock).toHaveBeenCalled()
    expect(result.getTime()).toBeGreaterThan(new Date(shortExisting).getTime())
  })

  it("retryAfterSec=0 или отрицательный — no-op (не пишет)", async () => {
    findUniqueMock.mockResolvedValueOnce(null)
    const { setWbCooldownUntil } = await import("@/lib/wb-cooldown")
    await setWbCooldownUntil(0)
    expect(upsertMock).not.toHaveBeenCalled()

    findUniqueMock.mockResolvedValueOnce(null)
    await setWbCooldownUntil(-100)
    expect(upsertMock).not.toHaveBeenCalled()
  })
})

describe("getWbCooldownSecondsRemaining", () => {
  it("возвращает 0 если нет cooldown", async () => {
    findUniqueMock.mockResolvedValueOnce(null)
    const { getWbCooldownSecondsRemaining } = await import("@/lib/wb-cooldown")
    expect(await getWbCooldownSecondsRemaining()).toBe(0)
  })

  it("возвращает положительное число секунд если cooldown активен", async () => {
    const future = new Date(Date.now() + 720 * 1000).toISOString()
    findUniqueMock.mockResolvedValueOnce({ value: future })
    const { getWbCooldownSecondsRemaining } = await import("@/lib/wb-cooldown")
    const sec = await getWbCooldownSecondsRemaining()
    expect(sec).toBeGreaterThan(715)
    expect(sec).toBeLessThanOrEqual(720)
  })
})
