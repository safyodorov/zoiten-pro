import { prisma } from "@/lib/prisma"
import { WbCardsTable } from "@/components/cards/WbCardsTable"
import { WbSyncButton } from "@/components/cards/WbSyncButton"
import { Input } from "@/components/ui/input"

const PAGE_SIZE = 20

export default async function WbCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const { q, page: pageParam } = await searchParams

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (q && q.trim()) {
    where.OR = [
      { name: { contains: q.trim(), mode: "insensitive" } },
      { article: { contains: q.trim(), mode: "insensitive" } },
    ]
  }

  const currentPage = Math.max(1, parseInt(pageParam ?? "1", 10))
  const skip = (currentPage - 1) * PAGE_SIZE

  const [cards, total] = await Promise.all([
    prisma.wbCard.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
    }),
    prisma.wbCard.count({ where }),
  ])

  const totalPages = Math.ceil(total / PAGE_SIZE)

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
      <p className="text-sm text-muted-foreground">
        Всего карточек: {total}
      </p>
      <WbCardsTable
        cards={cards}
        currentPage={currentPage}
        totalPages={totalPages}
        searchQuery={q ?? ""}
      />
    </div>
  )
}
