// tests/wb-token-cache.test.ts
// Quick 260512-jxh: Unit-тесты для lib/wb-token.ts
// 6 тестов: bootstrap из env, cache hit, cache miss после TTL, invalidate, empty→throws, WB_TOKEN_NAMES.

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── vi.hoisted — создаём прежде чем поднимутся vi.mock ───────────

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    wbApiToken: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  }
  return { prismaMock }
})

// ── Моки ─────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}))

// ── Импорты после регистрации моков ──────────────────────────────

import {
  getWbToken,
  invalidateWbTokenCache,
  WB_TOKEN_NAMES,
} from "@/lib/wb-token"

// ── Helper: синтетический JWT для bootstrap ───────────────────────

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

const BOOTSTRAP_TOKEN = makeJwt({
  s: 238,
  iat: 1700000000,
  exp: 1800000000,
  sid: "test-seller",
  oid: "test-org",
})

// ── Setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
  // По умолчанию БД пустая
  prismaMock.wbApiToken.findUnique.mockResolvedValue(null)
  prismaMock.wbApiToken.upsert.mockResolvedValue({})
  // Инвалидируем весь кеш перед каждым тестом
  invalidateWbTokenCache()
})

// ── Tests ─────────────────────────────────────────────────────────

describe("getWbToken", () => {
  it("Test 1: пустая БД + process.env.WB_API_TOKEN=bootstrap → возвращает токен + upsert вызван", async () => {
    process.env.WB_API_TOKEN = BOOTSTRAP_TOKEN
    const result = await getWbToken("WB_API_TOKEN")
    expect(result).toBe(BOOTSTRAP_TOKEN)
    expect(prismaMock.wbApiToken.upsert).toHaveBeenCalledOnce()
    const call = prismaMock.wbApiToken.upsert.mock.calls[0][0]
    expect(call.where).toEqual({ name: "WB_API_TOKEN" })
    expect(call.create.updatedById).toBeNull() // bootstrap marker
    delete process.env.WB_API_TOKEN
  })

  it("Test 2: повторный getWbToken в течение 5 сек — cache hit, БД не вызвана", async () => {
    // Заполняем кеш: сначала call с данными в БД
    const dbRecord = {
      name: "WB_API_TOKEN",
      value: "db-token-value",
      scopeBitmask: 238,
      issuedAt: new Date(),
      expiresAt: new Date(),
    }
    prismaMock.wbApiToken.findUnique.mockResolvedValue(dbRecord)

    const first = await getWbToken("WB_API_TOKEN")
    expect(first).toBe("db-token-value")
    expect(prismaMock.wbApiToken.findUnique).toHaveBeenCalledOnce()

    // Второй вызов — сразу после (в рамках TTL 5 сек)
    const second = await getWbToken("WB_API_TOKEN")
    expect(second).toBe("db-token-value")
    // findUnique должен быть вызван только один раз (кеш сработал)
    expect(prismaMock.wbApiToken.findUnique).toHaveBeenCalledOnce()
  })

  it("Test 3: cache miss после 5+ сек → новый prisma.findUnique", async () => {
    vi.useFakeTimers()
    const dbRecord = {
      name: "WB_API_TOKEN",
      value: "fresh-value",
      scopeBitmask: 238,
      issuedAt: new Date(),
      expiresAt: new Date(),
    }
    prismaMock.wbApiToken.findUnique.mockResolvedValue(dbRecord)

    await getWbToken("WB_API_TOKEN")
    expect(prismaMock.wbApiToken.findUnique).toHaveBeenCalledOnce()

    // Продвигаем время на 5001ms (прошёл TTL)
    vi.advanceTimersByTime(5001)

    await getWbToken("WB_API_TOKEN")
    expect(prismaMock.wbApiToken.findUnique).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })

  it("Test 4: invalidateWbTokenCache('WB_API_TOKEN') → следующий getWbToken идёт в БД", async () => {
    const dbRecord = {
      name: "WB_API_TOKEN",
      value: "cached-value",
      scopeBitmask: 238,
      issuedAt: new Date(),
      expiresAt: new Date(),
    }
    prismaMock.wbApiToken.findUnique.mockResolvedValue(dbRecord)

    await getWbToken("WB_API_TOKEN")
    expect(prismaMock.wbApiToken.findUnique).toHaveBeenCalledOnce()

    // Инвалидируем конкретный токен
    invalidateWbTokenCache("WB_API_TOKEN")

    await getWbToken("WB_API_TOKEN")
    expect(prismaMock.wbApiToken.findUnique).toHaveBeenCalledTimes(2)
  })

  it("Test 5: пустая БД + пустой env → throws с упоминанием 'WB_API_TOKEN не настроен'", async () => {
    delete process.env.WB_API_TOKEN
    await expect(getWbToken("WB_API_TOKEN")).rejects.toThrow(
      "WB_API_TOKEN не настроен"
    )
  })

  it("Test 6: WB_TOKEN_NAMES = ['WB_API_TOKEN', 'WB_RETURNS_TOKEN', 'WB_CHAT_TOKEN']", () => {
    expect(WB_TOKEN_NAMES).toEqual([
      "WB_API_TOKEN",
      "WB_RETURNS_TOKEN",
      "WB_CHAT_TOKEN",
    ])
  })
})
