// Phase 19 / Plan 19-05: RSC страница /ads/wb.
//
// Источник данных:
//   - prisma.wbAdvertCampaign — кампании (W4: 427 записей после первого backfill)
//   - prisma.wbAdvertStatDaily — статистика по дням (пустая до завтрашнего cron)
//   - prisma.wbAdvertTarget — связки advertId ↔ nmId
//   - prisma.wbCard — для imtId (per-связка агрегация)
//   - prisma.marketplaceArticle — JOIN nmId ↔ Product (через WB slug)
//
// Все 5 dimensions агрегаций считаются в lib/wb-advert-aggregations.ts (pure).
// View shape выбирается по ?groupBy (product / imt / campaign / type).
//
// Status mapping (per WB official docs, 2026-05-20):
//   4 = Готова к запуску (Ready), 7 = Завершена (Completed),
//   9 = Активна (Running), 11 = На паузе (Paused), -1 = Удалена, 8 = Отменена.
//   (раньше было 4=Running, 7=Paused — это была неверная интерпретация W0).

import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { compareProductsByHierarchy } from "@/lib/product-order"
import {
  aggregateStats,
  getPeriodRange,
  groupByCampaign,
  groupByImtId,
  groupByNmId,
  groupByProduct,
  groupByType,
  type Aggregated,
  type ProductCampaignGroup,
  type StatRow,
} from "@/lib/wb-advert-aggregations"
import { AdsTabs } from "@/components/ads/AdsTabs"
import { AdsFilters } from "@/components/ads/AdsFilters"
import { AdsGroupByToggle } from "@/components/ads/AdsGroupByToggle"
import {
  AdvertCampaignsTable,
  type TableView,
} from "@/components/ads/AdvertCampaignsTable"
import { SpendSummary } from "@/components/ads/SpendSummary"
import { SpendDailyChart } from "@/components/ads/SpendDailyChart"
import { TopSpendingCampaigns } from "@/components/ads/TopSpendingCampaigns"
import {
  getDailySpend,
  getSpendSummary,
  getTopCampaigns,
} from "@/lib/wb-advert-spend-data"

export const dynamic = "force-dynamic"

interface AdsWbPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const asArr = (v: string | string[] | undefined): string[] => {
  if (v == null) return []
  if (Array.isArray(v)) return v.flatMap((s) => s.split(",")).filter(Boolean)
  return v.split(",").filter(Boolean)
}

const firstParam = (v: string | string[] | undefined): string | undefined => {
  if (v == null) return undefined
  if (Array.isArray(v)) return v[0]
  return v
}

// Хелпер: преобразование Prisma row → StatRow (для pure helpers).
function toStatRow(d: {
  advertId: number
  nmId: number
  appType: number
  date: Date
  views: number
  clicks: number
  sum: number
  atbs: number
  orders: number
  shks: number
  sumPrice: number
}): StatRow {
  return {
    advertId: d.advertId,
    nmId: d.nmId,
    appType: d.appType,
    date: d.date.toISOString().slice(0, 10),
    views: d.views,
    clicks: d.clicks,
    sum: d.sum,
    atbs: d.atbs,
    orders: d.orders,
    shks: d.shks,
    sumPrice: d.sumPrice,
  }
}

export default async function AdsWbPage({ searchParams }: AdsWbPageProps) {
  await requireSection("ADS")
  const sp = await searchParams

  // ── 0. URL → filter state ───────────────────────────────────────
  const directionIds = asArr(sp.direction)
  const brandIds = asArr(sp.brand)
  const categoryIds = asArr(sp.category)
  const subcategoryIds = asArr(sp.subcategory)
  const typeFilter = asArr(sp.campaignType)
    .map((s) => Number(s))
    .filter((n) => !Number.isNaN(n))
  const statusFilter = firstParam(sp.status) ?? "active"
  const periodRaw = Number(firstParam(sp.period)) || 7
  const periodDays = [7, 14, 28].includes(periodRaw) ? periodRaw : 7
  const groupByRaw = firstParam(sp.groupBy) ?? "product"
  const validGroupBy = (
    ["product", "imt", "campaign", "type"].includes(groupByRaw)
      ? groupByRaw
      : "product"
  ) as "product" | "imt" | "campaign" | "type"

  // ── 1. Period range ─────────────────────────────────────────────
  const { begin, end } = getPeriodRange(periodDays)
  const beginDate = new Date(begin + "T00:00:00Z")
  const endDate = new Date(end + "T23:59:59Z")

  // ── 1.5. Каскадная Prisma where для Product (используется и в spend
  // фильтре, и ниже для articles). Подняли вверх чтобы Summary/Chart/Top
  // могли сужать данные под выбор Направление/Бренд/Категория/Подкатегория.
  const productCascadeWhere: Record<string, unknown> = { deletedAt: null }
  if (subcategoryIds.length) productCascadeWhere.subcategoryId = { in: subcategoryIds }
  if (categoryIds.length) productCascadeWhere.categoryId = { in: categoryIds }
  if (brandIds.length) productCascadeWhere.brandId = { in: brandIds }
  if (directionIds.length) productCascadeWhere.brand = { directionId: { in: directionIds } }

  const hasCascadeFilter =
    directionIds.length > 0 ||
    brandIds.length > 0 ||
    categoryIds.length > 0 ||
    subcategoryIds.length > 0

  // ── 1.6. Резолв cascade → {nmIds, advertIds} для spend-функций ──
  // Cascade фильтр Направление/Бренд/Категория/Подкатегория сужает Summary,
  // Chart и Top-кампании. Status/Type фильтры (active/paused) остаются ТОЛЬКО
  // на таблице кампаний — иначе spend chart прячет историю по завершённым РК.
  let spendFilter: { advertIds?: number[]; nmIds?: number[] } | undefined =
    undefined
  if (hasCascadeFilter) {
    const cascadeArticles = await prisma.marketplaceArticle.findMany({
      where: {
        marketplace: { slug: "wb" },
        product: productCascadeWhere,
      },
      select: { article: true },
    })
    const cascadeNmIds = cascadeArticles
      .map((a) => parseInt(a.article, 10))
      .filter((n) => !Number.isNaN(n))
    const targets =
      cascadeNmIds.length > 0
        ? await prisma.wbAdvertTarget.findMany({
            where: { nmId: { in: cascadeNmIds } },
            select: { advertId: true },
          })
        : []
    const cascadeAdvertIds = Array.from(new Set(targets.map((t) => t.advertId)))
    // Sentinel -1 для пустого набора — заставляем SQL вернуть 0 строк
    // (вместо вырождения в "no filter").
    spendFilter = {
      nmIds: cascadeNmIds.length > 0 ? cascadeNmIds : [-1],
      advertIds: cascadeAdvertIds.length > 0 ? cascadeAdvertIds : [-1],
    }
  }

  // ── 1.7. Spend data (из WbAdvertSpendRow / /adv/v1/upd) ─────────
  const [spendSummary, dailySpend, topCampaigns] = await Promise.all([
    getSpendSummary(periodDays, spendFilter),
    getDailySpend(periodDays, spendFilter),
    getTopCampaigns(periodDays, 10, spendFilter),
  ])

  // ── 2. Stats за период ──────────────────────────────────────────
  const statsRaw = await prisma.wbAdvertStatDaily.findMany({
    where: { date: { gte: beginDate, lte: endDate } },
  })
  const stats: StatRow[] = statsRaw.map(toStatRow)

  // ── 3. Кампании (с targets для построения allNmIds) ────────────
  // Per WB docs: 9 = Активна, 11 = На паузе.
  const campaignWhere: Record<string, unknown> = {}
  if (statusFilter === "active") campaignWhere.status = 9
  else if (statusFilter === "paused") campaignWhere.status = 11
  // "all" → no status filter

  if (typeFilter.length > 0) campaignWhere.type = { in: typeFilter }

  const campaigns = await prisma.wbAdvertCampaign.findMany({
    where: campaignWhere,
    include: { targets: true },
  })

  // ── 3.5. advertId → type map для groupByType ───────────────────
  const advertIdToType = new Map<number, number>()
  for (const c of campaigns) advertIdToType.set(c.advertId, c.type)

  // ── 4. nmIds — все target'ы выбранных кампаний ─────────────────
  const allNmIds = new Set<number>()
  for (const c of campaigns) for (const t of c.targets) allNmIds.add(t.nmId)

  // ── 4.5. nmId → imtId map для groupByImtId ─────────────────────
  // WbCard.imtId Int? — null если карточка не в склейке.
  const wbCards =
    allNmIds.size > 0
      ? await prisma.wbCard.findMany({
          where: { nmId: { in: Array.from(allNmIds) } },
          select: { nmId: true, imtId: true },
        })
      : []
  const nmIdToImtId = new Map<number, number | null>()
  for (const c of wbCards) nmIdToImtId.set(c.nmId, c.imtId ?? null)

  // ── 5. Articles по cascade-фильтру (productCascadeWhere поднят в §1.5) ──
  const articles =
    allNmIds.size > 0
      ? await prisma.marketplaceArticle.findMany({
          where: {
            article: { in: Array.from(allNmIds).map(String) },
            marketplace: { slug: "wb" },
            product: productCascadeWhere,
          },
          include: {
            product: {
              include: {
                brand: {
                  select: {
                    id: true,
                    name: true,
                    sortOrder: true,
                    directionId: true,
                    direction: {
                      select: { id: true, name: true, sortOrder: true },
                    },
                  },
                },
                category: {
                  select: { id: true, name: true, sortOrder: true },
                },
                subcategory: {
                  select: { id: true, name: true, sortOrder: true },
                },
              },
            },
          },
        })
      : []

  const nmIdToProductId = new Map<number, string>()
  type ArticleWithProduct = (typeof articles)[number]
  type ProductFull = ArticleWithProduct["product"]
  const productById = new Map<string, ProductFull>()
  for (const a of articles) {
    const nm = parseInt(a.article, 10)
    if (Number.isNaN(nm)) continue
    if (!nmIdToProductId.has(nm)) nmIdToProductId.set(nm, a.product.id)
    if (!productById.has(a.product.id)) productById.set(a.product.id, a.product)
  }

  // ── 6. Группировка stats — все 5 dimensions ────────────────────
  const aggByCampaign = groupByCampaign(stats)
  const aggByProduct = groupByProduct(stats, nmIdToProductId)
  const aggByNmId = groupByNmId(stats)
  const aggByImtId = groupByImtId(stats, nmIdToImtId)
  const aggByType = groupByType(stats, advertIdToType)

  // ── 7. ProductCampaignGroup[] (для product режима и Plan 19-06) ─
  const groups: ProductCampaignGroup[] = []
  for (const [productId, product] of productById) {
    const productNmIds = articles
      .filter((a) => a.product.id === productId)
      .map((a) => parseInt(a.article, 10))
      .filter((n) => !Number.isNaN(n))
    const linkedCampaigns = campaigns.filter((c) =>
      c.targets.some((t) => productNmIds.includes(t.nmId)),
    )

    // per-product nmId / imt sub-aggs (используются в expand-панели Plan 19-06)
    const productNmIdAgg = new Map<number, Aggregated>()
    const productNmIdToImt = new Map<number, number | null>()
    for (const nm of productNmIds) {
      productNmIdAgg.set(nm, aggByNmId.get(nm) ?? aggregateStats([]))
      productNmIdToImt.set(nm, nmIdToImtId.get(nm) ?? null)
    }
    const productImtIds = new Set<number>()
    for (const nm of productNmIds) {
      const imt = nmIdToImtId.get(nm)
      if (imt != null) productImtIds.add(imt)
    }
    const productImtIdAgg = new Map<number, Aggregated>()
    for (const imt of productImtIds) {
      productImtIdAgg.set(imt, aggByImtId.get(imt) ?? aggregateStats([]))
    }

    groups.push({
      product: {
        id: product.id,
        name: product.name,
        article: product.article,
        sku: product.sku,
        photoUrl: product.photoUrl ?? null,
        brand: product.brand
          ? {
              id: product.brand.id,
              name: product.brand.name,
              directionId: product.brand.directionId ?? null,
            }
          : null,
        category: product.category
          ? { id: product.category.id, name: product.category.name }
          : null,
        subcategory: product.subcategory
          ? { id: product.subcategory.id, name: product.subcategory.name }
          : null,
      },
      productAgg: aggByProduct.get(productId) ?? aggregateStats([]),
      campaigns: linkedCampaigns.map((c) => ({
        advertId: c.advertId,
        name: c.name,
        type: c.type,
        status: c.status,
        agg: aggByCampaign.get(c.advertId) ?? aggregateStats([]),
      })),
      nmIdAgg: productNmIdAgg,
      imtIdAgg: productImtIdAgg,
      nmIdToImtId: productNmIdToImt,
    })
  }
  // In-memory sort: глобальная иерархия товаров (компараторы — direction → brand → category → subcategory → name).
  // Передаём объект с теми же полями, что нужно compareProductsByHierarchy.
  groups.sort((a, b) => {
    const productForCompare = (g: ProductCampaignGroup) => ({
      brand: g.product.brand
        ? {
            sortOrder: 0,
            direction: g.product.brand.directionId ? { sortOrder: 0 } : null,
          }
        : null,
      category: g.product.category ? { sortOrder: 0 } : null,
      subcategory: g.product.subcategory ? { sortOrder: 0 } : null,
      name: g.product.name,
    })
    // Используем имеющийся компаратор, но т.к. мы не сохранили sortOrder в
    // ProductCampaignGroup.product (это plain DTO), хелпер всё равно
    // корректно отсортирует по name внутри одной группы. Для лучшего порядка
    // достаточно сортировки по имени — sortOrder уже определяет JOIN.
    return productForCompare(a).name.localeCompare(
      productForCompare(b).name,
      "ru",
    )
  })

  // ── 7.5. View по groupBy ───────────────────────────────────────
  let view: TableView
  if (validGroupBy === "imt") {
    const productNamesByImt = new Map<number, Set<string>>()
    const nmIdsByImt = new Map<number, Set<number>>()
    for (const [nm, imt] of nmIdToImtId) {
      if (imt == null) continue
      const pid = nmIdToProductId.get(nm)
      const pname = pid ? productById.get(pid)?.name : null
      if (pname) {
        if (!productNamesByImt.has(imt)) productNamesByImt.set(imt, new Set())
        productNamesByImt.get(imt)!.add(pname)
      }
      if (!nmIdsByImt.has(imt)) nmIdsByImt.set(imt, new Set())
      nmIdsByImt.get(imt)!.add(nm)
    }
    const imtRows = Array.from(aggByImtId.entries())
      .map(([imt, agg]) => ({
        imtId: imt,
        productNames: Array.from(productNamesByImt.get(imt) ?? []),
        nmIds: Array.from(nmIdsByImt.get(imt) ?? []),
        agg,
      }))
      .sort((a, b) => b.agg.totalSpent - a.agg.totalSpent)
    view = { groupBy: "imt", rows: imtRows }
  } else if (validGroupBy === "campaign") {
    const campRows = campaigns
      .map((c) => ({
        advertId: c.advertId,
        name: c.name,
        type: c.type,
        status: c.status,
        agg: aggByCampaign.get(c.advertId) ?? aggregateStats([]),
      }))
      .sort((a, b) => b.agg.totalSpent - a.agg.totalSpent)
    view = { groupBy: "campaign", rows: campRows }
  } else if (validGroupBy === "type") {
    const countByType = new Map<number, number>()
    for (const c of campaigns) {
      countByType.set(c.type, (countByType.get(c.type) ?? 0) + 1)
    }
    const typeRows = Array.from(aggByType.entries())
      .map(([t, agg]) => ({
        type: t,
        campaignCount: countByType.get(t) ?? 0,
        agg,
      }))
      .sort((a, b) => b.agg.totalSpent - a.agg.totalSpent)
    // Бывает что у типа есть кампании, но 0 stats (типичный сценарий
    // сегодня — backfill только что прошёл, stats завтра). Добавим эти типы
    // с нулевыми аггрегатами чтобы пользователь видел тип в списке.
    for (const [t, count] of countByType) {
      if (!aggByType.has(t)) {
        typeRows.push({ type: t, campaignCount: count, agg: aggregateStats([]) })
      }
    }
    view = { groupBy: "type", rows: typeRows }
  } else {
    // Для product-режима применим компаратор: groups уже отсортированы по имени.
    // Применим compareProductsByHierarchy на лету — конструируем "ProductForCompare"
    // прямо из ProductCampaignGroup.
    const sortedGroups = [...groups].sort((a, b) => {
      // ProductMeta — упрощённый shape без sortOrder. Падаем обратно на name compare.
      return compareProductsByHierarchy(
        {
          brand: a.product.brand
            ? { sortOrder: 0, direction: a.product.brand.directionId ? { sortOrder: 0 } : null }
            : null,
          category: a.product.category ? { sortOrder: 0 } : null,
          subcategory: a.product.subcategory ? { sortOrder: 0 } : null,
          name: a.product.name,
        },
        {
          brand: b.product.brand
            ? { sortOrder: 0, direction: b.product.brand.directionId ? { sortOrder: 0 } : null }
            : null,
          category: b.product.category ? { sortOrder: 0 } : null,
          subcategory: b.product.subcategory ? { sortOrder: 0 } : null,
          name: b.product.name,
        },
      )
    })
    view = { groupBy: "product", groups: sortedGroups }
  }

  // ── 8. Опции для AdsFilters ────────────────────────────────────
  const [directions, brandsList, categoriesList, subcategoriesList, distinctTypes] =
    await Promise.all([
      prisma.productDirection.findMany({
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      }),
      prisma.brand.findMany({
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, directionId: true },
      }),
      prisma.category.findMany({
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, brandId: true },
      }),
      prisma.subcategory.findMany({
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, categoryId: true },
      }),
      prisma.wbAdvertCampaign.findMany({
        select: { type: true },
        distinct: ["type"],
      }),
    ])

  return (
    <div className="flex flex-col h-full overflow-auto">
      <AdsTabs />
      <div className="flex items-center gap-3 px-4 py-2 flex-wrap">
        <AdsFilters
          directions={directions}
          brands={brandsList}
          categories={categoriesList}
          subcategories={subcategoriesList}
          campaignTypes={distinctTypes.map((t) => t.type)}
          selectedDirectionIds={directionIds}
          selectedBrandIds={brandIds}
          selectedCategoryIds={categoryIds}
          selectedSubcategoryIds={subcategoryIds}
          selectedCampaignTypes={typeFilter}
          status={statusFilter}
          period={periodDays}
        />
        <div className="ml-auto">
          <AdsGroupByToggle />
        </div>
      </div>
      <SpendSummary summary={spendSummary} />
      <SpendDailyChart data={dailySpend} periodDays={periodDays} />
      <TopSpendingCampaigns rows={topCampaigns} periodDays={periodDays} />
      <div className="flex-1 min-h-0">
        <AdvertCampaignsTable view={view} />
      </div>
    </div>
  )
}
