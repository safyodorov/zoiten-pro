// lib/wb-api.ts
// Работа с Wildberries Content API и Feedbacks API

const CONTENT_API = "https://content-api.wildberries.ru"
const FEEDBACKS_API = "https://feedbacks-api.wildberries.ru"

function getToken(): string {
  const token = process.env.WB_API_TOKEN
  if (!token) throw new Error("WB_API_TOKEN не настроен")
  return token
}

// ── Формирование URL фото по nmId ───────────────────────────────

function getPhotoHost(nmId: number): string {
  const vol = Math.floor(nmId / 100000)
  // Определяем basket по диапазону vol
  let basket: string
  if (vol >= 0 && vol <= 143) basket = "01"
  else if (vol <= 287) basket = "02"
  else if (vol <= 431) basket = "03"
  else if (vol <= 719) basket = "04"
  else if (vol <= 1007) basket = "05"
  else if (vol <= 1061) basket = "06"
  else if (vol <= 1115) basket = "07"
  else if (vol <= 1169) basket = "08"
  else if (vol <= 1313) basket = "09"
  else if (vol <= 1601) basket = "10"
  else if (vol <= 1655) basket = "11"
  else if (vol <= 1919) basket = "12"
  else if (vol <= 2045) basket = "13"
  else if (vol <= 2189) basket = "14"
  else if (vol <= 2405) basket = "15"
  else if (vol <= 2621) basket = "16"
  else if (vol <= 2837) basket = "17"
  else basket = "18"
  return `https://basket-${basket}.wbbasket.ru`
}

export function getWbPhotoUrl(nmId: number, photoIndex: number = 1): string {
  const host = getPhotoHost(nmId)
  const vol = Math.floor(nmId / 100000)
  const part = Math.floor(nmId / 1000)
  return `${host}/vol${vol}/part${part}/${nmId}/images/big/${photoIndex}.webp`
}

export function getWbPhotoUrls(nmId: number, photoCount: number): string[] {
  const urls: string[] = []
  for (let i = 1; i <= photoCount; i++) {
    urls.push(getWbPhotoUrl(nmId, i))
  }
  return urls
}

// ── Проверка наличия видео ───────────────────────────────────────

export async function checkHasVideo(nmId: number): Promise<boolean> {
  const host = getPhotoHost(nmId)
  const vol = Math.floor(nmId / 100000)
  const part = Math.floor(nmId / 1000)
  const videoUrl = `${host}/vol${vol}/part${part}/${nmId}/video/1/1.mp4`
  try {
    const res = await fetch(videoUrl, { method: "HEAD" })
    return res.ok
  } catch {
    return false
  }
}

// ── Получение карточек через Content API ─────────────────────────

interface WbCardRaw {
  nmID: number
  vendorCode: string
  brand: string
  title: string
  description: string
  subjectName: string
  subjectID: number
  photos: Array<{ big: string; small: string }>
  sizes: Array<{
    skus: string[]
    price: number
  }>
  mediaFiles?: string[]
  dimensions?: {
    width: number
    height: number
    length: number
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

export async function fetchAllCards(): Promise<WbCardRaw[]> {
  const token = getToken()
  const allCards: WbCardRaw[] = []

  let cursorUpdatedAt: string | undefined = undefined
  let cursorNmID = 0
  const limit = 100

  while (true) {
    // WB API не принимает пустую строку для updatedAt — передаём только если есть значение
    const cursorObj: Record<string, unknown> = { limit, nmID: cursorNmID }
    if (cursorUpdatedAt) {
      cursorObj.updatedAt = cursorUpdatedAt
    }

    const body = {
      settings: {
        cursor: cursorObj,
        filter: { withPhoto: -1 }, // -1 = все, 0 = без фото, 1 = с фото
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

    // Курсорная пагинация
    if (data.cursor.total < limit) break
    cursorUpdatedAt = data.cursor.updatedAt
    cursorNmID = data.cursor.nmID
  }

  return allCards
}

// ── Получение рейтинга через Feedbacks API ───────────────────────

interface FeedbacksCountResponse {
  data?: {
    feedbacksCount?: number
    valuation?: number
  }
  valuationDistribution?: Record<string, number>
}

export async function fetchRating(
  nmId: number
): Promise<{
  rating: number | null
  reviewsTotal: number | null
  reviews1: number | null
  reviews2: number | null
  reviews3: number | null
  reviews4: number | null
  reviews5: number | null
}> {
  try {
    // Публичный API WB для рейтинга — не требует токена
    const res = await fetch(
      `https://card.wb.ru/cards/v2/detail?appType=1&curr=rub&dest=-1257786&nm=${nmId}`,
      { headers: { Accept: "application/json" } }
    )

    if (!res.ok) {
      return { rating: null, reviewsTotal: null, reviews1: null, reviews2: null, reviews3: null, reviews4: null, reviews5: null }
    }

    const data = await res.json()
    const product = data?.data?.products?.[0]
    if (!product) {
      return { rating: null, reviewsTotal: null, reviews1: null, reviews2: null, reviews3: null, reviews4: null, reviews5: null }
    }

    return {
      rating: product.reviewRating ?? product.rating ?? null,
      reviewsTotal: product.feedbacks ?? null,
      reviews1: null, // Детализация 1-5 не доступна через публичный API
      reviews2: null,
      reviews3: null,
      reviews4: null,
      reviews5: null,
    }
  } catch {
    return { rating: null, reviewsTotal: null, reviews1: null, reviews2: null, reviews3: null, reviews4: null, reviews5: null }
  }
}

// ── Получение цены через публичный API ──────────────────────────

export async function fetchPrice(nmId: number): Promise<number | null> {
  try {
    const res = await fetch(
      `https://card.wb.ru/cards/v2/detail?appType=1&curr=rub&dest=-1257786&nm=${nmId}`,
      { headers: { Accept: "application/json" } }
    )
    if (!res.ok) return null
    const data = await res.json()
    const product = data?.data?.products?.[0]
    if (!product) return null
    // Цена в копейках, делим на 100
    const salePriceU = product.salePriceU ?? product.priceU
    return salePriceU ? Math.round(salePriceU / 100) : null
  } catch {
    return null
  }
}
