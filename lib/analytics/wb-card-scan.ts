// lib/analytics/wb-card-scan.ts
// Phase 30 (analytics) — скан карточек конкурентов (ANL-04).
// Фото листинга + характеристики → basket-CDN card.json (D-04, per-nmId, без rate-limit; Wave 0 §2).
// Цена/СПП/рейтинг конкурентов ПЕРВИЧНО из detail-JSON (D-04); verifyPricesBatch — только СВЕРКА,
// ОДНИМ батч-вызовом на все nmId (реюз lib/wb-api.ts fetchWbDiscounts, внутренне ≤20/запрос),
// БЕЗ per-SKU и БЕЗ Sales-API долбления (T-30-16 — иначе WB Statistics-API rate-limit / IP-бан).
// Анти-SSRF (T-30-02): nmID валидируется как положительное целое < 2^31 до построения URL.
import { fetchWbDiscounts, type StorefrontRatingsOut } from "@/lib/wb-api"
import type { Characteristic } from "./types"

/** Размер фото листинга (все размеры card.json отдают 200; c516x688 — баланс качество/вес). Wave 0 §2. */
const LISTING_PHOTO_SIZE = "c516x688"
/** Сколько фото листинга извлекать (ТЗ: первые 5). */
export const LISTING_PHOTO_LIMIT = 5
const MAX_NM_ID = 2 ** 31

/**
 * Карта vol→basket-host — ТОЛЬКО FALLBACK (когда mainPhoto недоступен).
 * Первичный источник host — `mainPhoto` из detail-JSON (Wave 0 §2: карта дрейфует — Pitfall #4).
 * Срез 2026-07-13; подтверждено: vol 8993 → basket-39. Дрейф покрывается neighbor-probe при 404.
 */
const BASKET_RANGES: Array<{ max: number; host: number }> = [
  { max: 143, host: 1 }, { max: 287, host: 2 }, { max: 431, host: 3 }, { max: 719, host: 4 },
  { max: 1007, host: 5 }, { max: 1061, host: 6 }, { max: 1115, host: 7 }, { max: 1169, host: 8 },
  { max: 1313, host: 9 }, { max: 1601, host: 10 }, { max: 1655, host: 11 }, { max: 1919, host: 12 },
  { max: 2045, host: 13 }, { max: 2189, host: 14 }, { max: 2405, host: 15 }, { max: 2621, host: 16 },
  { max: 2837, host: 17 }, { max: 3053, host: 18 }, { max: 3269, host: 19 }, { max: 3485, host: 20 },
  { max: 3701, host: 21 }, { max: 3917, host: 22 }, { max: 4133, host: 23 }, { max: 4349, host: 24 },
  { max: 4565, host: 25 }, { max: 4877, host: 26 }, { max: 5189, host: 27 }, { max: 5501, host: 28 },
  { max: 5813, host: 29 }, { max: 6125, host: 30 }, { max: 6437, host: 31 }, { max: 6749, host: 32 },
  { max: 7061, host: 33 }, { max: 7386, host: 34 }, { max: 7711, host: 35 }, { max: 8036, host: 36 },
  { max: 8361, host: 37 }, { max: 8686, host: 38 }, { max: 9011, host: 39 }, { max: 9336, host: 40 },
  { max: 9661, host: 41 }, { max: 9986, host: 42 }, { max: 10311, host: 43 }, { max: 10636, host: 44 },
]

/** Host-номер basket по vol (fallback-эвристика). За пределами карты — линейная экстраполяция. */
export function basketHostForVol(vol: number): number {
  for (const r of BASKET_RANGES) if (vol <= r.max) return r.host
  // За верхней границей карты: продолжаем шагом ~325 vol/host от последней записи.
  const last = BASKET_RANGES[BASKET_RANGES.length - 1]
  return last.host + Math.ceil((vol - last.max) / 325)
}

/** Извлекает host из mainPhoto-URL (`https://basket-39.wbbasket.ru/...` → `basket-39.wbbasket.ru`). */
function hostFromMainPhoto(mainPhoto: string | undefined): string | null {
  if (!mainPhoto) return null
  const m = mainPhoto.match(/https?:\/\/([^/]+)/i)
  return m ? m[1] : null
}

/** Извлекает номер шарда из host (`basket-39.wbbasket.ru` → 39). */
function shardOf(host: string): number | null {
  const m = host.match(/basket-(\d+)/i)
  return m ? Number(m[1]) : null
}

function assertValidNmId(nmId: number): void {
  if (!Number.isInteger(nmId) || nmId <= 0 || nmId >= MAX_NM_ID) {
    throw new Error(`недопустимый nmID: ${nmId} (ожидается положительное целое < 2^31)`)
  }
}

/**
 * URL card.json для nmID (анти-SSRF: nmID валидируется первым).
 * host: если задан явно (из mainPhoto — предпочтительно), используется он; иначе — карта vol→host (fallback).
 */
export function cardJsonUrl(nmId: number, host?: string): string {
  assertValidNmId(nmId)
  const vol = Math.floor(nmId / 100000)
  const part = Math.floor(nmId / 1000)
  const h = host ?? `basket-${basketHostForVol(vol)}.wbbasket.ru`
  return `https://${h}/vol${vol}/part${part}/${nmId}/info/ru/card.json`
}

function photoBase(nmId: number, host: string): string {
  const vol = Math.floor(nmId / 100000)
  const part = Math.floor(nmId / 1000)
  return `https://${host}/vol${vol}/part${part}/${nmId}/images/${LISTING_PHOTO_SIZE}`
}

/** Сырой card.json (только используемые поля). */
interface CardJsonRaw {
  media?: { photo_count?: number }
  selling?: { supplier_id?: number }
  options?: Array<{ name?: string; value?: string }>
  grouped_options?: Array<{ group_name?: string; options?: Array<{ name?: string; value?: string }> }>
}

type FetchImpl = typeof fetch

/**
 * Порядок host-кандидатов: заявленный (из mainPhoto/карты) → соседи ±1, ±2 (404-fallback, T-30-10).
 */
function hostCandidates(nmId: number, mainPhoto?: string): string[] {
  const primary = hostFromMainPhoto(mainPhoto) ?? `basket-${basketHostForVol(Math.floor(nmId / 100000))}.wbbasket.ru`
  const n = shardOf(primary)
  if (n === null) return [primary]
  const order = [n, n + 1, n - 1, n + 2, n - 2].filter((x) => x >= 1)
  return [...new Set(order)].map((x) => `basket-${x}.wbbasket.ru`)
}

/**
 * Скан медиа+характеристик карточки конкурента (ANL-04).
 * mainPhoto (из detail-JSON) даёт authoritative host (Wave 0); при 404 пробуются соседние шарды.
 * Возвращает первые 5 фото листинга + характеристики. Полный провал → throw (коллектор пометит incomplete).
 */
export async function scanCardMedia(
  nmId: number,
  mainPhoto?: string,
  fetchImpl: FetchImpl = fetch,
): Promise<{ listingPhotos: string[]; characteristics: Characteristic[]; seller: string }> {
  assertValidNmId(nmId)
  const candidates = hostCandidates(nmId, mainPhoto)
  const tried: string[] = []

  for (const host of candidates) {
    tried.push(host)
    let res: Response
    try {
      res = await fetchImpl(cardJsonUrl(nmId, host))
    } catch {
      continue // сетевая ошибка на этом host — пробуем следующий
    }
    if (res.status === 404) continue
    if (!res.ok) continue
    const card = (await res.json()) as CardJsonRaw

    const photoCount = card.media?.photo_count ?? 0
    const count = Math.min(LISTING_PHOTO_LIMIT, Math.max(photoCount, 0))
    const base = photoBase(nmId, host)
    const listingPhotos = Array.from({ length: count }, (_, i) => `${base}/${i + 1}.webp`)

    // Характеристики: плоский options; fallback — flatten grouped_options.
    let rawOpts = card.options ?? []
    if (rawOpts.length === 0 && Array.isArray(card.grouped_options)) {
      rawOpts = card.grouped_options.flatMap((g) => g.options ?? [])
    }
    const characteristics: Characteristic[] = rawOpts
      .filter((o) => o.name && o.value != null)
      .map((o) => ({ name: String(o.name), value: String(o.value) }))

    // Продавец — supplier_id (card.json selling; Wave 0 §2). Числовой ID; человекочит. имя — отдельный резолв (отложено).
    const seller = card.selling?.supplier_id != null ? String(card.selling.supplier_id) : ""

    return { listingPhotos, characteristics, seller }
  }

  throw new Error(`card.json недоступен для nmID ${nmId} (проверены хосты: ${tried.join(", ")})`)
}

/** Результат сверки цены/рейтинга (best-effort; первичный источник — detail-JSON, D-04). */
export interface PriceVerification {
  sppDiscount?: number
  rating?: number
  feedbacks?: number
}

/**
 * СВЕРКА цены/рейтинга по card.wb.ru — ОДИН батч-вызов на ВСЕ nmId (реюз fetchWbDiscounts,
 * внутренне ≤20/запрос → для 30 = 2 curl-батча). НЕ per-SKU (T-30-16). При сбое v4 —
 * best-effort пустой/частичный результат БЕЗ per-SKU ретраев и БЕЗ Sales-API долбления.
 * Цена/рейтинг конкурентов первичны из detail-JSON (D-04) — этот вызов лишь сверяет.
 */
export async function verifyPricesBatch(nmIds: number[]): Promise<Map<number, PriceVerification>> {
  const out = new Map<number, PriceVerification>()
  if (nmIds.length === 0) return out
  try {
    const storefront: StorefrontRatingsOut = { ratings: new Map(), feedbacks: new Map() }
    const sppMap = await fetchWbDiscounts(nmIds, undefined, storefront) // единственный вызов на весь массив
    for (const nm of nmIds) {
      const v: PriceVerification = {}
      if (sppMap.has(nm)) v.sppDiscount = sppMap.get(nm)
      if (storefront.ratings.has(nm)) v.rating = storefront.ratings.get(nm)
      if (storefront.feedbacks.has(nm)) v.feedbacks = storefront.feedbacks.get(nm)
      if (Object.keys(v).length > 0) out.set(nm, v)
    }
  } catch {
    // best-effort — цена/рейтинг первичны из detail-JSON; без per-SKU ретраев / Sales-API долбления.
  }
  return out
}
