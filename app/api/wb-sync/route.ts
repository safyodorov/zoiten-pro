// app/api/wb-sync/route.ts
// POST /api/wb-sync — синхронизация карточек с Wildberries
export const runtime = "nodejs"
export const maxDuration = 300

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { fetchAllCards, parseCard } from "@/lib/wb-api"

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
    for (const raw of rawCards) {
      try {
        const card = parseCard(raw)

        await prisma.wbCard.upsert({
          where: { nmId: card.nmId },
          update: {
            article: card.article,
            name: card.name,
            brand: card.brand,
            category: card.category,
            photoUrl: card.photoUrl,
            photos: card.photos,
            hasVideo: card.hasVideo,
            barcode: card.barcode,
            barcodes: card.barcodes,
            weightKg: card.weightKg,
            heightCm: card.heightCm,
            widthCm: card.widthCm,
            depthCm: card.depthCm,
            rawJson: JSON.parse(JSON.stringify(raw)),
            updatedAt: new Date(),
          },
          create: {
            nmId: card.nmId,
            article: card.article,
            name: card.name,
            brand: card.brand,
            category: card.category,
            photoUrl: card.photoUrl,
            photos: card.photos,
            hasVideo: card.hasVideo,
            barcode: card.barcode,
            barcodes: card.barcodes,
            weightKg: card.weightKg,
            heightCm: card.heightCm,
            widthCm: card.widthCm,
            depthCm: card.depthCm,
            rawJson: JSON.parse(JSON.stringify(raw)),
          },
        })

        synced++
      } catch (err) {
        errors.push(`nmID ${raw.nmID}: ${(err as Error).message}`)
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
