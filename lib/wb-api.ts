// lib/wb-api.ts
// Работа с Wildberries Content API и Prices API

const CONTENT_API = "https://content-api.wildberries.ru"
const PRICES_API = "https://discounts-prices-api.wildberries.ru"

function getToken(): string {
  const token = process.env.WB_API_TOKEN
  if (!token) throw new Error("WB_API_TOKEN не настроен")
  return token
}

// ── Типы ответа Content API ─────────────────────────────────────

interface WbPhotoRaw {
  big: string
  c246x328?: string
  c516x688?: string
  hq?: string
  square?: string
  tm?: string
}

export interface WbCardRaw {
  nmID: number
  vendorCode: string
  brand: string
  title: string
  description: string
  subjectName: string
  subjectID: number
  video?: string
  tags?: Array<{ id: number; name: string }>
  photos: WbPhotoRaw[]
  sizes: Array<{
    skus: string[]
    price?: number
  }>
  mediaFiles?: string[]
  dimensions?: {
    width: number
    height: number
    length: number
    weightBrutto?: number
    isValid?: boolean
  }
}

interface CardsListResponse {
  cards: WbCardRaw[]
  cursor: {
    updatedAt: string
    nmID: number
    total: number
  }
}

// ── Получение всех карточек через Content API ────────────────────

export async function fetchAllCards(): Promise<WbCardRaw[]> {
  const token = getToken()
  const allCards: WbCardRaw[] = []

  let cursorUpdatedAt: string | undefined = undefined
  let cursorNmID = 0
  const limit = 100

  while (true) {
    const cursorObj: Record<string, unknown> = { limit, nmID: cursorNmID }
    if (cursorUpdatedAt) {
      cursorObj.updatedAt = cursorUpdatedAt
    }

    const body = {
      settings: {
        cursor: cursorObj,
        filter: { withPhoto: -1 },
      },
    }

    const res = await fetch(`${CONTENT_API}/content/v2/get/cards/list`, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`WB Content API ошибка ${res.status}: ${text}`)
    }

    const data: CardsListResponse = await res.json()

    if (!data.cards || data.cards.length === 0) break

    allCards.push(...data.cards)

    if (data.cursor.total < limit) break
    cursorUpdatedAt = data.cursor.updatedAt
    cursorNmID = data.cursor.nmID
  }

  return allCards
}

// ── Получение цен через Discounts & Prices API ──────────────────

interface PriceItem {
  nmID: number
  discount: number
  clubDiscount: number
  sizes: Array<{
    price: number
    discountedPrice: number
    clubDiscountedPrice: number
  }>
}

interface PricesResponse {
  data: {
    listGoods: PriceItem[]
  }
  error: boolean
}

export interface PriceData {
  priceBeforeDiscount: number  // цена до скидки продавца, руб
  discountedPrice: number      // цена со скидкой продавца, руб
  sellerDiscount: number       // скидка продавца, %
  clubDiscount: number         // скидка WB клуба, %
}

export async function fetchAllPrices(): Promise<Map<number, PriceData>> {
  const token = getToken()
  const priceMap = new Map<number, PriceData>()

  let offset = 0
  const limit = 1000

  while (true) {
    const res = await fetch(
      `${PRICES_API}/api/v2/list/goods/filter?limit=${limit}&offset=${offset}`,
      {
        headers: { Authorization: token },
      }
    )

    if (!res.ok) {
      console.error(`Prices API ошибка ${res.status}`)
      break
    }

    const data: PricesResponse = await res.json()
    const items = data.data?.listGoods ?? []

    if (items.length === 0) break

    for (const item of items) {
      const size = item.sizes?.[0]
      if (size) {
        priceMap.set(item.nmID, {
          priceBeforeDiscount: Math.round(size.price),
          discountedPrice: Math.round(size.discountedPrice),
          sellerDiscount: item.discount ?? 0,
          clubDiscount: item.clubDiscount ?? 0,
        })
      }
    }

    offset += items.length
    if (items.length < limit) break
  }

  return priceMap
}

// ── Получение остатков через Statistics API ──────────────────────

export async function fetchStocks(): Promise<Map<number, number>> {
  const token = getToken()
  const stockMap = new Map<number, number>()

  try {
    const res = await fetch(
      "https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=2020-01-01",
      { headers: { Authorization: token } }
    )

    if (!res.ok) {
      console.error(`Statistics API stocks ошибка ${res.status}`)
      return stockMap
    }

    const items: Array<{ nmId: number; quantity: number }> = await res.json()

    for (const item of items) {
      const current = stockMap.get(item.nmId) ?? 0
      stockMap.set(item.nmId, current + item.quantity)
    }
  } catch (e) {
    console.error("fetchStocks error:", e)
  }

  return stockMap
}

// ── Получение процента выкупа через Analytics API ───────────────

export async function fetchBuyoutPercent(nmIds: number[]): Promise<Map<number, number>> {
  const token = getToken()
  const buyoutMap = new Map<number, number>()

  try {
    // Период: последний месяц
    const endDate = new Date().toISOString().split("T")[0]
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

    const id = crypto.randomUUID()

    // 1. Создаём задание на отчёт
    const createRes = await fetch(
      "https://seller-analytics-api.wildberries.ru/api/v2/nm-report/downloads",
      {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          reportType: "DETAIL_HISTORY_REPORT",
          params: { nmIDs: nmIds, startDate, endDate },
        }),
      }
    )

    if (!createRes.ok) {
      console.error(`Analytics create report ошибка ${createRes.status}`)
      return buyoutMap
    }

    // 2. Ждём готовности (до 30 сек)
    let ready = false
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 3000))
      const statusRes = await fetch(
        `https://seller-analytics-api.wildberries.ru/api/v2/nm-report/downloads?downloadId=${id}`,
        { headers: { Authorization: token } }
      )
      if (!statusRes.ok) continue
      const statusData = await statusRes.json()
      const report = (statusData.data ?? []).find((r: { id: string }) => r.id === id)
      if (report?.status === "SUCCESS") {
        ready = true
        break
      }
    }

    if (!ready) {
      console.error("Analytics report не готов за 30 сек")
      return buyoutMap
    }

    // 3. Скачиваем ZIP → CSV
    const fileRes = await fetch(
      `https://seller-analytics-api.wildberries.ru/api/v2/nm-report/downloads/file/${id}`,
      { headers: { Authorization: token } }
    )

    if (!fileRes.ok) {
      console.error(`Analytics download ошибка ${fileRes.status}`)
      return buyoutMap
    }

    // Распаковываем ZIP (в Node.js) — простой подход через текст
    // ZIP с одним CSV файлом — читаем как arrayBuffer
    const zipBuffer = await fileRes.arrayBuffer()
    const { unzipSync } = await import("node:zlib")
    // Пробуем прочитать как deflate stream из ZIP
    // Простой парсер: находим CSV данные внутри ZIP
    const bytes = new Uint8Array(zipBuffer)
    // Ищем начало CSV после заголовка ZIP (после первого \n после "buyoutPercent")
    const text = new TextDecoder().decode(bytes)
    const csvStart = text.indexOf("nmID,dt,")
    if (csvStart === -1) return buyoutMap

    const csvText = text.slice(csvStart).split("\x00")[0] // отрезаем мусор после CSV

    const lines = csvText.trim().split("\n")
    if (lines.length < 2) return buyoutMap

    // Суммируем выкупы и заказы по nmId за весь период
    const totals = new Map<number, { buyouts: number; orders: number }>()
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",")
      const nmId = parseInt(cols[0])
      const orders = parseInt(cols[4]) || 0
      const buyouts = parseInt(cols[6]) || 0
      if (!nmId) continue
      const cur = totals.get(nmId) ?? { buyouts: 0, orders: 0 }
      totals.set(nmId, { buyouts: cur.buyouts + buyouts, orders: cur.orders + orders })
    }

    for (const [nmId, { buyouts, orders }] of totals) {
      if (orders > 0) {
        buyoutMap.set(nmId, Math.round((buyouts / orders) * 100))
      }
    }
  } catch (e) {
    console.error("fetchBuyoutPercent error:", e)
  }

  return buyoutMap
}

// ── Получение скидки WB (СПП) — curl + Sales API fallback ───────
//
// WB блокирует Node.js fetch по TLS fingerprint (403), но curl проходит.
// 1. v4 API через execSync(curl) — актуальные данные реального времени
// 2. Sales API fallback — ретроспектива для пропущенных

import { execSync } from "node:child_process"

export async function fetchWbDiscounts(
  nmIds: number[],
  sellerPriceMap?: Map<number, PriceData>
): Promise<Map<number, number>> {
  const token = getToken()
  const discountMap = new Map<number, number>()

  // ── Шаг 1: v4 API через curl (реальное время) ─────────────────
  let v4Failed = false
  let v4Count = 0

  for (let i = 0; i < nmIds.length; i += 20) {
    if (v4Failed) break

    const batch = nmIds.slice(i, i + 20)
    const nmStr = batch.join(";")

    try {
      const result = execSync(
        `curl -s -H "Accept: application/json" -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" "https://card.wb.ru/cards/v4/detail?appType=1&curr=rub&dest=-1257786&nm=${nmStr}"`,
        { timeout: 15000 }
      ).toString()

      if (result.includes("403 Forbidden") || result.includes("<html>")) {
        console.warn(`[СПП] v4 curl 403 на батче ${i / 20 + 1} — fallback`)
        v4Failed = true
        break
      }

      const data = JSON.parse(result)
      const products = data?.products ?? []

      for (const product of products) {
        const nmId: number = product.id
        if (!nmId) continue

        const sizes = product.sizes ?? []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sizeWithPrice = sizes.find((s: any) => s.price?.product)
        if (!sizeWithPrice?.price?.product) continue

        const buyerPriceRub = sizeWithPrice.price.product / 100
        const sellerPrice = sellerPriceMap?.get(nmId)?.discountedPrice ?? 0
        if (sellerPrice > 0 && buyerPriceRub > 0) {
          // Точность до 0.1% (раньше Math.round терял до 0.5%).
          const spp =
            Math.round((1 - buyerPriceRub / sellerPrice) * 1000) / 10
          if (spp > 0 && spp < 100) {
            discountMap.set(nmId, spp)
            v4Count++
          }
        }
      }
    } catch {
      v4Failed = true
      break
    }

    if (i + 20 < nmIds.length) {
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  // ── Шаг 2: fallback через Sales API (ретроспектива) ────────────
  const missingNmIds = nmIds.filter((nm) => !discountMap.has(nm))

  if (missingNmIds.length > 0) {
    try {
      const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
      const res = await fetch(
        `https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=${dateFrom}&flag=0`,
        { headers: { Authorization: token } }
      )

      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          const missingSet = new Set(missingNmIds)
          for (const item of data) {
            if (missingSet.has(item.nmId) && item.spp != null && item.spp > 0) {
              // Sales API может возвращать float — округлим до 0.1% для консистентности.
              discountMap.set(
                item.nmId,
                Math.round(Number(item.spp) * 10) / 10,
              )
            }
          }
        }
      }
    } catch (e) {
      console.error("Sales API fallback error:", e)
    }
  }

  console.log(`[СПП] v4(curl): ${v4Count} | fallback: ${v4Failed ? "да" : "нет"} | итого: ${discountMap.size}/${nmIds.length}`)

  return discountMap
}

// ── Получение стандартных комиссий через Tariffs API ─────────────

export async function fetchStandardCommissions(): Promise<Map<number, { fbw: number; fbs: number }>> {
  const token = getToken()
  const commMap = new Map<number, { fbw: number; fbs: number }>()

  try {
    const res = await fetch(
      "https://common-api.wildberries.ru/api/v1/tariffs/commission?locale=ru",
      { headers: { Authorization: token } }
    )

    if (!res.ok) {
      console.error(`Tariffs API ошибка ${res.status}`)
      return commMap
    }

    const data = await res.json()
    const report = data?.report ?? []

    for (const item of report) {
      // paidStorageKgvp = FBW, kgvpSupplier = FBS
      commMap.set(item.subjectID, {
        fbw: item.paidStorageKgvp ?? 0,
        fbs: item.kgvpSupplier ?? 0,
      })
    }
  } catch (e) {
    console.error("fetchStandardCommissions error:", e)
  }

  return commMap
}

// ── Преобразование карточки API → данные для БД ─────────────────

export function parseCard(card: WbCardRaw) {
  const allBarcodes: string[] = []
  for (const size of card.sizes ?? []) {
    for (const sku of size.skus ?? []) {
      if (sku && !allBarcodes.includes(sku)) {
        allBarcodes.push(sku)
      }
    }
  }

  const photos = (card.photos ?? []).map((p) => p.big)
  const photoUrl = photos[0] ?? null
  const hasVideo = !!card.video
  const tags = (card.tags ?? []).map((t) => t.name)

  const dims = card.dimensions
  const weightKg = dims?.weightBrutto ?? null
  const heightCm = dims?.height ?? null
  const widthCm = dims?.width ?? null
  const depthCm = dims?.length ?? null

  return {
    nmId: card.nmID,
    article: card.vendorCode,
    name: card.title || card.vendorCode,
    brand: card.brand || null,
    category: card.subjectName || null,
    photoUrl,
    photos,
    hasVideo,
    barcode: allBarcodes[0] ?? null,
    barcodes: allBarcodes,
    weightKg,
    heightCm,
    widthCm,
    depthCm,
    tags,
  }
}

// ──────────────────────────────────────────────────────────────────
// Phase 7: WB Promotions Calendar API + Statistics Sales API
// ──────────────────────────────────────────────────────────────────
//
// Endpoints для синхронизации акций WB (D-04, D-05) и средней
// скорости продаж за 7 дней (D-09).
//
// Rate limit Promotions Calendar: 10 req / 6 sec.
//   → пауза 600ms между pagination/batch запросами
//   → sleep(6000) + retry(1) при 429
//
// Base URL верифицирован smoke test'ом в Wave 0
// (см. .planning/phases/07-prices-wb/07-WAVE0-NOTES.md секция 3):
// хост `dp-calendar-api.wildberries.ru` (origin `s2sauth-calendar`).

/** Базовый URL WB Promotions Calendar API. Верифицирован в Wave 0. */
const PROMO_API = "https://dp-calendar-api.wildberries.ru"

/** Пауза между запросами — 10 req/6sec даёт безопасный интервал 600ms. */
const PROMO_RATE_DELAY_MS = 600

/** Backoff при 429 — полный rate window + небольшой буфер. */
const PROMO_429_BACKOFF_MS = 6000

/** Raw структура акции из WB Promotions API (для upsert в WbPromotion). */
export interface WbPromotionRaw {
  id: number
  name: string
  description?: string
  advantages?: string[]
  startDateTime: string // RFC3339
  endDateTime: string
  type: string // "auto" | "regular" | other
}

/** Raw детали акции (advantages, description, ranging). */
export interface WbPromotionDetailsRaw {
  id: number
  name?: string
  description?: string
  advantages?: string[]
  ranging?: unknown[]
}

/** Raw номенклатура в акции (только для regular-акций). */
export interface WbPromotionNomenclatureRaw {
  nmID: number
  price?: number
  planPrice?: number
  discount?: number
  planDiscount?: number
  inAction?: boolean
}

/** Helper: пауза в ms (для rate limiting). */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Получить список всех акций WB в окне [startDate, endDate].
 *
 *  Pagination через `limit=100` + `offset`. Между запросами пауза
 *  `PROMO_RATE_DELAY_MS`. При 429 — один retry после `sleep(PROMO_429_BACKOFF_MS)`.
 *
 *  Используется в плане 07-04 для синхронизации акций (D-04).
 */
export async function fetchAllPromotions(
  startDate: Date,
  endDate: Date,
): Promise<WbPromotionRaw[]> {
  const token = getToken()
  const all: WbPromotionRaw[] = []
  let offset = 0
  const limit = 100
  let retried429 = false

  while (true) {
    const url =
      `${PROMO_API}/api/v1/calendar/promotions` +
      `?startDateTime=${encodeURIComponent(startDate.toISOString())}` +
      `&endDateTime=${encodeURIComponent(endDate.toISOString())}` +
      `&allPromo=true&limit=${limit}&offset=${offset}`

    const res = await fetch(url, {
      headers: { Authorization: token },
    })

    if (res.status === 429) {
      if (retried429) {
        throw new Error("WB Promotions API rate limit: 429 после retry")
      }
      retried429 = true
      await sleep(PROMO_429_BACKOFF_MS)
      continue
    }
    retried429 = false

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`WB Promotions API ${res.status}: ${body}`)
    }

    const data = await res.json()
    const items = (data?.data?.promotions ?? data?.promotions ?? []) as WbPromotionRaw[]

    if (items.length === 0) break
    all.push(...items)

    // Если пришла неполная страница — дальше идти нет смысла
    if (items.length < limit) break

    offset += items.length
    await sleep(PROMO_RATE_DELAY_MS)
  }

  return all
}

/** Получить детали акций батчами по 10 ID.
 *
 *  WB API принимает до 10 promotionIDs за один запрос через query-параметр.
 *  Между батчами пауза `PROMO_RATE_DELAY_MS`, при 429 — один retry.
 *
 *  Возвращает массив деталей (порядок не гарантирован — caller склеивает по `id`).
 */
export async function fetchPromotionDetails(
  ids: number[],
): Promise<WbPromotionDetailsRaw[]> {
  if (ids.length === 0) return []
  const token = getToken()
  const details: WbPromotionDetailsRaw[] = []

  for (let i = 0; i < ids.length; i += 10) {
    const batch = ids.slice(i, i + 10)
    // WB API требует повторяющиеся параметры: ?promotionIDs=1&promotionIDs=2
    // (comma-separated формат возвращает 400 "Invalid query params")
    const qs = batch.map((id) => `promotionIDs=${id}`).join("&")
    const url = `${PROMO_API}/api/v1/calendar/promotions/details?${qs}`

    let attempt = 0
    while (true) {
      const res = await fetch(url, {
        headers: { Authorization: token },
      })

      if (res.status === 429) {
        if (attempt >= 1) {
          throw new Error("WB Promotions details: 429 после retry")
        }
        attempt++
        await sleep(PROMO_429_BACKOFF_MS)
        continue
      }

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`WB Promotions details ${res.status}: ${body}`)
      }

      const data = await res.json()
      const items = (data?.data?.promotions ??
        data?.promotions ??
        []) as WbPromotionDetailsRaw[]
      details.push(...items)
      break
    }

    if (i + 10 < ids.length) {
      await sleep(PROMO_RATE_DELAY_MS)
    }
  }

  return details
}

/** Получить номенклатуры одной regular-акции.
 *
 *  Для `type="auto"` WB возвращает 422 — silent return `[]` (D-06: auto обрабатывается через Excel).
 *  При 429 — один retry после `sleep(PROMO_429_BACKOFF_MS)`.
 */
export async function fetchPromotionNomenclatures(
  promotionId: number,
): Promise<WbPromotionNomenclatureRaw[]> {
  const token = getToken()
  // WB API требует inAction=true (false возвращает 400 Invalid query params)
  const url =
    `${PROMO_API}/api/v1/calendar/promotions/nomenclatures` +
    `?promotionID=${promotionId}&inAction=true&limit=1000`

  let attempt = 0
  while (true) {
    const res = await fetch(url, { headers: { Authorization: token } })

    // Auto-акция — silent return (D-06: обрабатывается через Excel)
    if (res.status === 422) {
      return []
    }

    if (res.status === 429) {
      if (attempt >= 1) {
        throw new Error(`WB nomenclatures ${promotionId}: 429 после retry`)
      }
      attempt++
      await sleep(PROMO_429_BACKOFF_MS)
      continue
    }

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`WB nomenclatures ${promotionId} ${res.status}: ${body}`)
    }

    const data = await res.json()
    const items = (data?.data?.nomenclatures ??
      data?.nomenclatures ??
      []) as WbPromotionNomenclatureRaw[]
    return items
  }
}

/** Получить среднюю скорость продаж за последние 7 дней.
 *
 *  Возвращает `Map<nmId, avgPerDay>`, где `avgPerDay = count(sales) / 7`.
 *
 *  Источник: WB Statistics Sales API `/api/v1/supplier/sales?dateFrom={7d_ago}`.
 *  При 429 ждём 60 секунд (Statistics API даёт ~1 req/min) и делаем рекурсивный retry.
 *  При любой другой ошибке — degraded mode: возвращаем пустой Map, поле в БД останется null.
 *
 *  D-09: записывается в `WbCard.avgSalesSpeed7d` при полной синхронизации.
 */
export async function fetchAvgSalesSpeed7d(
  nmIds: number[],
): Promise<Map<number, number>> {
  const token = getToken()
  const result = new Map<number, number>()
  if (nmIds.length === 0) return result

  const dateFrom = new Date()
  dateFrom.setDate(dateFrom.getDate() - 7)
  const dateFromIso = dateFrom.toISOString()

  const url =
    `https://statistics-api.wildberries.ru/api/v1/supplier/sales` +
    `?dateFrom=${encodeURIComponent(dateFromIso)}&flag=0`

  const res = await fetch(url, { headers: { Authorization: token } })

  if (res.status === 429) {
    // Statistics API даёт ~1 req/min → ждём минуту и делаем один retry
    await sleep(60_000)
    return fetchAvgSalesSpeed7d(nmIds)
  }

  if (!res.ok) {
    console.error(`WB Sales API (avgSalesSpeed7d) ${res.status}`)
    return result
  }

  const sales = (await res.json()) as Array<{ nmId?: number; nm_id?: number }>
  if (!Array.isArray(sales)) return result

  // Подсчитать количество продаж per nmId
  const counts = new Map<number, number>()
  for (const s of sales) {
    const nm = s.nmId ?? s.nm_id
    if (nm == null) continue
    counts.set(nm, (counts.get(nm) ?? 0) + 1)
  }

  // Вернуть только запрошенные nmId
  const requested = new Set(nmIds)
  for (const [nmId, count] of counts) {
    if (requested.has(nmId)) {
      result.set(nmId, count / 7)
    }
  }

  return result
}
