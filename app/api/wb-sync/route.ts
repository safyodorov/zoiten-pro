// app/api/wb-sync/route.ts
// POST /api/wb-sync — синхронизация карточек с Wildberries
export const runtime = "nodejs"
export const maxDuration = 300

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { fetchAllCards, parseCard, fetchAllPrices, fetchWbDiscounts, fetchStandardCommissions } from "@/lib/wb-api"

export async function POST(): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }

  try {
    // 1. Карточки из Content API
    const rawCards = await fetchAllCards()

    if (rawCards.length === 0) {
      return NextResponse.json({ synced: 0, message: "Карточки не найдены в WB API" })
    }

    // 2. Цены из Discounts & Prices API (одним запросом для всех)
    const priceMap = await fetchAllPrices()

    // 3. Стандартные комиссии из Tariffs API
    const commMap = await fetchStandardCommissions()

    // 4. ИУ комиссии из БД (загруженные из Excel)
    const iuList = await prisma.wbCommissionIu.findMany()
    const iuMap = new Map(iuList.map((iu) => [iu.subjectName, { fbw: iu.fbw, fbs: iu.fbs }]))

    // 5. Скидки WB (СПП) через card.wb.ru v4 + цены продавца
    //    СПП = (1 - цена_покупателя / цена_продавца) × 100
    const nmIds = rawCards.map((c) => c.nmID)
    const discountMap = await fetchWbDiscounts(nmIds, priceMap)

    let synced = 0
    const errors: string[] = []

    // 6. Обрабатываем каждую карточку
    for (const raw of rawCards) {
      try {
        const card = parseCard(raw)
        const priceData = priceMap.get(card.nmId)
        const discountWb = discountMap.get(card.nmId) ?? null
        const price = priceData?.discountedPrice ?? null

        // Комиссии: стандартные по subjectID, ИУ по subjectName (category)
        const stdComm = commMap.get(raw.subjectID)
        const iuComm = card.category ? iuMap.get(card.category) : undefined

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
            price,
            discountWb,
            commFbwStd: stdComm?.fbw ?? null,
            commFbsStd: stdComm?.fbs ?? null,
            commFbwIu: iuComm?.fbw ?? null,
            commFbsIu: iuComm?.fbs ?? null,
            label: card.tags.length > 0 ? card.tags.join(", ") : undefined,
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
            price,
            discountWb,
            commFbwStd: stdComm?.fbw ?? null,
            commFbsStd: stdComm?.fbs ?? null,
            commFbwIu: iuComm?.fbw ?? null,
            commFbsIu: iuComm?.fbs ?? null,
            label: card.tags.length > 0 ? card.tags.join(", ") : null,
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
      pricesLoaded: priceMap.size,
      discountsLoaded: discountMap.size,
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
