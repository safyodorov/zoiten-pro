// app/(dashboard)/stock/page.tsx
// Phase 14 (STOCK-16): RSC главная страница /stock — Product-level остатки.
//
// Шапка: TurnoverNormInput (норма) + IvanovoUploadButton + WbRefreshButton
// Фильтры: StockFilters (бренд/категория/подкатегория + deficit toggle)
// Таблица: StockProductTable (sticky 4 cols, 6 групп, rowSpan, цветовой Д, inline production input)
//
// Примечание: Plan 14-07 добавит StockTabs для переключения /stock /stock/wb /stock/ozon.
// В этом плане таблица — единственное содержимое /stock (без tabs).

import { requireSection } from "@/lib/rbac"
import {
  getStockData,
  getStockFilterOptions,
  type StockFilters as StockFiltersType,
} from "@/lib/stock-data"
import { StockFilters } from "@/components/stock/StockFilters"
import { StockProductTable } from "@/components/stock/StockProductTable"
import { TurnoverNormInput } from "@/components/stock/TurnoverNormInput"
import { WbRefreshButton } from "@/components/stock/WbRefreshButton"
import { IvanovoUploadButton } from "@/components/stock/IvanovoUploadButton"

export const metadata = {
  title: "Управление остатками",
}

// Next.js 15: searchParams — Promise<Record<string, string | string[] | undefined>>
interface PageProps {
  searchParams: Promise<{
    brands?: string
    categories?: string
    subcategories?: string
    deficit?: string
  }>
}

export default async function StockPage({ searchParams }: PageProps) {
  await requireSection("STOCK")

  const params = await searchParams

  const filters: StockFiltersType = {
    brandIds: params.brands?.split(",").filter(Boolean),
    categoryIds: params.categories?.split(",").filter(Boolean),
    subcategoryIds: params.subcategories?.split(",").filter(Boolean),
    onlyDeficit: params.deficit === "1",
  }

  // Параллельный fetch данных и опций фильтров
  const [stockData, filterOptions] = await Promise.all([
    getStockData(filters),
    getStockFilterOptions(),
  ])

  return (
    <div className="space-y-6">
      {/* Шапка: TurnoverNormInput слева, кнопки справа */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <TurnoverNormInput initialDays={stockData.turnoverNormDays} />
        <div className="flex gap-2 ml-auto">
          <IvanovoUploadButton />
          <WbRefreshButton />
        </div>
      </div>

      {/* Фильтры */}
      <StockFilters
        brands={filterOptions.brands}
        categories={filterOptions.categories}
        subcategories={filterOptions.subcategories}
      />

      {/* Таблица Product-level остатков */}
      <StockProductTable
        products={stockData.products}
        turnoverNormDays={stockData.turnoverNormDays}
      />
    </div>
  )
}
