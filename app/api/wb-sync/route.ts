// app/api/wb-sync/route.ts
// POST /api/wb-sync — синхронизация карточек с Wildberries
// Требует авторизации (PRODUCTS section)
export const runtime = "nodejs"
export const maxDuration = 300 // 5 минут — много запросов к WB API

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import {
  fetchAllCards,
  getWbPhotoUrl,
  getWbPhotoUrls,
  checkHasVideo,
  fetchRating,
  fetchPrice,
} from "@/lib/wb-api"

export async function POST(): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }

  try {
    // 1. Получаем все карточки из Content API
    const rawCards = await fetchAllCards()

    if (rawCards.length === 0) {
      return NextResponse.json({ synced: 0, message: "Карточки не найдены в WB API" })
    }

    let synced = 0
    const errors: string[] = []

    // 2. Обрабатываем каждую карточку
    for (const card of rawCards) {
      try {
        // Штрихкоды из sizes
        const allBarcodes: string[] = []
        for (const size of card.sizes ?? []) {
          for (const sku of size.skus ?? []) {
            if (sku && !allBarcodes.includes(sku)) {
              allBarcodes.push(sku)
            }
          }
        }

        // Фото: определяем количество по photos массиву из ответа
        const photoCount = card.photos?.length ?? 0
        const photos = photoCount > 0
          ? card.photos.map((p) => p.big)
          : getWbPhotoUrls(card.nmID, 1)
        const photoUrl = photos[0] ?? getWbPhotoUrl(card.nmID, 1)

        // Проверка видео (HEAD запрос)
        const hasVideo = await checkHasVideo(card.nmID)

        // Рейтинг + цена через публичный API (один запрос)
        const ratingData = await fetchRating(card.nmID)
        const price = await fetchPrice(card.nmID)

        // Небольшая пауза чтобы не перегружать API WB
        await new Promise((r) => setTimeout(r, 200))

        // 3. Upsert в БД
        await prisma.wbCard.upsert({
          where: { nmId: card.nmID },
          update: {
            article: card.vendorCode,
            name: card.title || card.vendorCode,
            brand: card.brand || null,
            category: card.subjectName || null,
            photoUrl,
            photos,
            hasVideo,
            barcode: allBarcodes[0] ?? null,
            barcodes: allBarcodes,
            rating: ratingData.rating,
            reviewsTotal: ratingData.reviewsTotal,
            reviews1: ratingData.reviews1,
            reviews2: ratingData.reviews2,
            reviews3: ratingData.reviews3,
            reviews4: ratingData.reviews4,
            reviews5: ratingData.reviews5,
            price,
            rawJson: JSON.parse(JSON.stringify(card)),
            updatedAt: new Date(),
          },
          create: {
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
            rating: ratingData.rating,
            reviewsTotal: ratingData.reviewsTotal,
            reviews1: ratingData.reviews1,
            reviews2: ratingData.reviews2,
            reviews3: ratingData.reviews3,
            reviews4: ratingData.reviews4,
            reviews5: ratingData.reviews5,
            price,
            rawJson: JSON.parse(JSON.stringify(card)),
          },
        })

        synced++
      } catch (err) {
        errors.push(`nmID ${card.nmID}: ${(err as Error).message}`)
      }
    }

    return NextResponse.json({
      synced,
      total: rawCards.length,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    })
  } catch (e) {
    console.error("WB sync error:", e)
    return NextResponse.json(
      { error: (e as Error).message || "Ошибка синхронизации" },
      { status: 500 }
    )
  }
}
