// app/(dashboard)/stock/wb/page.tsx
// Phase 14 (STOCK-22, STOCK-25): RSC /stock/wb — nmId-level с кластерами.
// Quick 260422-oy5: per-user фильтр скрытых WB-складов (User.stockWbHiddenWarehouses).
// 2026-05-11: каскадные фильтры Направление → Бренд → Категория → Подкатегория.

import { requireSection } from "@/lib/rbac"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getStockWbData } from "@/lib/stock-wb-data"
import { getStockFilterOptions } from "@/lib/stock-data"
import { StockWbTable } from "@/components/stock/StockWbTable"
import { StockWbFilters } from "@/components/stock/StockWbFilters"

export const metadata = {
  title: "Управление остатками — WB склады",
}

interface PageProps {
  searchParams: Promise<{
    directions?: string
    brands?: string
    categories?: string
    subcategories?: string
  }>
}

export default async function StockWbPage({ searchParams }: PageProps) {
  await requireSection("STOCK")

  const params = await searchParams
  const filters = {
    directionIds: params.directions?.split(",").filter(Boolean),
    brandIds: params.brands?.split(",").filter(Boolean),
    categoryIds: params.categories?.split(",").filter(Boolean),
    subcategoryIds: params.subcategories?.split(",").filter(Boolean),
  }

  const [data, filterOptions, session] = await Promise.all([
    getStockWbData(filters),
    getStockFilterOptions(),
    auth(),
  ])

  // Quick 260422-oy5: per-user фильтр скрытых WB-складов
  // Phase 16 (STOCK-35): per-user toggle кнопки «По размерам»
  let hiddenWarehouseIds: number[] = []
  let initialShowSizes = false
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { stockWbHiddenWarehouses: true, stockWbShowSizes: true },
    })
    hiddenWarehouseIds = user?.stockWbHiddenWarehouses ?? []
    initialShowSizes = user?.stockWbShowSizes ?? false
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-4">
      <div className="shrink-0">
        <StockWbFilters
          directions={filterOptions.directions}
          brands={filterOptions.brands}
          categories={filterOptions.categories}
          subcategories={filterOptions.subcategories}
        />
      </div>

      {data.groups.length === 0 ? (
        <div className="flex-1 min-h-0 text-center py-16">
          <h3 className="text-sm font-medium">Остатки WB не загружены</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Нажмите «Обновить из WB» на странице{" "}
            <a href="/stock" className="underline">Остатки</a>
            , чтобы загрузить актуальные данные по складам.
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <StockWbTable
            groups={data.groups}
            turnoverNormDays={data.turnoverNormDays}
            clusterWarehouses={data.clusterWarehouses}
            hiddenWarehouseIds={hiddenWarehouseIds}
            initialShowSizes={initialShowSizes}
          />
        </div>
      )}
    </div>
  )
}
