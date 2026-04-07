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

// ── Получение скидки WB (СПП) — гибридный подход ────────────────
//
// 1. Сначала пробуем card.wb.ru v4 (актуальные данные в реальном времени)
// 2. Для тех nmId где v4 вернул 403/PoW — берём из Statistics Sales API (ретроспектива)

export async function fetchWbDiscounts(
  nmIds: number[],
  sellerPriceMap?: Map<number, PriceData>
): Promise<Map<number, number>> {
  const token = getToken()
  const discountMap = new Map<number, number>()

  // ── Шаг 1: публичный v4 API (реальное время) ──────────────────
  const HEADERS = {
    Accept: "application/json",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  }

  // Батчами по 50 с паузой 6 сек (макс ~10 запросов/мин)
  let v4Failed = false
  for (let i = 0; i < nmIds.length; i += 50) {
    if (v4Failed) break

    const batch = nmIds.slice(i, i + 50)
    const nmStr = batch.join(";")

    try {
      const res = await fetch(
        `https://card.wb.ru/cards/v4/detail?appType=1&curr=rub&dest=-1257786&nm=${nmStr}`,
        { headers: HEADERS }
      )

      if (res.status === 403 || res.status === 429) {
        console.warn(`[WB v4] ${res.status} — переключаюсь на Sales API`)
        v4Failed = true
        break
      }

      if (!res.ok) continue

      const data = await res.json()
      const products = data?.products ?? data?.data?.products ?? []

      for (const product of products) {
        const nmId: number = product.id
        if (!nmId) continue

        const sizes = product.sizes ?? []
        const sizeWithPrice = sizes.find((s: { price?: { product?: number } }) => s.price?.product)
        if (!sizeWithPrice?.price?.product) continue

        const buyerPriceRub = sizeWithPrice.price.product / 100
        const sellerData = sellerPriceMap?.get(nmId)
        if (sellerData && sellerData.discountedPrice > 0 && buyerPriceRub > 0) {
          const spp = Math.round((1 - buyerPriceRub / sellerData.discountedPrice) * 100)
          if (spp > 0 && spp < 100) {
            discountMap.set(nmId, spp)
          }
        }
      }
    } catch {
      v4Failed = true
      break
    }

    // Пауза 6 сек между батчами (~10 запросов/мин)
    if (i + 50 < nmIds.length) {
      await new Promise((r) => setTimeout(r, 6000))
    }
  }

  // ── Шаг 2: fallback через Sales API (ретроспектива) ────────────
  // Для nmId которые не получили СПП через v4
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
              discountMap.set(item.nmId, Math.round(item.spp))
            }
          }
        }
      }
    } catch (e) {
      console.error("Sales API fallback error:", e)
    }
  }

  console.log(`[СПП] v4: ${discountMap.size - (v4Failed ? 0 : 0)} | fallback: ${v4Failed ? "да" : "нет"} | итого: ${discountMap.size}/${nmIds.length}`)

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
