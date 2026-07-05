// lib/wb-api.ts
// Работа с Wildberries Content API и Prices API

import { prisma } from "@/lib/prisma"
import {
  getWbCooldownSecondsRemaining,
  setWbCooldownUntil,
  type WbCooldownBucket,
} from "@/lib/wb-cooldown"
import { getWbToken } from "@/lib/wb-token"

const CONTENT_API = "https://content-api.wildberries.ru"
const PRICES_API = "https://discounts-prices-api.wildberries.ru"

// 2026-05-11: WB Analytics API лимит 3 reports/день. Жёсткий sky-cap чтобы избежать
// 429 после исчерпания. Счётчик хранится в AppSetting('wbAnalyticsDailyCounter')
// как JSON {date: "YYYY-MM-DD", count: N}. При смене даты обнуляется.
const ANALYTICS_DAILY_MAX = 3

async function checkAndIncrementAnalyticsCounter(): Promise<{
  canRun: boolean
  current: number
  max: number
}> {
  const today = new Date().toISOString().split("T")[0]
  const setting = await prisma.appSetting.findUnique({
    where: { key: "wbAnalyticsDailyCounter" },
  })
  let data: { date: string; count: number } = { date: today, count: 0 }
  if (setting) {
    try {
      const parsed = JSON.parse(setting.value)
      if (parsed.date === today && typeof parsed.count === "number") {
        data = parsed
      }
    } catch {}
  }
  if (data.count >= ANALYTICS_DAILY_MAX) {
    return { canRun: false, current: data.count, max: ANALYTICS_DAILY_MAX }
  }
  data.count++
  await prisma.appSetting.upsert({
    where: { key: "wbAnalyticsDailyCounter" },
    create: {
      key: "wbAnalyticsDailyCounter",
      value: JSON.stringify(data),
    },
    update: { value: JSON.stringify(data) },
  })
  return { canRun: true, current: data.count, max: ANALYTICS_DAILY_MAX }
}

async function getToken(): Promise<string> {
  return await getWbToken("WB_API_TOKEN")
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

// Phase 17: characteristics[].value variadic (string | number | string[] | number[]).
// Точные типы зависят от свойства WB. См. .planning/phases/17-.../17-RESEARCH.md.
export interface WbCharacteristicRaw {
  id: number
  name: string
  value: string | number | Array<string | number>
}

export interface WbCardRaw {
  nmID: number
  // Phase 260514-mci: id «склейки» (imt) — общий для группы цветов/модификаций одной карточки.
  // WB Content API возвращает поле uppercase IDs (imtID).
  imtID?: number
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
    techSize?: string // Phase 17: размер ("S", "M", "46"); "0" = одно-размерный товар
    wbSize?: string
  }>
  characteristics?: WbCharacteristicRaw[] // Phase 17
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
  const token = await getToken()
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
  const token = await getToken()
  const priceMap = new Map<number, PriceData>()

  let offset = 0
  const limit = 1000

  while (true) {
    const res = await wbFetch(
      "Prices API",
      `${PRICES_API}/api/v2/list/goods/filter?limit=${limit}&offset=${offset}`,
      {
        headers: { Authorization: token },
      }
    )

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Prices API ошибка ${res.status}: ${text}`)
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

/**
 * @deprecated Использовать fetchStocksPerWarehouse() — возвращает агрегированные
 * данные без разбивки по складам. Физически не удаляется до sunset 2026-06-23
 * (Plan STOCK-FUT-09). Сохранён для backward compat.
 */
export async function fetchStocks(): Promise<Map<number, number>> {
  const token = await getToken()
  const stockMap = new Map<number, number>()

  const res = await wbFetch(
    "Statistics API (stocks)",
    "https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=2020-01-01",
    { headers: { Authorization: token } }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Statistics API stocks ошибка ${res.status}: ${text}`)
  }

  const items: Array<{ nmId: number; quantity: number }> = await res.json()

  for (const item of items) {
    const current = stockMap.get(item.nmId) ?? 0
    stockMap.set(item.nmId, current + item.quantity)
  }

  return stockMap
}

// ── Получение процента выкупа через Analytics API ───────────────

export async function fetchBuyoutPercent(nmIds: number[]): Promise<Map<number, number>> {
  const token = await getToken()
  const buyoutMap = new Map<number, number>()

  // Защита от исчерпания дневного лимита WB Analytics API (3 reports/день).
  const cap = await checkAndIncrementAnalyticsCounter()
  if (!cap.canRun) {
    console.warn(
      `[WB Analytics] Дневной лимит исчерпан (${cap.current}/${cap.max}). ` +
        `Процент выкупа пропускается до 00:00 UTC.`
    )
    return buyoutMap
  }

  try {
    // Период: последний месяц
    const endDate = new Date().toISOString().split("T")[0]
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

    const id = crypto.randomUUID()

    // 1. Создаём задание на отчёт
    const createRes = await wbFetch(
      "Analytics API (buyout)",
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
      const text = await createRes.text()
      throw new Error(`Analytics create report ошибка ${createRes.status}: ${text}`)
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

// 2026-05-15: outparam storefrontOut собирает точные WB-витрина значения рейтинга и
// кол-ва оценок per nmId. v4 batch уже хитим для СПП — добавляем парсинг 2 доп. полей
// без новых WB-запросов. WB v4 не различает per-nmId vs per-imt: для всех карточек
// склейки возвращает одинаковый reviewRating + feedbacks (= рейтинг склейки).
export interface StorefrontRatingsOut {
  ratings: Map<number, number>
  feedbacks: Map<number, number>
}

export async function fetchWbDiscounts(
  nmIds: number[],
  sellerPriceMap?: Map<number, PriceData>,
  storefrontOut?: StorefrontRatingsOut
): Promise<Map<number, number>> {
  const token = await getToken()
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

        // 2026-05-15: storefront ratings — то что показывает витрина WB покупателю.
        // reviewRating (number, 0..5, до десятых) + feedbacks (int >=0).
        if (storefrontOut) {
          if (typeof product.reviewRating === "number" && product.reviewRating > 0) {
            storefrontOut.ratings.set(nmId, product.reviewRating)
          }
          if (typeof product.feedbacks === "number" && product.feedbacks >= 0) {
            storefrontOut.feedbacks.set(nmId, product.feedbacks)
          }
        }

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
  const token = await getToken()
  const commMap = new Map<number, { fbw: number; fbs: number }>()

  const res = await wbFetch(
    "Tariffs API",
    "https://common-api.wildberries.ru/api/v1/tariffs/commission?locale=ru",
    { headers: { Authorization: token } }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Tariffs API ошибка ${res.status}: ${text}`)
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

  // Phase 17: размеры — отфильтровать "0" (placeholder для one-size товаров) и пустые.
  // Дедуплицируем — WB иногда возвращает повторы в массиве sizes.
  // sizeSkus: Map<techSize, string[]> — соответствие размер ↔ штрих-коды для
  // последующей привязки Barcode.productSizeId при WB import.
  const techSizes: string[] = []
  const sizeSkus: Array<{ techSize: string; skus: string[] }> = []
  for (const size of card.sizes ?? []) {
    const ts = (size.techSize ?? "").trim()
    if (!ts || ts === "0") continue
    if (!techSizes.includes(ts)) techSizes.push(ts)
    sizeSkus.push({ techSize: ts, skus: size.skus ?? [] })
  }

  // Phase 17: characteristics — пробрасываем как есть для записи в WbCard.characteristics (Json).
  // При импорте в Product свойства будут нормализованы через normalizeWbCharacteristicValue().
  const characteristics = card.characteristics ?? null

  return {
    nmId: card.nmID,
    // Phase 260514-mci: imt-склейка для группировки рейтингов
    // WB Content API в 2026-05 начал отдавать imtID > 2^31 (например 2 194 826 467).
    // WbCard.imtId — Int (INT4 в Postgres, max 2 147 483 647). Если значение
    // не помещается — обнуляем (теряем группировку рейтингов по imt-склейке,
    // но карточка сохранится). См. memory project_wb_card_imt_id_overflow.
    imtId:
      card.imtID == null || card.imtID > 2_147_483_647 ? null : card.imtID,
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
    characteristics,
    techSizes,
    sizeSkus,
  }
}

// Phase 17: Нормализация WB characteristics[].value → строка для ProductPropertyValue.
// WB возвращает разнотипные значения (см. 17-RESEARCH.md):
//   "1 год"             → "1 год"
//   5                   → "5"
//   ["Мужской"]         → "Мужской"
//   ["68% полиэстер","20% вискоза"] → "68% полиэстер, 20% вискоза"
export function normalizeWbCharacteristicValue(raw: unknown): string {
  if (raw == null) return ""
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v)).filter(Boolean).join(", ")
  }
  return String(raw)
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
  nmID?: number
  nmId?: number
  id?: number
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

/**
 * Типизированная ошибка rate-limit WB API. Несёт `retryAfterSec` из заголовка
 * `X-Ratelimit-Retry` — route.ts пробрасывает это число в JSON-ответ, UI
 * показывает «WB просит подождать X сек».
 *
 * 2026-05-12: Заменяет старый паттерн `throw new Error("... 429: text")`.
 * Возможность caller'у различить «провал API из-за rate-limit» от прочих
 * ошибок и сообщить пользователю точное время ожидания.
 */
export class WbRateLimitError extends Error {
  readonly endpoint: string
  readonly retryAfterSec: number

  constructor(endpoint: string, retryAfterSec: number) {
    super(`WB ${endpoint}: 429 Too Many Requests (retry-after ${retryAfterSec}s)`)
    this.name = "WbRateLimitError"
    this.endpoint = endpoint
    this.retryAfterSec = retryAfterSec
  }
}

/**
 * Тонкая обёртка над fetch для WB API. На 429 — читает `X-Ratelimit-Retry`
 * (секунды до восстановления) и бросает `WbRateLimitError`. На прочие
 * ответы — возвращает Response как есть (caller сам проверяет `!res.ok`).
 *
 * 2026-05-12: ПРИНЦИПИАЛЬНАЯ замена retryFetch. Раньше при 429 повторяли
 * запрос 3 раза с backoff 1s/5s/15s, считая что «WB остудится». На практике
 * это исчерпывало лимит **быстрее** (1 клик = 4 запроса/endpoint) и не
 * сбрасывало WB-таймер. WB сам знает, сколько ждать — возвращает в заголовке
 * `X-Ratelimit-Retry`. Пробрасываем это число caller'у вместо слепых retry.
 */
/**
 * Map английский endpoint label (свободный текст от callers) на WB cooldown bucket.
 * Возвращает null для неизвестных лейблов → cooldown bus disabled для этого вызова (safe).
 *
 * 2026-05-13 (Quick 260513-khv): после перехода на per-bucket cooldown bus.
 */
function resolveBucketFromEndpoint(endpoint: string): WbCooldownBucket | null {
  if (endpoint === "Prices API") return "prices"
  if (endpoint.startsWith("Statistics API")) {
    if (endpoint.includes("orders")) return "statistics-orders"
    if (endpoint.includes("sales")) return "statistics-sales"
    return "statistics-stocks" // "stocks" или "per-warehouse stocks" → stocks bucket
  }
  if (endpoint.startsWith("Analytics API")) return "analytics"
  if (endpoint === "Tariffs API") return "tariffs"
  if (endpoint.startsWith("Orders API")) return "statistics-orders"
  if (endpoint.startsWith("Content API")) return "content"
  return null
}

async function wbFetch(endpoint: string, url: string, opts: RequestInit = {}): Promise<Response> {
  // Quick 260513-khv: per-endpoint cooldown bus. Если конкретно этот bucket
  // уже в 429 — короткозамыкаемся БЕЗ запроса к WB. Соседние buckets не задеваем.
  // bucket=null → неизвестный endpoint, cooldown bus отключён (safe fallback).
  const bucket = resolveBucketFromEndpoint(endpoint)
  if (bucket) {
    const cooldownSec = await getWbCooldownSecondsRemaining(bucket)
    if (cooldownSec > 0) {
      throw new WbRateLimitError(`${endpoint} (cooldown ${bucket})`, cooldownSec)
    }
  }

  const res = await fetch(url, opts)
  if (res.status === 429) {
    const retryAfterSec = parseInt(res.headers.get("X-Ratelimit-Retry") ?? "60", 10) || 60
    // Записываем cooldown ТОЛЬКО для resolved bucket — соседние не блокируем.
    if (bucket) {
      await setWbCooldownUntil(bucket, retryAfterSec).catch(() => {})
    }
    throw new WbRateLimitError(endpoint, retryAfterSec)
  }
  return res
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
  const token = await getToken()
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
  const token = await getToken()
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
  const token = await getToken()
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

export interface OrdersStats {
  /** Средняя скорость заказов (минус отмены) за 7 дней, шт/день. */
  avg7d: number
  /** Заказы минус отмены за вчерашний день (Moscow TZ), шт. */
  yesterday: number
}

/** Получить статистику заказов за 7 дней + отдельно вчерашний день.
 *
 *  Возвращает `Map<nmId, OrdersStats>`. Один запрос к Orders API покрывает
 *  оба показателя: для avg7d считаем все записи !isCancel / 7;
 *  для yesterday фильтруем по полю `date` с префиксом вчерашней даты (MSK).
 *
 *  Отменённые заказы (`isCancel: true`) ИСКЛЮЧАЮТСЯ — «заказы минус отмены».
 *  Кабинет WB показывает все заказы, поэтому в нашем UI цифры на 10-20%
 *  ниже портальных — это ожидаемо (отмены до выкупа не считаем).
 *
 *  Источник: WB Statistics Orders API `/api/v1/supplier/orders?dateFrom={7d_ago}`.
 *  При 429 ждём 60 секунд (Statistics API ~1 req/min) и делаем рекурсивный retry.
 *  При любой другой ошибке — degraded mode: возвращаем пустой Map.
 *
 *  Имя `fetchAvgSalesSpeed7d` сохранено для обратной совместимости — поля
 *  `WbCard.avgSalesSpeed7d` и `WbCard.ordersYesterday` пишутся в wb-sync route.
 */
// ──────────────────────────────────────────────────────────────────
// Phase 14: Per-Warehouse Stocks via Statistics API (STOCK-07)
// ──────────────────────────────────────────────────────────────────
//
// DEVIATION от Plan 14-03: исходный план использовал Analytics API
// (POST /api/analytics/v1/stocks-report/wb-warehouses), но base-токен
// возвращает 403 "base token is not allowed". Верифицировано curl на VPS 2026-04-22.
//
// РЕШЕНИЕ: Statistics API (GET /api/v1/supplier/stocks?dateFrom=...)
// уже используется в fetchStocks() и возвращает per-warehouse данные
// (поле warehouseName). Один запрос = все данные, rate limit ~1 req/min.
//
// Endpoint верифицирован на VPS — возвращает поля:
//   warehouseName, nmId, quantity, inWayToClient, inWayFromClient, quantityFull

const STATISTICS_API_STOCKS = "https://statistics-api.wildberries.ru/api/v1/supplier/stocks"

/** Per-warehouse остаток для одного nmId на одном складе на одном размере. */
export interface WarehouseStockItem {
  /** Название склада WB (напр. "Невинномысск", "Коледино") */
  warehouseName: string
  /** Phase 16 (STOCK-32): тех. размер ("46", "48", "S", "M" или "0" для одно-размерных) */
  techSize: string
  /** Phase 16 (STOCK-32): WB barcode размерной позиции */
  barcode: string
  /** Доступное кол-во, шт */
  quantity: number
  /** В пути к клиенту, шт */
  inWayToClient: number
  /** В пути от клиента (возвраты), шт */
  inWayFromClient: number
}

/**
 * Получить per-warehouse остатки через Statistics API.
 *
 * Endpoint: GET /api/v1/supplier/stocks?dateFrom=<1 day ago>
 * Rate limit: ~1 запрос в минуту per токен. Один запрос = ВСЕ данные.
 * НЕ ставить в batch-цикл.
 *
 * @param nmIds Фильтр по nmId — только эти nmId попадут в результат.
 *   API возвращает все nmId продавца, фильтрация на клиенте.
 * @returns Map<nmId, WarehouseStockItem[]> сгруппированные по nmId.
 *   nmId без данных отсутствует в Map (не пустой массив).
 */
export async function fetchStocksPerWarehouse(
  nmIds: number[],
): Promise<Map<number, WarehouseStockItem[]>> {
  const result = new Map<number, WarehouseStockItem[]>()
  if (nmIds.length === 0) return result

  const token = await getToken()

  // ВАЖНО: dateFrom — фильтр по lastChangeDate, не период возврата.
  // Если ставить now-1d, вернутся только остатки изменённые за 24ч — стабильные
  // (не менялись) пропадут из ответа. Используем 2019-06-20 (дата запуска API)
  // для полного snapshot. Пример: nmId 418716179 имел qty=90 на Электростали,
  // но с now-1d вернулась только 1 строка про inWay (1 шт) — реальные 90
  // терялись. Фикс 2026-04-22.
  const dateFrom = "2019-06-20T00:00:00"
  const url = `${STATISTICS_API_STOCKS}?dateFrom=${encodeURIComponent(dateFrom)}`

  const res = await wbFetch("Statistics API (per-warehouse stocks)", url, {
    headers: { Authorization: token },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Statistics API stocks per-warehouse ${res.status}: ${text}`)
  }

  const rows: Array<{
    nmId: number
    warehouseName: string
    techSize?: string
    barcode?: string
    quantity: number
    inWayToClient: number
    inWayFromClient: number
    quantityFull?: number
  }> = await res.json()

  if (!Array.isArray(rows)) return result

  // Фильтруем по запрошенным nmIds и группируем
  const nmIdSet = new Set(nmIds)
  for (const row of rows) {
    if (!nmIdSet.has(row.nmId)) continue
    const items = result.get(row.nmId) ?? []
    items.push({
      warehouseName: row.warehouseName ?? "",
      techSize: row.techSize ?? "",
      barcode: row.barcode ?? "",
      quantity: row.quantity ?? 0,
      inWayToClient: row.inWayToClient ?? 0,
      inWayFromClient: row.inWayFromClient ?? 0,
    })
    result.set(row.nmId, items)
  }

  return result
}

/** Phase 15 (ORDERS-02): per-warehouse заказы за периодом.
 *
 *  Один запрос к Statistics Orders API возвращает ВСЕ заказы продавца за
 *  `periodDays` (default 7). Функция считает одновременно:
 *  - avg: заказы минус отмены / periodDays (backward compat с fetchAvgSalesSpeed7d)
 *  - yesterday: заказы за вчерашний день (Moscow TZ, YYYY-MM-DD префикс)
 *  - perWarehouse: Map<warehouseName, количество заказов минус отмены> для ORDERS-02
 *
 *  `isCancel: true` исключаются из ВСЕХ трёх счётчиков — "заказы минус отмены".
 *
 *  Rate limit WB Statistics API ~1 req/min. Один вызов = все данные.
 *  При 429 — sleep(60s) + один рекурсивный retry (паттерн fetchAvgSalesSpeed7d).
 *
 *  @param nmIds — фильтр по nmId (API возвращает все, фильтрация на клиенте).
 *  @param periodDays — окно в днях (default 7).
 *  @returns Map<nmId, OrdersWarehouseStats>. nmId без заказов отсутствует.
 */
export interface OrdersWarehouseStats {
  /** Заказы минус отмены за periodDays / periodDays (шт/день). */
  avg: number
  /** Заказы минус отмены за вчерашний день (Moscow TZ), шт. */
  yesterday: number
  /** Заказы минус отмены per-warehouse по имени склада (warehouseName → count). */
  perWarehouse: Map<string, number>
  /** Phase 16 (STOCK-32): per-warehouse + per-size агрегат. warehouseName → (techSize → count) */
  perWarehouseSize: Map<string, Map<string, number>>
  /** Окно в днях (для downstream расчётов). */
  periodDays: number
}

export async function fetchOrdersPerWarehouse(
  nmIds: number[],
  periodDays: number = 7,
): Promise<Map<number, OrdersWarehouseStats>> {
  const result = new Map<number, OrdersWarehouseStats>()
  if (nmIds.length === 0) return result

  const token = await getToken()

  const dateFrom = new Date()
  dateFrom.setDate(dateFrom.getDate() - periodDays)
  const dateFromIso = dateFrom.toISOString()

  const url =
    `https://statistics-api.wildberries.ru/api/v1/supplier/orders` +
    `?dateFrom=${encodeURIComponent(dateFromIso)}&flag=0`

  const res = await wbFetch("Orders API (per-warehouse)", url, {
    headers: { Authorization: token },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`WB Orders API (fetchOrdersPerWarehouse) ${res.status}: ${text}`)
  }

  const orders = (await res.json()) as Array<{
    nmId?: number
    nm_id?: number
    warehouseName?: string
    techSize?: string
    isCancel?: boolean
    date?: string
  }>
  if (!Array.isArray(orders)) return result

  // Окно "вчера" в Moscow TZ — идентично fetchAvgSalesSpeed7d
  const mskNow = new Date(Date.now() + 3 * 3600_000)
  const yy = mskNow.getUTCFullYear()
  const mm = String(mskNow.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(mskNow.getUTCDate() - 1).padStart(2, "0")
  const yesterdayPrefix = `${yy}-${mm}-${dd}`

  const requested = new Set(nmIds)
  const totals = new Map<number, number>()
  const yesterdayCounts = new Map<number, number>()
  const perWarehouseMap = new Map<number, Map<string, number>>()
  // Phase 16: per-warehouse + per-size агрегат
  const perWarehouseSizeMap = new Map<number, Map<string, Map<string, number>>>()

  for (const o of orders) {
    if (o.isCancel) continue
    const nm = o.nmId ?? o.nm_id
    if (nm == null || !requested.has(nm)) continue
    const wh = (o.warehouseName ?? "").trim()

    totals.set(nm, (totals.get(nm) ?? 0) + 1)
    if (o.date && o.date.startsWith(yesterdayPrefix)) {
      yesterdayCounts.set(nm, (yesterdayCounts.get(nm) ?? 0) + 1)
    }
    if (wh) {
      let perWh = perWarehouseMap.get(nm)
      if (!perWh) {
        perWh = new Map<string, number>()
        perWarehouseMap.set(nm, perWh)
      }
      perWh.set(wh, (perWh.get(wh) ?? 0) + 1)
    }
    if (wh) {
      const size = (o.techSize ?? "").trim() || "0"
      let perWhSize = perWarehouseSizeMap.get(nm)
      if (!perWhSize) {
        perWhSize = new Map<string, Map<string, number>>()
        perWarehouseSizeMap.set(nm, perWhSize)
      }
      let perSize = perWhSize.get(wh)
      if (!perSize) {
        perSize = new Map<string, number>()
        perWhSize.set(wh, perSize)
      }
      perSize.set(size, (perSize.get(size) ?? 0) + 1)
    }
  }

  for (const nmId of requested) {
    const t = totals.get(nmId) ?? 0
    const y = yesterdayCounts.get(nmId) ?? 0
    const perWh = perWarehouseMap.get(nmId) ?? new Map<string, number>()
    // Phase 16 (STOCK-32): per-warehouse + per-size агрегат для размерных строк UI
    const perWhSize = perWarehouseSizeMap.get(nmId) ?? new Map<string, Map<string, number>>()
    if (t === 0 && y === 0 && perWh.size === 0) continue
    result.set(nmId, {
      avg: t / periodDays,
      yesterday: y,
      perWarehouse: perWh,
      perWarehouseSize: perWhSize,
      periodDays,
    })
  }

  return result
}

// Phase 15 note: новый код должен использовать fetchOrdersPerWarehouse — она
// возвращает per-warehouse breakdown вдобавок к avg/yesterday одним HTTP-запросом.
export async function fetchAvgSalesSpeed7d(
  nmIds: number[],
): Promise<Map<number, OrdersStats>> {
  const token = await getToken()
  const result = new Map<number, OrdersStats>()
  if (nmIds.length === 0) return result

  const dateFrom = new Date()
  dateFrom.setDate(dateFrom.getDate() - 7)
  const dateFromIso = dateFrom.toISOString()

  const url =
    `https://statistics-api.wildberries.ru/api/v1/supplier/orders` +
    `?dateFrom=${encodeURIComponent(dateFromIso)}&flag=0`

  const res = await fetch(url, { headers: { Authorization: token } })

  if (res.status === 429) {
    // Statistics API даёт ~1 req/min → ждём минуту и делаем один retry
    await sleep(60_000)
    return fetchAvgSalesSpeed7d(nmIds)
  }

  if (!res.ok) {
    console.error(`WB Orders API (avgSalesSpeed7d) ${res.status}`)
    return result
  }

  const orders = (await res.json()) as Array<{
    nmId?: number
    nm_id?: number
    isCancel?: boolean
    date?: string // ISO без TZ, WB даёт в Moscow локальном времени
  }>
  if (!Array.isArray(orders)) return result

  // Окно «вчера» в Moscow TZ (UTC+3).
  // WB API возвращает `date` как ISO без TZ — это уже Moscow локальное время,
  // поэтому сравниваем как «YYYY-MM-DD»-префиксы для простоты и надёжности.
  const mskNow = new Date(Date.now() + 3 * 3600_000) // сдвиг UTC → MSK
  const yy = mskNow.getUTCFullYear()
  const mm = String(mskNow.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(mskNow.getUTCDate() - 1).padStart(2, "0") // вчера
  const yesterdayPrefix = `${yy}-${mm}-${dd}` // "2026-04-20"

  const totals = new Map<number, number>()
  const yesterdayCounts = new Map<number, number>()
  for (const o of orders) {
    if (o.isCancel) continue
    const nm = o.nmId ?? o.nm_id
    if (nm == null) continue
    totals.set(nm, (totals.get(nm) ?? 0) + 1)
    if (o.date && o.date.startsWith(yesterdayPrefix)) {
      yesterdayCounts.set(nm, (yesterdayCounts.get(nm) ?? 0) + 1)
    }
  }

  const requested = new Set(nmIds)
  for (const nmId of requested) {
    const t = totals.get(nmId) ?? 0
    const y = yesterdayCounts.get(nmId) ?? 0
    if (t === 0 && y === 0) continue
    result.set(nmId, { avg7d: t / 7, yesterday: y })
  }

  return result
}

// ──────────────────────────────────────────────────────────────────
// Quick 260515-m5o: WbCardOrdersDaily snapshot helpers.
// Используются daily cron (delta за вчера) и backfill с 2026-04-01.
// ──────────────────────────────────────────────────────────────────

export interface OrdersDailyRow {
  nmId: number
  date: Date // 00:00 UTC (Prisma @db.Date нормализует к DATE)
  qty: number
  // 2026-05-15 (quick 260515-phv): реальные исторические цены из Orders API
  // priceWithDisc → sellerPrice (цена с учётом скидки продавца, ₽)
  // finishedPrice → buyerPrice (финальная цена с WB-скидками + СПП, ₽)
  // Math.round(avg) per (nmId, date MSK). null если все значения отсутствуют/0.
  sellerPrice: number | null
  buyerPrice: number | null
}

/** Запросить WB Orders за период [dateFrom, ?] и сгруппировать в (nmId, date MSK) → qty + цены.
 *  isCancel=true исключаются. При response.length >= 80_000 — итерируем с lastChangeDate.
 *  Используется в backfill с 2026-04-01 и daily delta (dateFrom = вчера 00:00 MSK).
 *  Возвращает массив строк готовых к upsert (date = JS Date 00:00 UTC).
 *
 *  2026-05-15 (quick 260515-phv): дополнительно агрегирует priceWithDisc/finishedPrice
 *  как Math.round(avg) per (nmId, date MSK). Значения 0 / null / undefined игнорируются
 *  при подсчёте avg; если все значения отсутствуют для (nmId, date) → null.
 *
 *  Per-iteration logging для backfill diagnostics (W-3 fix): console.log с page=N, rowsReturned, total.
 */
export async function fetchOrdersForRange(dateFrom: Date): Promise<OrdersDailyRow[]> {
  const token = await getToken()
  const counts = new Map<
    string,
    {
      nmId: number
      date: string
      qty: number
      sellerPrices: number[]
      buyerPrices: number[]
    }
  >()
  // ISO без `Z` → MSK интерпретация на WB-стороне (см. CONTEXT.md + fetchAvgSalesSpeed7d)
  let currentDateFrom = dateFrom.toISOString().split(".")[0] // "2026-04-01T00:00:00"
  let safetyIters = 0
  let totalRowsSeen = 0

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (++safetyIters > 50) {
      throw new Error("fetchOrdersForRange: 80k pagination loop > 50 iterations, aborting")
    }
    const url =
      `https://statistics-api.wildberries.ru/api/v1/supplier/orders` +
      `?dateFrom=${encodeURIComponent(currentDateFrom)}&flag=0`
    const res = await wbFetch("Orders API (range)", url, { headers: { Authorization: token } })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`WB Orders API (fetchOrdersForRange) ${res.status}: ${text}`)
    }
    const orders = (await res.json()) as Array<{
      nmId?: number
      nm_id?: number
      date?: string
      isCancel?: boolean
      lastChangeDate?: string
      priceWithDisc?: number
      finishedPrice?: number
    }>
    const rowsReturned = Array.isArray(orders) ? orders.length : 0
    totalRowsSeen += rowsReturned
    console.log(
      `[wb-orders backfill] page=${safetyIters} dateFrom=${currentDateFrom} rowsReturned=${rowsReturned} total=${totalRowsSeen}`,
    )
    if (!Array.isArray(orders) || orders.length === 0) break

    for (const o of orders) {
      if (o.isCancel) continue
      const nm = o.nmId ?? o.nm_id
      if (nm == null || !o.date) continue
      const dateKey = o.date.slice(0, 10) // YYYY-MM-DD MSK
      const k = `${nm}::${dateKey}`
      let existing = counts.get(k)
      if (!existing) {
        existing = { nmId: nm, date: dateKey, qty: 0, sellerPrices: [], buyerPrices: [] }
        counts.set(k, existing)
      }
      existing.qty++
      if (typeof o.priceWithDisc === "number" && o.priceWithDisc > 0) {
        existing.sellerPrices.push(o.priceWithDisc)
      }
      if (typeof o.finishedPrice === "number" && o.finishedPrice > 0) {
        existing.buyerPrices.push(o.finishedPrice)
      }
    }

    // 80k soft-limit → продолжаем pagination с lastChangeDate последней записи.
    // NOTE: WB Statistics Orders endpoint redundantly returning srid across pages маловероятен
    // на Zoiten volume (~45 дней). Если когда-то начнёт двоить — добавить Set<srid> dedup сюда.
    if (orders.length >= 80_000) {
      const last = orders[orders.length - 1]
      if (!last.lastChangeDate || last.lastChangeDate === currentDateFrom) break
      currentDateFrom = last.lastChangeDate
      continue
    }
    break
  }

  return Array.from(counts.values()).map((r) => ({
    nmId: r.nmId,
    date: new Date(r.date), // 00:00 UTC, Prisma @db.Date нормализует к DATE
    qty: r.qty,
    sellerPrice:
      r.sellerPrices.length > 0
        ? Math.round(r.sellerPrices.reduce((a, b) => a + b, 0) / r.sellerPrices.length)
        : null,
    buyerPrice:
      r.buyerPrices.length > 0
        ? Math.round(r.buyerPrices.reduce((a, b) => a + b, 0) / r.buyerPrices.length)
        : null,
  }))
}

/** Idempotent upsert строк OrdersDailyRow в WbCardOrdersDaily.
 *  Используется и в cron, и в manual backfill. Transaction (callback variant) с timeout 90s.
 *  ON CONFLICT (nmId,date) UPDATE qty + sellerPrice + buyerPrice (overwrite — backfill rerun
 *  может вернуть скорректированные значения).
 *  Per-chunk logging для backfill diagnostics (W-3 fix).
 *
 *  2026-05-15 (quick 260515-phv): пишет sellerPrice/buyerPrice в create + update.
 */
export async function upsertOrdersDaily(rows: OrdersDailyRow[]): Promise<{ upserted: number }> {
  if (rows.length === 0) return { upserted: 0 }
  // Чанками по 500 для безопасности transaction timeout
  const CHUNK = 500
  const totalChunks = Math.ceil(rows.length / CHUNK)
  let total = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const chunkIdx = Math.floor(i / CHUNK) + 1
    // Callback-вариант поддерживает options { timeout }; array-вариант — нет (Prisma 6).
    await prisma.$transaction(
      async (tx) => {
        for (const r of chunk) {
          await tx.wbCardOrdersDaily.upsert({
            where: { nmId_date: { nmId: r.nmId, date: r.date } },
            create: {
              nmId: r.nmId,
              date: r.date,
              qty: r.qty,
              sellerPrice: r.sellerPrice,
              buyerPrice: r.buyerPrice,
            },
            update: {
              qty: r.qty,
              sellerPrice: r.sellerPrice,
              buyerPrice: r.buyerPrice,
            },
          })
        }
      },
      { timeout: 90_000 },
    )
    total += chunk.length
    console.log(
      `[wb-orders upsert] chunk=${chunkIdx}/${totalChunks} processed=${total}/${rows.length}`,
    )
  }
  return { upserted: total }
}

/**
 * 2026-05-15 (quick 260515-o4o): finalized buyer price (₽) per nmId через curl card.wb.ru v4 API.
 * Возвращает Map<nmId, buyerPriceRub> где buyerPriceRub = round(sizes[].price.product / 100).
 *
 * КРИТИЧЕСКИ ВАЖНО — это финальная цена на витрине WB:
 * она УЖЕ включает SPP + кошелёк + клуб + промо.
 * НЕ умножать дополнительно на (1 - walletPct/100) — будет двойное вычитание кошелька.
 * Verified empirically на nmId 800750522 (см. 260515-o4o-RESEARCH.md КРИТИЧЕСКИЙ ОТВЕТ).
 *
 * Pattern: батчи по 20, пауза 3000ms между ними, execSync curl (TLS fingerprint workaround
 * — Node.js fetch блокируется WB по 403, curl проходит).
 *
 * ВАЖНО: НЕ модифицируем существующий fetchWbDiscounts — Phase 7 pricing flow зависит от
 * его текущего поведения (вычисление SPP %). Эта функция — независимая копия curl-логики
 * без SPP-расчёта, только raw buyerPrice в рублях.
 */
export async function fetchBuyerPricesViaCurlV4(
  nmIds: number[],
): Promise<Map<number, number>> {
  const result = new Map<number, number>()
  if (nmIds.length === 0) return result
  let v4Failed = false

  for (let i = 0; i < nmIds.length; i += 20) {
    if (v4Failed) break
    const batch = nmIds.slice(i, i + 20)
    const nmStr = batch.join(";")
    try {
      const raw = execSync(
        `curl -s -H "Accept: application/json" -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" "https://card.wb.ru/cards/v4/detail?appType=1&curr=rub&dest=-1257786&nm=${nmStr}"`,
        { timeout: 15000 },
      ).toString()
      if (raw.includes("403 Forbidden") || raw.includes("<html>")) {
        console.warn(
          `[buyerPrices] v4 curl 403 на батче ${i / 20 + 1} — abort`,
        )
        v4Failed = true
        break
      }
      const data = JSON.parse(raw)
      const products = data?.products ?? []
      for (const product of products) {
        const nmId: number = product.id
        if (!nmId) continue
        const sizes = product.sizes ?? []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sizeWithPrice = sizes.find((s: any) => s.price?.product)
        if (!sizeWithPrice?.price?.product) continue
        const buyerPriceRub = Math.round(sizeWithPrice.price.product / 100)
        if (buyerPriceRub > 0) result.set(nmId, buyerPriceRub)
      }
    } catch (e) {
      console.error("[buyerPrices] v4 curl error:", e)
      v4Failed = true
      break
    }
    if (i + 20 < nmIds.length) {
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  console.log(
    `[buyerPrices] resolved ${result.size}/${nmIds.length} (v4Failed=${v4Failed})`,
  )
  return result
}

// ──────────────────────────────────────────────────────────────────
// Quick 260705-f1p: Дневной факт выкупов по дате РЕАЛИЗАЦИИ.
// Источник — Statistics Sales API supplier/sales.
// Агрегируется в WbSalesDaily (clean-replace через cron wb-sales-daily).
// ──────────────────────────────────────────────────────────────────

export interface WbSaleRow {
  date: string
  nmId: number
  saleID: string
  priceWithDisc: number
  forPay: number
}

export interface WbSalesDailyAgg {
  nmId: number
  date: string
  buyoutsRub: number
  buyoutsCount: number
  returnsRub: number
  returnsCount: number
  forPayRub: number
}

/**
 * Pure: агрегирует записи supplier/sales в дневной разрез по (nmId, дата реализации).
 * Дата реализации = row.date.slice(0,10).
 * saleID startsWith 'S' → выкуп (продажа), иначе → возврат.
 * priceWithDisc = цена продавца до СПП (метрика ИУ, не finishedPrice).
 */
export function aggregateSalesRows(rows: WbSaleRow[]): WbSalesDailyAgg[] {
  const map = new Map<string, WbSalesDailyAgg>()
  for (const r of rows) {
    const nmId = Number(r.nmId)
    if (!Number.isFinite(nmId)) continue
    const iso = String(r.date ?? "").slice(0, 10)
    if (iso.length !== 10) continue
    const key = `${nmId}|${iso}`
    let agg = map.get(key)
    if (!agg) {
      agg = { nmId, date: iso, buyoutsRub: 0, buyoutsCount: 0, returnsRub: 0, returnsCount: 0, forPayRub: 0 }
      map.set(key, agg)
    }
    const price = Number(r.priceWithDisc) || 0
    const forPay = Number(r.forPay) || 0
    if (String(r.saleID ?? "").startsWith("S")) {
      agg.buyoutsRub += price
      agg.buyoutsCount++
      agg.forPayRub += forPay
    } else {
      agg.returnsRub += price
      agg.returnsCount++
    }
  }
  return Array.from(map.values())
}

/**
 * Тянет supplier/sales за [dateFrom; now] через Statistics API,
 * агрегирует в дневной разрез выкупов по дате реализации.
 * Использует wbFetch (cooldown bucket "statistics-sales" + WbRateLimitError на 429).
 */
export async function fetchSalesDaily(dateFrom: string): Promise<WbSalesDailyAgg[]> {
  const token = await getToken()
  const res = await wbFetch(
    "Statistics API sales",
    `https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=${dateFrom}&flag=0`,
    { headers: { Authorization: token } },
  )
  if (!res.ok) throw new Error(`Sales API ошибка ${res.status}: ${await res.text()}`)
  const data = await res.json()
  if (!Array.isArray(data)) return []
  return aggregateSalesRows(data as WbSaleRow[])
}
