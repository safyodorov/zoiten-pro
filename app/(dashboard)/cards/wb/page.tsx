import { prisma } from "@/lib/prisma"
import { WbCardsTable } from "@/components/cards/WbCardsTable"
import { WbSyncButton } from "@/components/cards/WbSyncButton"
import { WbSyncSppButton } from "@/components/cards/WbSyncSppButton"
import { WbSyncRatingsButton } from "@/components/cards/WbSyncRatingsButton"
import { WbUploadIuButton } from "@/components/cards/WbUploadIuButton"
import { WbOrdersBackfillButton } from "@/components/cards/WbOrdersBackfillButton"
import { WbPricesRetroactiveBackfillButton } from "@/components/cards/WbPricesRetroactiveBackfillButton"
import { WbFilters } from "@/components/cards/WbFilters"
import { Input } from "@/components/ui/input"
import { getPageSizePref } from "@/app/actions/user-preferences"
import {
  getMskTodayDate,
  fillTimeSeries,
  type DayPoint,
} from "@/lib/wb-orders-chart"

const DEFAULT_PAGE_SIZE = 50

export default async function WbCardsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; page?: string; size?: string
    sort?: string; dir?: string
    brands?: string; categories?: string; labels?: string
  }>
}) {
  const { q, page: pageParam, size: sizeParam, sort, dir, brands: brandsParam, categories: categoriesParam, labels: labelsParam } = await searchParams

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // 2026-05-15 (quick 260515-kes): скрываем soft-deleted карточки.
  // Они автоматически hard-delete'нутся через 30 дней в /api/wb-sync.
  const where: any = { deletedAt: null }
  if (q && q.trim()) {
    where.OR = [
      { name: { contains: q.trim(), mode: "insensitive" } },
      { article: { contains: q.trim(), mode: "insensitive" } },
    ]
  }

  // Фильтры по бренду и категории (множественный выбор через запятую)
  const selectedBrands = brandsParam ? brandsParam.split(",").filter(Boolean) : []
  const selectedCategories = categoriesParam ? categoriesParam.split(",").filter(Boolean) : []
  // Phase 260514-mci: фильтр по Ярлыку
  const selectedLabels = labelsParam ? labelsParam.split(",").filter(Boolean) : []

  if (selectedBrands.length > 0) {
    where.brand = { in: selectedBrands }
  }
  if (selectedCategories.length > 0) {
    where.category = { in: selectedCategories }
  }
  if (selectedLabels.length > 0) {
    where.label = { in: selectedLabels }
  }

  // pageSize: URL ?size приоритетнее, иначе persisted user pref, иначе default
  const urlSize = sizeParam ? Number(sizeParam) : null
  const pageSize = urlSize && [20, 50, 100].includes(urlSize)
    ? urlSize
    : (await getPageSizePref("cards-wb")) ?? DEFAULT_PAGE_SIZE
  const currentPage = Math.max(1, parseInt(pageParam ?? "1", 10))
  const skip = (currentPage - 1) * pageSize

  // Сортировка
  // Phase 260514-mci: добавлен stockQty в whitelist
  // 2026-05-15: для stockQty группируем null рядом с 0 (оба = «нет остатка»).
  //   ASC  → nulls first  → [null,...,0,0,1,2,...,N]  блок «—» в начале
  //   DESC → nulls last   → [N,...,2,1,0,0,null,...]   блок «—» в конце
  const sortBy = sort && ["brand", "category", "name", "createdAt", "stockQty"].includes(sort) ? sort : "createdAt"
  const sortDir = dir === "asc" ? "asc" : "desc"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderBy: any =
    sortBy === "stockQty"
      ? { stockQty: { sort: sortDir, nulls: sortDir === "asc" ? "first" : "last" } }
      : { [sortBy]: sortDir }

  // Загружаем данные + уникальные значения для фильтров
  // Находим маркетплейс WB для проверки привязки
  const wbMarketplace = await prisma.marketplace.findFirst({ where: { slug: "wb" } })

  const [cards, total, allBrandCategoryPairs, allLabels] = await Promise.all([
    prisma.wbCard.findMany({ where, orderBy, skip, take: pageSize }),
    prisma.wbCard.count({ where }),
    // Cascade фильтров: тянем distinct пары (brand, category) — client-side WbFilters
    // строит список брендов и список категорий, фильтрующийся по выбранным брендам.
    prisma.wbCard.findMany({
      select: { brand: true, category: true },
      distinct: ["brand", "category"],
      where: { brand: { not: null }, category: { not: null }, deletedAt: null },
      orderBy: [{ brand: "asc" }, { category: "asc" }],
    }),
    // Phase 260514-mci: distinct ярлыки для фильтра «Ярлык»
    prisma.wbCard.findMany({
      select: { label: true },
      distinct: ["label"],
      where: { label: { not: null }, deletedAt: null },
      orderBy: { label: "asc" },
    }),
  ])

  const brandCategoryPairs: Array<{ brand: string; category: string }> = allBrandCategoryPairs
    .filter((p) => p.brand && p.category)
    .map((p) => ({ brand: p.brand!, category: p.category! }))

  const labelOptions: string[] = allLabels
    .map((l) => l.label)
    .filter((v): v is string => Boolean(v))

  const totalPages = Math.ceil(total / pageSize)

  // Проверяем какие nmId уже привязаны к активным товарам
  const cardNmIds = cards.map((c) => String(c.nmId))
  const linkedArticles = wbMarketplace
    ? await prisma.marketplaceArticle.findMany({
        where: {
          marketplaceId: wbMarketplace.id,
          article: { in: cardNmIds },
          product: { deletedAt: null },
        },
        select: { article: true },
      })
    : []
  const linkedNmIds = new Set(linkedArticles.map((a) => a.article))

  // Quick 260515-m5o: 28-дневное окно [today-28, today-1] для bar chart (MSK).
  // W-4: используем shared helper getMskTodayDate, не inline MSK math.
  const todayMsk = getMskTodayDate()
  const windowStart = new Date(todayMsk.getTime() - 28 * 24 * 3600_000)
  const windowEnd = new Date(todayMsk.getTime() - 1 * 24 * 3600_000) // today-1 (вчера), включительно

  const visibleNmIds = cards.map((c) => c.nmId)
  const ordersRows =
    visibleNmIds.length > 0
      ? await prisma.wbCardOrdersDaily.findMany({
          where: {
            nmId: { in: visibleNmIds },
            date: { gte: windowStart, lte: windowEnd },
          },
          // 2026-05-15 (quick 260515-o4o): добавлен buyerPrice для линии цены в ComposedChart.
          // sellerPrice не нужен на клиенте — Line использует только buyerPrice.
          select: {
            nmId: true,
            date: true,
            qty: true,
            buyerPrice: true,
          },
        })
      : []

  const byNm = new Map<
    number,
    Array<{ date: Date; qty: number; buyerPrice: number | null }>
  >()
  for (const r of ordersRows) {
    const arr = byNm.get(r.nmId) ?? []
    arr.push({ date: r.date, qty: r.qty, buyerPrice: r.buyerPrice })
    byNm.set(r.nmId, arr)
  }
  // CRITICAL (B-2): explicit DayPoint[] тип, не {date, qty}[] — иначе structural subtyping
  // потеряет buyerPrice через RSC→client boundary и линия цены не отрендерится.
  const ordersTimeSeries: Record<string, DayPoint[]> = {}
  for (const nmId of visibleNmIds) {
    ordersTimeSeries[String(nmId)] = fillTimeSeries(byNm.get(nmId) ?? [])
  }

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 shrink-0">
        <form className="max-w-sm flex-1">
          <Input
            name="q"
            placeholder="Поиск по названию или артикулу…"
            defaultValue={q ?? ""}
          />
        </form>
        <div className="flex gap-2">
          <WbOrdersBackfillButton />
          <WbPricesRetroactiveBackfillButton />
          <WbUploadIuButton />
          <WbSyncRatingsButton />
          <WbSyncSppButton />
          <WbSyncButton />
        </div>
      </div>
      <WbFilters
        brandCategoryPairs={brandCategoryPairs}
        selectedBrands={selectedBrands}
        selectedCategories={selectedCategories}
        labelOptions={labelOptions}
        selectedLabels={selectedLabels}
      />
      <div className="flex-1 min-h-0 flex flex-col">
        <WbCardsTable
          cards={cards}
          linkedNmIds={Array.from(linkedNmIds)}
          currentPage={currentPage}
          totalPages={totalPages}
          totalCards={total}
          searchQuery={q ?? ""}
          pageSize={pageSize}
          sortBy={sortBy}
          sortDir={sortDir}
          selectedBrands={selectedBrands}
          selectedCategories={selectedCategories}
          selectedLabels={selectedLabels}
          ordersTimeSeries={ordersTimeSeries}
        />
      </div>
    </div>
  )
}
