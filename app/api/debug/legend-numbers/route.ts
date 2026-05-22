// Temporary diagnostic — sanity check legend formula on prod data.
// 2026-05-22 — выяснить почему «вчерашние» ДРР в legend в 2× от SQL-симуляции.
import { NextResponse } from "next/server"
import { loadLegendMetrics } from "@/lib/wb-legend-metrics"
import { getMskTodayDate } from "@/lib/wb-orders-chart"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET(): Promise<NextResponse> {
  const todayMsk = getMskTodayDate()

  // Загружаем те же linkedNmIds что использует /prices/wb
  const wbMarketplace = await prisma.marketplace.findFirst({ where: { slug: "wb" } })
  if (!wbMarketplace) return NextResponse.json({ error: "no wb marketplace" })

  const linkedArticles = await prisma.marketplaceArticle.findMany({
    where: { marketplaceId: wbMarketplace.id, product: { deletedAt: null } },
    include: {
      product: {
        select: { id: true, name: true, subcategoryId: true, categoryId: true,
          subcategory: { select: { name: true } },
          category: { select: { name: true } } }
      }
    }
  })

  const nmIdToSubId = new Map<number, string | null>()
  const nmIdToCatId = new Map<number, string | null>()
  const nmIdToProduct = new Map<number, { name: string; subcat: string | null; cat: string | null }>()
  for (const a of linkedArticles) {
    const nmId = parseInt(a.article, 10)
    if (Number.isNaN(nmId)) continue
    if (!nmIdToSubId.has(nmId)) {
      nmIdToSubId.set(nmId, a.product.subcategoryId ?? null)
      nmIdToCatId.set(nmId, a.product.categoryId ?? null)
      nmIdToProduct.set(nmId, {
        name: a.product.name,
        subcat: a.product.subcategory?.name ?? null,
        cat: a.product.category?.name ?? null,
      })
    }
  }
  const linkedNmIds = [...nmIdToSubId.keys()]

  const metrics = await loadLegendMetrics(linkedNmIds, nmIdToSubId, nmIdToCatId, todayMsk)

  const target = 61929251
  const productInfo = nmIdToProduct.get(target)
  const nmMetrics = metrics.perNmId.get(target)
  const subId = nmIdToSubId.get(target)
  const catId = nmIdToCatId.get(target)
  const subMetrics = subId ? metrics.perSubcategoryId.get(subId) : null
  const catMetrics = catId ? metrics.perCategoryId.get(catId) : null

  return NextResponse.json({
    todayMsk: todayMsk.toISOString(),
    nmId: target,
    product: productInfo,
    nmMetrics,
    subMetrics: { name: productInfo?.subcat, ...subMetrics },
    catMetrics: { name: productInfo?.cat, ...catMetrics },
    sample_linkedNmIds_count: linkedNmIds.length,
  })
}
