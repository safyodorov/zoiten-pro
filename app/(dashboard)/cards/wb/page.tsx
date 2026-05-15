import { prisma } from "@/lib/prisma"
import { WbCardsTable } from "@/components/cards/WbCardsTable"
import { WbSyncButton } from "@/components/cards/WbSyncButton"
import { WbSyncSppButton } from "@/components/cards/WbSyncSppButton"
import { WbSyncRatingsButton } from "@/components/cards/WbSyncRatingsButton"
import { WbUploadIuButton } from "@/components/cards/WbUploadIuButton"
import { WbFilters } from "@/components/cards/WbFilters"
import { Input } from "@/components/ui/input"
import { getPageSizePref } from "@/app/actions/user-preferences"

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
  const sortBy = sort && ["brand", "category", "name", "createdAt", "stockQty"].includes(sort) ? sort : "createdAt"
  const sortDir = dir === "asc" ? "asc" : "desc"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderBy: any = { [sortBy]: sortDir }

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
        />
      </div>
    </div>
  )
}
