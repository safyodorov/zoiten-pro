import { prisma } from "@/lib/prisma"
import { WbCardsTable } from "@/components/cards/WbCardsTable"
import { WbSyncButton } from "@/components/cards/WbSyncButton"
import { WbFilters } from "@/components/cards/WbFilters"
import { Input } from "@/components/ui/input"

const DEFAULT_PAGE_SIZE = 50

export default async function WbCardsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; page?: string; size?: string
    sort?: string; dir?: string
    brands?: string; categories?: string
  }>
}) {
  const { q, page: pageParam, size: sizeParam, sort, dir, brands: brandsParam, categories: categoriesParam } = await searchParams

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (q && q.trim()) {
    where.OR = [
      { name: { contains: q.trim(), mode: "insensitive" } },
      { article: { contains: q.trim(), mode: "insensitive" } },
    ]
  }

  // Фильтры по бренду и категории (множественный выбор через запятую)
  const selectedBrands = brandsParam ? brandsParam.split(",").filter(Boolean) : []
  const selectedCategories = categoriesParam ? categoriesParam.split(",").filter(Boolean) : []

  if (selectedBrands.length > 0) {
    where.brand = { in: selectedBrands }
  }
  if (selectedCategories.length > 0) {
    where.category = { in: selectedCategories }
  }

  const pageSize = [20, 50, 100].includes(Number(sizeParam)) ? Number(sizeParam) : DEFAULT_PAGE_SIZE
  const currentPage = Math.max(1, parseInt(pageParam ?? "1", 10))
  const skip = (currentPage - 1) * pageSize

  // Сортировка
  const sortBy = sort && ["brand", "category", "name", "createdAt"].includes(sort) ? sort : "createdAt"
  const sortDir = dir === "asc" ? "asc" : "desc"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderBy: any = { [sortBy]: sortDir }

  // Загружаем данные + уникальные значения для фильтров
  // Находим маркетплейс WB для проверки привязки
  const wbMarketplace = await prisma.marketplace.findFirst({ where: { slug: "wb" } })

  const [cards, total, allBrands, allCategories] = await Promise.all([
    prisma.wbCard.findMany({ where, orderBy, skip, take: pageSize }),
    prisma.wbCard.count({ where }),
    prisma.wbCard.findMany({ select: { brand: true }, distinct: ["brand"], where: { brand: { not: null } }, orderBy: { brand: "asc" } }),
    prisma.wbCard.findMany({ select: { category: true }, distinct: ["category"], where: { category: { not: null } }, orderBy: { category: "asc" } }),
  ])

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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <form className="max-w-sm flex-1">
          <Input
            name="q"
            placeholder="Поиск по названию или артикулу…"
            defaultValue={q ?? ""}
          />
        </form>
        <WbSyncButton />
      </div>
      <WbFilters
        brands={allBrands.map((b) => b.brand!).filter(Boolean)}
        categories={allCategories.map((c) => c.category!).filter(Boolean)}
        selectedBrands={selectedBrands}
        selectedCategories={selectedCategories}
      />
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
      />
    </div>
  )
}
