// app/api/wb-sync-spp/route.ts
// POST /api/wb-sync-spp — синхронизация только скидки WB (СПП)
// Использует curl вместо Node.js fetch (WB блокирует Node.js по TLS fingerprint)
export const runtime = "nodejs"
export const maxDuration = 300

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { execSync } from "node:child_process"

export async function POST(): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }

  try {
    // 1. Берём nmId и цены продавца из БД
    const cards = await prisma.wbCard.findMany({
      select: { nmId: true, price: true },
    })

    if (cards.length === 0) {
      return NextResponse.json({ updated: 0, message: "Карточки не найдены" })
    }

    const sellerPrices = new Map(cards.map((c) => [c.nmId, c.price ?? 0]))
    const nmIds = cards.map((c) => c.nmId)

    let updated = 0
    let v4Success = 0
    let v4Failed = false

    // 2. v4 API через curl (обходит TLS fingerprint блокировку)
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
          console.warn(`[СПП] v4 403 на батче ${i / 20 + 1}`)
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
          const sellerPrice = sellerPrices.get(nmId) ?? 0
          if (sellerPrice > 0 && buyerPriceRub > 0) {
            // Округление до 1 десятичного знака (точность СПП в отображении)
            const spp =
              Math.round((1 - buyerPriceRub / sellerPrice) * 1000) / 10
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
        console.warn(`[СПП] curl ошибка на батче ${i / 20 + 1}`)
        v4Failed = true
        break
      }

      // Пауза 3 сек
      if (i + 20 < nmIds.length) {
        await new Promise((r) => setTimeout(r, 3000))
      }
    }

    // 3. Fallback через Sales API
    if (v4Failed) {
      try {
        const token = process.env.WB_API_TOKEN!
        const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
        const res = await fetch(
          `https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=${dateFrom}&flag=0`,
          { headers: { Authorization: token } }
        )
        if (res.ok) {
          const sales = await res.json()
          if (Array.isArray(sales)) {
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

    console.log(`[СПП sync] v4(curl): ${v4Success} | fallback: ${v4Failed ? "да" : "нет"} | updated: ${updated}`)

    // Инвалидация RSC кэша — чтобы /prices/wb и /cards/wb показали свежую СПП
    // в том числе в расчётных строках (они используют card.discountWb через baseRowFields).
    revalidatePath("/prices/wb")
    revalidatePath("/cards/wb")

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
