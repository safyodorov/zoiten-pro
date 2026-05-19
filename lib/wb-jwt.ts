// Quick 260512-jxh: декодер WB JWT-токенов.
// Формат: 3 dot-segments, middle = base64url JSON {s, iat, exp, sid, oid}.
// Нет внешних зависимостей — работает и в Node.js (RSC) и в тестах.

export const WB_SCOPE_LABELS: Record<number, string> = {
  1: "Контент",
  2: "Аналитика",
  3: "Цены",
  // Phase 19 W0 (2026-05-19): УДАЛЕНА ошибочная метка `4: "Продвижение"`.
  // Эмпирически WB_API_TOKEN с scope «Продвижение» имеет bit 30, не 4.
  // (Старая метка появилась из устаревшей документации; bit 4 у токенов не выставлен.)
  5: "Отзывы",
  6: "Статистика",
  7: "Тарифы",
  9: "Чат",
  11: "Возвраты",
  30: "Продвижение", // Phase 19 — scope для WB Advert API
}

export interface WbJwtPayload {
  scopeBits: number[] // массив set-битов из `s` (1-based indices)
  scopeBitmask: number // raw `s`
  issuedAt: Date | null // WB JWT часто НЕ содержит `iat` — используем null
  expiresAt: Date
  sellerId: string | null
  organizationId: string | null
}

// Bitmask → array of set bit indices (1-based positions where 2^(bit-1) contributes to s).
// Пример: 170 = 0b10101010 → биты 1,3,5,7 установлены (2^0=1, 2^2=4, 2^4=16, 2^6=64 ... нет)
// Формула WB: s = sum of 2^(bit_index) where bit_index is 0-based count.
// Bit 1 = 2^1 = 2, bit 2 = 2^2 = 4, bit 3 = 2^3 = 8, bit 5 = 2^5 = 32, etc.
// Но для теста s=170=0b10101010: установлены позиции 1,3,5,7 (0-indexed: 1,3,5,7).
// decodeScopeBits(170) должен вернуть [1,3,5,7].
export function decodeScopeBits(s: number): number[] {
  const bits: number[] = []
  for (let i = 0; i < 32; i++) {
    if (s & (1 << i)) bits.push(i)
  }
  return bits
}

function base64UrlDecode(input: string): string {
  // base64url → base64 (replace -_ с +/, добавить padding =)
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/")
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4))
  // Node Buffer (RSC, тесты) с fallback на atob (browser)
  if (typeof Buffer !== "undefined") {
    return Buffer.from(b64 + pad, "base64").toString("utf-8")
  }
  return atob(b64 + pad)
}

export function decodeWbJwt(token: string): WbJwtPayload {
  const trimmed = token.trim()
  const segments = trimmed.split(".")
  if (segments.length !== 3) {
    throw new Error("Invalid JWT format — ожидалось 3 сегмента через точку")
  }
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(base64UrlDecode(segments[1]))
  } catch {
    throw new Error("Invalid JWT payload — не удалось декодировать base64url JSON")
  }
  const s = typeof payload.s === "number" ? payload.s : NaN
  const exp = typeof payload.exp === "number" ? payload.exp : NaN
  // 2026-05-12: `iat` опционален — WB JWT часто его не выставляют.
  // `oid` и `sid` приходят как number или string — coerce оба к string.
  if (Number.isNaN(s) || Number.isNaN(exp)) {
    throw new Error("Invalid JWT payload — отсутствуют обязательные поля s/exp")
  }
  const iat = typeof payload.iat === "number" ? payload.iat : null
  const coerceId = (v: unknown): string | null => {
    if (typeof v === "string") return v
    if (typeof v === "number" && Number.isFinite(v)) return String(v)
    return null
  }
  return {
    scopeBits: decodeScopeBits(s),
    scopeBitmask: s,
    issuedAt: iat !== null ? new Date(iat * 1000) : null,
    expiresAt: new Date(exp * 1000),
    sellerId: coerceId(payload.sid),
    organizationId: coerceId(payload.oid),
  }
}
