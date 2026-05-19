"use server"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { requireSuperadmin } from "@/lib/rbac"
import { validateWbToken } from "@/lib/wb-token-validate"
import { decodeScopeBits } from "@/lib/wb-jwt"
import {
  invalidateWbTokenCache,
  WB_TOKEN_NAMES,
  type WbTokenName,
} from "@/lib/wb-token"

export type { WbTokenName }

export interface WbTokenListItem {
  name: WbTokenName
  displayName: string // "WB Основной" | "WB Возвраты" | "WB Чат"
  hasValue: boolean
  maskedTail: string | null // "...a4b2" или null если нет токена
  scopeBits: number[]
  issuedAt: string | null // ISO
  expiresAt: string | null // ISO
  sellerId: string | null
  organizationId: string | null
  updatedAt: string | null
  updatedBy: { id: string; name: string } | null
}

const DISPLAY_NAMES: Record<WbTokenName, string> = {
  WB_API_TOKEN: "WB Основной",
  WB_RETURNS_TOKEN: "WB Возвраты",
  WB_CHAT_TOKEN: "WB Чат",
  WB_ADS_TOKEN: "WB Реклама", // Phase 19
}

function mask(value: string): string {
  return `...${value.slice(-4)}`
}

export async function listWbTokens(): Promise<WbTokenListItem[]> {
  await requireSuperadmin()
  const records = await prisma.wbApiToken.findMany({
    include: { updatedBy: { select: { id: true, name: true } } },
  })
  const byName = new Map(records.map((r) => [r.name as WbTokenName, r]))
  return WB_TOKEN_NAMES.map((name) => {
    const r = byName.get(name)
    if (!r) {
      return {
        name,
        displayName: DISPLAY_NAMES[name],
        hasValue: false,
        maskedTail: null,
        scopeBits: [],
        issuedAt: null,
        expiresAt: null,
        sellerId: null,
        organizationId: null,
        updatedAt: null,
        updatedBy: null,
      }
    }
    return {
      name,
      displayName: DISPLAY_NAMES[name],
      hasValue: true,
      maskedTail: mask(r.value),
      scopeBits: decodeScopeBits(r.scopeBitmask),
      issuedAt: r.issuedAt?.toISOString() ?? null,
      expiresAt: r.expiresAt.toISOString(),
      sellerId: r.sellerId,
      organizationId: r.organizationId,
      updatedAt: r.updatedAt.toISOString(),
      updatedBy: r.updatedBy,
    }
  })
}

export async function replaceWbToken(input: {
  name: WbTokenName
  value: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin()
  const session = await auth()
  const userId = session?.user?.id ?? null

  const trimmed = input.value.trim()
  if (!trimmed) return { ok: false, error: "Пустое значение токена" }
  if (!WB_TOKEN_NAMES.includes(input.name)) {
    return { ok: false, error: "Неизвестное имя токена" }
  }

  const validation = await validateWbToken(input.name, trimmed)
  if (!validation.ok) return validation

  try {
    await prisma.wbApiToken.upsert({
      where: { name: input.name },
      create: {
        name: input.name,
        value: trimmed,
        scopeBitmask: validation.decoded.scopeBitmask,
        issuedAt: validation.decoded.issuedAt,
        expiresAt: validation.decoded.expiresAt,
        sellerId: validation.decoded.sellerId,
        organizationId: validation.decoded.organizationId,
        updatedById: userId,
      },
      update: {
        value: trimmed,
        scopeBitmask: validation.decoded.scopeBitmask,
        issuedAt: validation.decoded.issuedAt,
        expiresAt: validation.decoded.expiresAt,
        sellerId: validation.decoded.sellerId,
        organizationId: validation.decoded.organizationId,
        updatedById: userId,
      },
    })
    invalidateWbTokenCache(input.name)
    revalidatePath("/admin/settings")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка записи в БД" }
  }
}
