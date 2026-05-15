// app/api/wb-prices-retroactive-backfill/route.ts
// POST — одноразовый UPDATE существующих строк WbCardOrdersDaily
// (заполняем sellerPrice + buyerPrice по сегодняшним значениям WbCard).
// Безопасно повторять — UPDATE'им только строки с sellerPrice IS NULL.
// 2026-05-15 (quick 260515-o4o)

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { computeBuyerPriceRetro } from "@/lib/wb-cron-schedule"

export const runtime = "nodejs"
export const maxDuration = 600

export async function POST(): Promise<NextResponse> {
  try {
    await requireSection("PRODUCTS", "MANAGE")
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const cards = await prisma.wbCard.findMany({
    where: { deletedAt: null, price: { not: null } },
    select: { nmId: true, price: true, discountWb: true },
  })

  let rowsUpdated = 0
  let skippedNoPrice = 0
  for (const card of cards) {
    const sellerPrice = card.price ? Math.round(card.price) : null
    if (!sellerPrice) {
      skippedNoPrice++
      continue
    }
    const buyerPrice = computeBuyerPriceRetro({
      sellerPrice,
      discountWb: card.discountWb,
    })
    // Только строки, где ЕЩЁ нет цены — не перезаписываем выставленные daily cron'ом.
    const res = await prisma.wbCardOrdersDaily.updateMany({
      where: { nmId: card.nmId, sellerPrice: null },
      data: { sellerPrice, buyerPrice },
    })
    rowsUpdated += res.count
  }

  console.log(
    `[prices-retro-backfill] cards=${cards.length}, rowsUpdated=${rowsUpdated}, skippedNoPrice=${skippedNoPrice}`,
  )
  return NextResponse.json({
    ok: true,
    cardsProcessed: cards.length,
    rowsUpdated,
    skippedNoPrice,
  })
}
