// Quick 260512-jxh: валидация WB JWT-токена при replace.
// 3 шага: decode → scope check → probe call. Все три должны пройти.
// WbTokenName импортируется из lib/wb-token.ts — единый источник истины.

import { decodeWbJwt, WB_SCOPE_LABELS, type WbJwtPayload } from "@/lib/wb-jwt"
import type { WbTokenName } from "@/lib/wb-token"

export type { WbTokenName }

export const REQUIRED_SCOPE_BITS: Record<WbTokenName, number[]> = {
  WB_API_TOKEN: [1, 2, 3, 5, 6, 7],
  WB_RETURNS_TOKEN: [11],
  WB_CHAT_TOKEN: [9],
  // Phase 19: bit 30 «Продвижение» эмпирически верифицирован в W0 —
  // WB_API_TOKEN c scopeBits=[1,2,3,5,6,7,30] успешно проходит /adv/v1/promotion/count.
  WB_ADS_TOKEN: [30],
  // 2026-05-20: второй токен для ротации /fullstats (1 req/hour лимит). Тот же scope.
  WB_ADS_TOKEN_2: [30],
}

const PROBE_ENDPOINTS: Record<WbTokenName, string> = {
  WB_API_TOKEN: "https://content-api.wildberries.ru/ping",
  WB_RETURNS_TOKEN:
    "https://returns-api.wildberries.ru/api/v1/claims?is_archive=false&limit=1",
  WB_CHAT_TOKEN:
    "https://buyer-chat-api.wildberries.ru/api/v1/seller/events?next=0",
  // Phase 19: /promotion/count — лёгкий GET, верифицирован живым в W0 smoke check.
  // При scope mismatch → 401/403 (валидация поймает).
  WB_ADS_TOKEN: "https://advert-api.wildberries.ru/adv/v1/promotion/count",
  // Тот же probe endpoint для второго токена (same scope, same семантика валидации).
  WB_ADS_TOKEN_2: "https://advert-api.wildberries.ru/adv/v1/promotion/count",
}

const PROBE_TIMEOUT_MS = 5000

export type ValidateResult =
  | { ok: true; decoded: WbJwtPayload }
  | { ok: false; error: string }

export async function validateWbToken(
  name: WbTokenName,
  value: string
): Promise<ValidateResult> {
  // Step 1: decode JWT
  let decoded: WbJwtPayload
  try {
    decoded = decodeWbJwt(value)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid JWT" }
  }

  // Step 2: scope check
  const required = REQUIRED_SCOPE_BITS[name]
  const missing = required.filter((bit) => !decoded.scopeBits.includes(bit))
  if (missing.length > 0) {
    const labels = missing.map((b) => WB_SCOPE_LABELS[b] ?? `bit ${b}`).join(", ")
    return {
      ok: false,
      error: `Не хватает scope-битов: ${labels}. Требуется: ${required
        .map((b) => WB_SCOPE_LABELS[b])
        .join(", ")}.`,
    }
  }

  // Step 3: probe call с timeout (bypass cooldown bus — свежий токен ничего не знает о состоянии IP)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const res = await fetch(PROBE_ENDPOINTS[name], {
      method: "GET",
      headers: { Authorization: value },
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (res.status === 401) {
      return { ok: false, error: "Неверный токен (WB API ответил 401)" }
    }
    if (res.status === 403) {
      return { ok: false, error: "Недостаточно прав scope (WB API ответил 403)" }
    }
    if (!res.ok) {
      return { ok: false, error: `Probe call вернул статус ${res.status}` }
    }
    return { ok: true, decoded }
  } catch (e) {
    clearTimeout(timer)
    if (e instanceof Error && e.name === "AbortError") {
      return {
        ok: false,
        error: `Probe call WB API недоступен (timeout ${PROBE_TIMEOUT_MS}ms)`,
      }
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Probe call failed",
    }
  }
}
