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
  sizes: Array<{
    price: number
    discountedPrice: number
  }>
}

interface PricesResponse {
  data: {
    listGoods: PriceItem[]
  }
  error: boolean
}

export async function fetchAllPrices(): Promise<Map<number, { price: number; discountedPrice: number }>> {
  const token = getToken()
  const priceMap = new Map<number, { price: number; discountedPrice: number }>()

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
        // WB API: цены в рублях (целые или с копейками)
        priceMap.set(item.nmID, {
          price: Math.round(size.price),
          discountedPrice: Math.round(size.discountedPrice),
        })
      }
    }

    offset += items.length
    if (items.length < limit) break
  }

  return priceMap
}

// ── Получение скидки WB (СПП) через публичный API card.wb.ru ────
//
// СПП = общая скидка покупателю (sale) минус скидка продавца (basicSale)
// Это скидка которую WB даёт из своей комиссии.
// Публичный API — неофициальный, может быть заблокирован с VPS-IP.

export async function fetchWbDiscounts(nmIds: number[]): Promise<Map<number, number>> {
  const discountMap = new Map<number, number>()

  // Батчами по 50 nmId
  for (let i = 0; i < nmIds.length; i += 50) {
    const batch = nmIds.slice(i, i + 50)
    const nmStr = batch.join(";")

    try {
      const res = await fetch(
        `https://card.wb.ru/cards/v2/detail?appType=1&curr=rub&dest=-1257786&nm=${nmStr}`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          },
        }
      )

      if (!res.ok) {
        console.warn(`[WB Public API] HTTP ${res.status} for batch starting at ${batch[0]}`)
        continue
      }

      const data = await res.json()
      const products = data?.data?.products ?? []

      for (const product of products) {
        const nmId = product.id
        if (!nmId) continue

        // Способ 1: через цены (самый точный)
        // salePriceU = финальная цена покупателя (в копейках)
        // priceU = базовая цена до скидок (в копейках)
        // basicSale = скидка продавца %
        const salePriceU = product.salePriceU  // цена покупателя (копейки)
        const priceU = product.priceU          // базовая цена (копейки)
        const basicSale = product.basicSale ?? product.sale ?? 0  // скидка продавца %

        if (salePriceU && priceU && basicSale > 0) {
          // Цена после скидки продавца (до СПП)
          const priceAfterSellerDiscount = priceU * (1 - basicSale / 100)
          if (priceAfterSellerDiscount > 0) {
            const spp = Math.round((1 - salePriceU / priceAfterSellerDiscount) * 100)
            if (spp > 0 && spp < 100) {
              discountMap.set(nmId, spp)
              continue
            }
          }
        }

        // Способ 2: через разницу sale - basicSale (fallback)
        const totalSale = product.sale ?? 0
        const sellerSale = product.basicSale ?? 0
        if (totalSale > sellerSale) {
          const spp = Math.round(totalSale - sellerSale)
          if (spp > 0) {
            discountMap.set(nmId, spp)
          }
        }
      }
    } catch (err) {
      // Публичный API может быть заблокирован с VPS — не критично
      console.warn("[WB Public API] fetch error:", err instanceof Error ? err.message : err)
    }

    // Пауза между батчами чтобы не забанили
    if (i + 50 < nmIds.length) {
      await new Promise((r) => setTimeout(r, 500))
    }
  }

  return discountMap
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
