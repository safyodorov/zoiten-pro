// Quick 260512-jxh: hot-reload WB-токенов с TTL 5 сек.
// Source of truth: prisma.wbApiToken. Bootstrap из process.env при пустой БД.
// invalidateWbTokenCache вызывается из replaceWbToken после upsert.

import { prisma } from "@/lib/prisma"
import { decodeWbJwt } from "@/lib/wb-jwt"

export const WB_TOKEN_NAMES = [
  "WB_API_TOKEN",
  "WB_RETURNS_TOKEN",
  "WB_CHAT_TOKEN",
  "WB_ADS_TOKEN", // Phase 19 — WB Advert API (scope bit 30 «Продвижение»)
  "WB_ADS_TOKEN_2", // 2026-05-20 — второй токен для ротации /fullstats (1 req/hour лимит)
] as const
export type WbTokenName = (typeof WB_TOKEN_NAMES)[number]

const CACHE_TTL_MS = 5000
const cache = new Map<WbTokenName, { value: string; fetchedAt: number }>()

export function invalidateWbTokenCache(name?: WbTokenName) {
  if (name) cache.delete(name)
  else cache.clear()
}

async function bootstrapFromEnv(name: WbTokenName): Promise<string | null> {
  const envValue = process.env[name]
  if (!envValue) return null
  // Decode чтобы заполнить scopeBitmask/iat/exp/sid/oid.
  // Если env-токен сломан — fail fast, не создаём запись с null-полями.
  try {
    const decoded = decodeWbJwt(envValue)
    await prisma.wbApiToken.upsert({
      where: { name },
      create: {
        name,
        value: envValue,
        scopeBitmask: decoded.scopeBitmask,
        issuedAt: decoded.issuedAt,
        expiresAt: decoded.expiresAt,
        sellerId: decoded.sellerId,
        organizationId: decoded.organizationId,
        updatedById: null, // bootstrap marker
      },
      update: {}, // idempotent — не перезаписываем существующую запись из UI
    })
    return envValue
  } catch {
    // Невалидный env-токен — возвращаем null чтобы getWbToken бросил понятную ошибку
    return null
  }
}

export async function getWbToken(name: WbTokenName): Promise<string> {
  const now = Date.now()
  const cached = cache.get(name)
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.value
  }
  const record = await prisma.wbApiToken.findUnique({ where: { name } })
  if (record) {
    cache.set(name, { value: record.value, fetchedAt: now })
    return record.value
  }
  // Bootstrap: пусто в БД → читаем env и пишем в БД (idempotent)
  const fromEnv = await bootstrapFromEnv(name)
  if (fromEnv) {
    cache.set(name, { value: fromEnv, fetchedAt: now })
    return fromEnv
  }
  throw new Error(`${name} не настроен (нет ни в БД, ни в env)`)
}
