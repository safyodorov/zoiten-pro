// tests/wb-jwt.test.ts
// Quick 260512-jxh: Unit-тесты для lib/wb-jwt.ts
// 6 тестов: decode valid, scopeBits 170, invalid format, malformed base64, labels, decodeScopeBits.

import { describe, it, expect } from "vitest"
import { decodeWbJwt, decodeScopeBits, WB_SCOPE_LABELS } from "@/lib/wb-jwt"

// ── Helper: создаём синтетический JWT без сетевых вызовов ─────────

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

// ── Fixtures ───────────────────────────────────────────────────────

// Bitmask для WB_API_TOKEN scope: bits {1,2,3,5,6,7}
// s = 2^1 + 2^2 + 2^3 + 2^5 + 2^6 + 2^7 = 2+4+8+32+64+128 = 238
const FULL_API_SCOPE = 238
const ISSUED_AT_UNIX = 1700000000
const EXPIRES_AT_UNIX = 1800000000

const validToken = makeJwt({
  s: FULL_API_SCOPE,
  iat: ISSUED_AT_UNIX,
  exp: EXPIRES_AT_UNIX,
  sid: "seller-uuid-123",
  oid: "org-uuid-456",
})

// ── Tests ──────────────────────────────────────────────────────────

describe("decodeWbJwt", () => {
  it("Test 1: декодирует валидный токен в правильную структуру", () => {
    const result = decodeWbJwt(validToken)
    expect(result.scopeBitmask).toBe(FULL_API_SCOPE)
    expect(result.scopeBits).toBeInstanceOf(Array)
    expect(result.issuedAt).toBeInstanceOf(Date)
    expect(result.expiresAt).toBeInstanceOf(Date)
    expect(result.issuedAt!.getTime()).toBe(ISSUED_AT_UNIX * 1000)
    expect(result.expiresAt.getTime()).toBe(EXPIRES_AT_UNIX * 1000)
    expect(result.sellerId).toBe("seller-uuid-123")
    expect(result.organizationId).toBe("org-uuid-456")
  })

  it("Test 1b: WB реальный формат — отсутствие iat и числовой oid → issuedAt=null, oid coerced to string", () => {
    // Эмпирически: WB JWT не выставляет iat и oid=number (например 879842).
    const realFormat = makeJwt({
      s: FULL_API_SCOPE,
      exp: EXPIRES_AT_UNIX,
      sid: "real-sid",
      oid: 879842, // number, не string
    })
    const result = decodeWbJwt(realFormat)
    expect(result.issuedAt).toBeNull()
    expect(result.organizationId).toBe("879842") // coerced
    expect(result.sellerId).toBe("real-sid")
    expect(result.expiresAt.getTime()).toBe(EXPIRES_AT_UNIX * 1000)
  })

  it("Test 2: s=170 (0b10101010) → scopeBits=[1, 3, 5, 7]", () => {
    // 170 = 2+8+32+128 = 2^1+2^3+2^5+2^7 → bits 1,3,5,7
    const token = makeJwt({ s: 170, iat: 1700000000, exp: 1800000000 })
    const result = decodeWbJwt(token)
    expect(result.scopeBits).toEqual([1, 3, 5, 7])
    expect(result.scopeBitmask).toBe(170)
  })

  it("Test 3: невалидный JWT (не 3 сегмента) → throws 'Invalid JWT format'", () => {
    expect(() => decodeWbJwt("not.a.valid.jwt.segments")).toThrow("Invalid JWT format")
    expect(() => decodeWbJwt("twoparts")).toThrow("Invalid JWT format")
    expect(() => decodeWbJwt("two.parts")).toThrow("Invalid JWT format")
  })

  it("Test 4: malformed base64 в middle сегменте → throws 'Invalid JWT payload'", () => {
    // Корректный header, невалидный base64url middle (непарсируемый JSON), fake sig
    expect(() => decodeWbJwt("validhdr.!!!notbase64!!!.sig")).toThrow("Invalid JWT payload")
  })

  it("Test 5: WB_SCOPE_LABELS содержит правильные метки", () => {
    expect(WB_SCOPE_LABELS[1]).toBe("Контент")
    expect(WB_SCOPE_LABELS[9]).toBe("Чат")
    expect(WB_SCOPE_LABELS[11]).toBe("Возвраты")
  })

  it("Test 6: decodeScopeBits(170) === [1, 3, 5, 7]", () => {
    expect(decodeScopeBits(170)).toEqual([1, 3, 5, 7])
  })
})
