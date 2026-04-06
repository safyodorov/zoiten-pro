import { prisma } from "@/lib/prisma"
import { WbCardsTable } from "@/components/cards/WbCardsTable"
import { WbSyncButton } from "@/components/cards/WbSyncButton"
import { Input } from "@/components/ui/input"

const DEFAULT_PAGE_SIZE = 50

export default async function WbCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; size?: string; sort?: string; dir?: string }>
}) {
  const { q, page: pageParam, size: sizeParam, sort, dir } = await searchParams

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (q && q.trim()) {
    where.OR = [
      { name: { contains: q.trim(), mode: "insensitive" } },
      { article: { contains: q.trim(), mode: "insensitive" } },
    ]
  }

  const pageSize = [20, 50, 100].includes(Number(sizeParam)) ? Number(sizeParam) : DEFAULT_PAGE_SIZE
  const currentPage = Math.max(1, parseInt(pageParam ?? "1", 10))
  const skip = (currentPage - 1) * pageSize

  // Сортировка
  const sortBy = sort && ["brand", "category", "name", "createdAt"].includes(sort) ? sort : "createdAt"
  const sortDir = dir === "asc" ? "asc" : "desc"

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderBy: any = { [sortBy]: sortDir }

  const [cards, total] = await Promise.all([
    prisma.wbCard.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
    }),
    prisma.wbCard.count({ where }),
  ])

  const totalPages = Math.ceil(total / pageSize)

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
      <WbCardsTable
        cards={cards}
        currentPage={currentPage}
        totalPages={totalPages}
        totalCards={total}
        searchQuery={q ?? ""}
        pageSize={pageSize}
        sortBy={sortBy}
        sortDir={sortDir}
      />
    </div>
  )
}
