// Phase 19: WB Advert API client. W0 verified 2026-05-19.
// Endpoints: advert-api.wildberries.ru/adv/{v1,v3}/...
//   - /adv/v1/promotion/count (GET)         — flatten двухуровневой структуры
//   - /adv/v3/fullstats (GET с query params) — НЕ v2 POST!
//   - /adv/v1/balance (GET)                 — нет поля bonus
// Rate limits: /promotion/* 5 req/sec, /fullstats 1 req/sec batch ≤100,
//   PLUS per-seller global limiter (общий для всех endpoints/токенов одного sid).
// Cooldown bus: bucket 'advert' (изолирован от WB_API_TOKEN scope).
// Token: WB_ADS_TOKEN scope bit 30 (W0 verified).

import { prisma } from "@/lib/prisma"
import { getWbToken, type WbTokenName } from "@/lib/wb-token"
import {
  getWbCooldownSecondsRemaining,
  setWbCooldownUntil,
} from "@/lib/wb-cooldown"
import { WbRateLimitError } from "@/lib/wb-api"

// ── Token rotation для /fullstats ──────────────────────────────────
// WB Advert API `/adv/v3/fullstats` имеет лимит 1 запрос в ЧАС.
// Гипотеза (подтверждается эмпирически): hourly bucket per-token, не per-seller.
// 2 токена → 2 req/hour эффективно для backfill paused кампаний.
// Per-run rotation: один runAdvSync использует ОДИН токен (cached); следующий
// runAdvSync — другой. Index хранится в AppSetting wbAdvTokenRotateIndex.

const ROTATING_ADV_TOKENS: WbTokenName[] = ["WB_ADS_TOKEN", "WB_ADS_TOKEN_2"]
let _runTokenCache: { token: string; name: WbTokenName } | null = null

/** Сброс кэша токена перед каждым runAdvSync — гарантирует что внутри одного run
 *  все callAdvert используют ОДИН токен, а следующий run возьмёт другой. */
export function resetAdvTokenForRun(): void {
  _runTokenCache = null
}

/** Возвращает текущий токен для run. При первом вызове в run — выбирает
 *  следующий по rotation, кэширует. Последующие вызовы возвращают кэш. */
async function getAdvTokenForCurrentRun(): Promise<string> {
  if (_runTokenCache !== null) return _runTokenCache.token
  const setting = await prisma.appSetting.findUnique({
    where: { key: "wbAdvTokenRotateIndex" },
  })
  const currentIdx = parseInt(setting?.value ?? "0", 10) % ROTATING_ADV_TOKENS.length
  const safeIdx = Number.isFinite(currentIdx) && currentIdx >= 0
    ? currentIdx
    : 0
  const nextIdx = (safeIdx + 1) % ROTATING_ADV_TOKENS.length
  await prisma.appSetting.upsert({
    where: { key: "wbAdvTokenRotateIndex" },
    create: { key: "wbAdvTokenRotateIndex", value: String(nextIdx) },
    update: { value: String(nextIdx) },
  })
  const name = ROTATING_ADV_TOKENS[safeIdx]
  // Если WB_ADS_TOKEN_2 ещё не настроен — graceful fallback на основной токен.
  let token: string
  try {
    token = await getWbToken(name)
  } catch (e) {
    if (name === "WB_ADS_TOKEN_2") {
      console.warn(`[wb-adv-api] ${name} not configured, falling back to WB_ADS_TOKEN`)
      token = await getWbToken("WB_ADS_TOKEN")
      _runTokenCache = { token, name: "WB_ADS_TOKEN" }
      return token
    }
    throw e
  }
  console.log(`[wb-adv-api] rotated to ${name} for this run`)
  _runTokenCache = { token, name }
  return token
}

const BASE_URL = "https://advert-api.wildberries.ru"
// W0 (2026-05-19 prod): WB вернул 400 "number of advert cannot be more than 50"
// на батч 100. Реальный лимит — 50 (несмотря на доки которые говорят 100).
const FULLSTATS_BATCH_SIZE = 50
const PROMOTION_RATE_SLEEP_MS = 200      // 5 req/sec
const FULLSTATS_RATE_SLEEP_MS = 1100     // 1 req/sec + 100ms буфер от per-seller limiter

// ── Types ─────────────────────────────────────────────────────────

export interface WbAdvertCount {
  advertId: number
  type: number
  status: number
  changeTime: string             // ISO с timezone offset, например "2026-05-19T13:18:01+03:00"
}

export interface WbAdvertStat {
  advertId: number
  date: string                   // YYYY-MM-DD (обрезаем ISO из API)
  nmId: number
  name: string | null            // название товара из API (для UI без JOIN'а с WbCard)
  appType: number
  views: number
  clicks: number
  ctr: number | null
  cpc: number | null
  sum: number
  atbs: number
  orders: number
  cr: number | null
  shks: number
  sumPrice: number
  canceled: number               // W0: technical cancels (товар недоступен/доставка failed). НЕ buyer refusals.
}

export interface WbAdvertBalance {
  balance: number
  net: number
  currency: string               // обычно "RUB"
}

// ── Helpers ───────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

/** Прочитать retry-after из 429 response. WB Advert API использует
 *  кастомный заголовок `x-ratelimit-retry` (см. memory/project_wb_advert_api.md),
 *  с fallback на стандартный Retry-After. */
function parseRetryAfter(res: Response): number {
  const wb = res.headers.get("x-ratelimit-retry")
  if (wb) return parseInt(wb, 10) || 60
  const std = res.headers.get("Retry-After")
  if (std) return parseInt(std, 10) || 60
  return 60
}

async function callAdvert(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const cooldown = await getWbCooldownSecondsRemaining("advert")
  if (cooldown > 0) {
    throw new WbRateLimitError(`Advert API ${url}`, cooldown)
  }
  const token = await getAdvTokenForCurrentRun()
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: token,
      ...(init.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init.headers,
    },
  })
  if (res.status === 429) {
    const retryAfter = parseRetryAfter(res)
    await setWbCooldownUntil("advert", retryAfter)
    throw new WbRateLimitError(`Advert API ${url}`, retryAfter)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Advert API ${url} → HTTP ${res.status}: ${text}`)
  }
  return res
}

// ── Public API ────────────────────────────────────────────────────

/** GET /adv/v1/promotion/count → плоский список (advertId, type, status, changeTime).
 *  W0: response — двухуровневая структура {adverts: [{type, status, count, advert_list}]}. */
export async function fetchPromotionCount(): Promise<WbAdvertCount[]> {
  await sleep(PROMOTION_RATE_SLEEP_MS)
  const res = await callAdvert(`${BASE_URL}/adv/v1/promotion/count`)
  const data = await res.json() as {
    adverts: Array<{
      type: number
      status: number
      count: number
      advert_list: Array<{ advertId: number; changeTime: string }>
    }>
  }
  const out: WbAdvertCount[] = []
  for (const group of data.adverts ?? []) {
    for (const item of group.advert_list ?? []) {
      out.push({
        advertId: item.advertId,
        type: group.type,
        status: group.status,
        changeTime: item.changeTime,
      })
    }
  }
  return out
}

/** GET /adv/v3/fullstats?ids=...&beginDate=...&endDate=... — батчами по ≤100 advertId.
 *  W0: GET с query params (НЕ POST с body!). Response может быть null если по IDs/period нет данных.
 *  4-level nesting: campaign → day → app → nm (плюрал!) */
export async function fetchFullStats(
  advertIds: number[],
  range: { beginDate: string; endDate: string }, // 'YYYY-MM-DD'
): Promise<WbAdvertStat[]> {
  const all: WbAdvertStat[] = []
  for (let i = 0; i < advertIds.length; i += FULLSTATS_BATCH_SIZE) {
    if (i > 0) await sleep(FULLSTATS_RATE_SLEEP_MS)
    const batch = advertIds.slice(i, i + FULLSTATS_BATCH_SIZE)
    const url = new URL(`${BASE_URL}/adv/v3/fullstats`)
    url.searchParams.set("ids", batch.join(","))
    url.searchParams.set("beginDate", range.beginDate)
    url.searchParams.set("endDate", range.endDate)
    const res = await callAdvert(url.toString())
    const raw = await res.json() as
      | Array<{
          advertId: number
          days?: Array<{
            date: string  // например "2026-04-19T00:00:00Z"
            apps?: Array<{
              appType: number
              nms?: Array<{
                nmId: number
                name?: string
                views: number
                clicks: number
                ctr?: number
                cpc?: number
                sum: number
                atbs: number
                orders: number
                cr?: number
                shks: number
                sum_price: number
                canceled?: number
              }>
            }>
          }>
        }>
      | null
    if (raw === null) continue   // W0: null = нет данных для этого батча/периода
    for (const camp of raw) {
      for (const day of camp.days ?? []) {
        const dateStr = day.date.slice(0, 10)
        for (const app of day.apps ?? []) {
          for (const nm of app.nms ?? []) {
            all.push({
              advertId: camp.advertId,
              date: dateStr,
              nmId: nm.nmId,
              name: nm.name ?? null,
              appType: app.appType,
              views: nm.views,
              clicks: nm.clicks,
              ctr: nm.ctr ?? null,
              cpc: nm.cpc ?? null,
              sum: nm.sum,
              atbs: nm.atbs,
              orders: nm.orders,
              cr: nm.cr ?? null,
              shks: nm.shks,
              sumPrice: nm.sum_price,
              canceled: nm.canceled ?? 0,
            })
          }
        }
      }
    }
  }
  return all
}

/** GET /adv/v1/balance → текущий баланс рекламного счёта.
 *  W0: response — {balance: int, net: int, currency: string}. Поля bonus НЕТ. */
export async function fetchBalance(): Promise<WbAdvertBalance> {
  await sleep(PROMOTION_RATE_SLEEP_MS)
  const res = await callAdvert(`${BASE_URL}/adv/v1/balance`)
  const data = await res.json() as {
    balance: number
    net: number
    currency: string
  }
  return {
    balance: data.balance,
    net: data.net,
    currency: data.currency ?? "RUB",
  }
}
