// app/api/wb-sync-spp/route.ts
// POST /api/wb-sync-spp — синхронизация только скидки WB (СПП)
// Отдельный endpoint без seller API, чтобы v4 не блокировался
export const runtime = "nodejs"
export const maxDuration = 300

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { fetchAllPrices } from "@/lib/wb-api"

const HEADERS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
}

export async function POST(): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }

  try {
    // 1. Берём nmId и текущие цены продавца из БД
    const cards = await prisma.wbCard.findMany({
      select: { nmId: true, price: true },
    })

    if (cards.length === 0) {
      return NextResponse.json({ updated: 0, message: "Карточки не найдены. Сначала синхронизируйте." })
    }

    // 2. Загружаем цены продавца (один запрос к seller API)
    const priceMap = await fetchAllPrices()

    // 3. Запрашиваем v4 API батчами по 20, пауза 3 сек
    const nmIds = cards.map((c) => c.nmId)
    let updated = 0
    let v4Success = 0
    let v4Failed = false

    for (let i = 0; i < nmIds.length; i += 20) {
      if (v4Failed) break

      const batch = nmIds.slice(i, i + 20)
      const nmStr = batch.join(";")

      try {
        const res = await fetch(
          `https://card.wb.ru/cards/v4/detail?appType=1&curr=rub&dest=-1257786&nm=${nmStr}`,
          { headers: HEADERS }
        )

        if (res.status === 403 || res.status === 429) {
          console.warn(`[СПП] v4 ${res.status} на батче ${i / 20 + 1}`)
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
          const sellerData = priceMap.get(nmId)
          if (sellerData && sellerData.discountedPrice > 0 && buyerPriceRub > 0) {
            const spp = Math.round((1 - buyerPriceRub / sellerData.discountedPrice) * 100)
            if (spp > 0 && spp < 100) {
              await prisma.wbCard.update({
                where: { nmId },
                data: { discountWb: spp },
              })
              updated++
              v4Success++
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

    // 4. Fallback через Sales API для пропущенных
    if (v4Failed) {
      try {
        const token = process.env.WB_API_TOKEN
        const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
        const res = await fetch(
          `https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=${dateFrom}&flag=0`,
          { headers: { Authorization: token! } }
        )
        if (res.ok) {
          const sales = await res.json()
          if (Array.isArray(sales)) {
            // Собираем последний SPP для каждого nmId
            const sppMap = new Map<number, number>()
            for (const item of sales) {
              if (item.nmId && item.spp != null && item.spp > 0) {
                sppMap.set(item.nmId, Math.round(item.spp))
              }
            }
            for (const [nmId, spp] of sppMap) {
              await prisma.wbCard.updateMany({
                where: { nmId, discountWb: null },
                data: { discountWb: spp },
              })
              updated++
            }
          }
        }
      } catch (e) {
        console.error("Sales fallback error:", e)
      }
    }

    console.log(`[СПП sync] v4: ${v4Success} | fallback: ${v4Failed ? "да" : "нет"} | updated: ${updated}`)

    return NextResponse.json({
      updated,
      total: nmIds.length,
      v4Success,
      usedFallback: v4Failed,
    })
  } catch (e) {
    console.error("SPP sync error:", e)
    return NextResponse.json(
      { error: (e as Error).message || "Ошибка синхронизации СПП" },
      { status: 500 }
    )
  }
}
