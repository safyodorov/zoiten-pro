// app/(dashboard)/sales-plan/page.tsx
// План продаж — прогноз выкупов до заданной даты, с разрезами по товарам.

import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { computeForecast, getMskTodayIso } from "@/lib/sales-forecast"
import { SalesForecastSummary } from "@/components/sales-plan/SalesForecastSummary"
import { SalesForecastFilters } from "@/components/sales-plan/SalesForecastFilters"
import { SalesForecastEndDate } from "@/components/sales-plan/SalesForecastEndDate"
import { SalesForecastTable } from "@/components/sales-plan/SalesForecastTable"

const DEFAULT_END_DATE = "2026-06-30"

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime())
}

export default async function SalesPlanPage({
  searchParams,
}: {
  searchParams: Promise<{
    end?: string
    q?: string
    brands?: string
    categories?: string
    subcategories?: string
    directions?: string
  }>
}) {
  await requireSection("SALES")
  const today = getMskTodayIso()
  const {
    end: endParam,
    q,
    brands: brandsParam,
    categories: categoriesParam,
    subcategories: subcategoriesParam,
    directions: directionsParam,
  } = await searchParams

  let endDate = DEFAULT_END_DATE
  if (endParam && isValidDate(endParam) && endParam >= today) {
    endDate = endParam
  }
  if (endDate < today) endDate = today

  const selectedBrandIds = brandsParam ? brandsParam.split(",").filter(Boolean) : []
  const selectedCategoryIds = categoriesParam
    ? categoriesParam.split(",").filter(Boolean)
    : []
  const selectedSubcategoryIds = subcategoriesParam
    ? subcategoriesParam.split(",").filter(Boolean)
    : []
  const selectedDirectionIds = directionsParam
    ? directionsParam.split(",").filter(Boolean)
    : []
  const search = (q ?? "").trim()

  const [forecast, allBrands, allCategories, allSubcategories, allDirections] =
    await Promise.all([
      computeForecast({ endDate, today }),
      prisma.brand.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, directionId: true },
      }),
      prisma.category.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, brandId: true },
      }),
      prisma.subcategory.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, categoryId: true },
      }),
      prisma.productDirection.findMany({
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      }),
    ])

  // In-memory фильтрация — прогноз считается один раз для всех товаров, потом filter
  let visible = forecast.products
  if (search) {
    const term = search.toLocaleLowerCase("ru")
    visible = visible.filter(
      (p) =>
        p.name.toLocaleLowerCase("ru").includes(term) ||
        p.sku.toLocaleLowerCase("ru").includes(term),
    )
  }
  if (selectedDirectionIds.length > 0) {
    visible = visible.filter(
      (p) => p.directionId && selectedDirectionIds.includes(p.directionId),
    )
  }
  if (selectedBrandIds.length > 0) {
    visible = visible.filter((p) => selectedBrandIds.includes(p.brandId))
  }
  if (selectedCategoryIds.length > 0) {
    visible = visible.filter(
      (p) => p.categoryId && selectedCategoryIds.includes(p.categoryId),
    )
  }
  if (selectedSubcategoryIds.length > 0) {
    visible = visible.filter(
      (p) => p.subcategoryId && selectedSubcategoryIds.includes(p.subcategoryId),
    )
  }

  const totalOrders = visible.reduce((s, p) => s + p.ordersUnits, 0)
  const totalSalesUnits = visible.reduce((s, p) => s + p.salesUnits, 0)
  const totalSalesRub = visible.reduce((s, p) => s + p.salesRub, 0)
  const subcatFallbackInView = visible.filter(
    (p) => p.buyoutSource === "subcategory",
  ).length
  const globalFallbackInView = visible.filter(
    (p) => p.buyoutSource === "global",
  ).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-muted-foreground">
          Прогноз выкупов по дневной симуляции (заказы → T+3 → выкуп)
        </div>
        <SalesForecastEndDate value={endDate} minDate={today} />
      </div>

      <SalesForecastSummary
        totalOrders={totalOrders}
        totalSalesUnits={totalSalesUnits}
        totalSalesRub={totalSalesRub}
        productsCount={visible.length}
        subcategoryFallbackCount={subcatFallbackInView}
        globalFallbackCount={globalFallbackInView}
        globalBuyoutPct={forecast.globalBuyoutPct}
        today={forecast.today}
        endDate={forecast.endDate}
      />

      <SalesForecastFilters
        directions={allDirections}
        brands={allBrands}
        categories={allCategories}
        subcategories={allSubcategories}
        selectedDirectionIds={selectedDirectionIds}
        selectedBrandIds={selectedBrandIds}
        selectedCategoryIds={selectedCategoryIds}
        selectedSubcategoryIds={selectedSubcategoryIds}
        search={search}
      />

      <SalesForecastTable products={visible} />

      <details className="text-xs text-muted-foreground rounded-md border bg-muted/30 p-3">
        <summary className="cursor-pointer font-medium text-foreground">
          Как считается прогноз
        </summary>
        <div className="mt-2 space-y-1 leading-relaxed">
          <p>
            • <strong>База заказов</strong> = средние заказы за последние 7 дней
            (по WB orders daily, агрегированы по всем nmId товара).
          </p>
          <p>
            • <strong>План после прихода</strong> (если задан в /purchase-plan) —
            target заказов в шт/день; ставка линейно растёт от базы к target за
            3 рабочих дня, начиная со дня после <code>expectedDate</code>.
          </p>
          <p>
            • <strong>Сток</strong> = текущий <code>WbCard.stockQty</code>;
            приходы из <code>ProductIncoming.orderedQty</code> пополняют сток на
            <code> expectedDate + 1</code>. Возвраты (1 − % выкупа) возвращаются
            на T+6 от даты заказа.
          </p>
          <p>
            • <strong>% выкупа</strong> — взвешенный 30-дневный
            (buyouts/orders из funnel). Если своей истории нет — fallback по
            цепочке: legacy <code>WbCard.buyoutPercent</code> →{" "}
            <span className="text-blue-600 dark:text-blue-500">
              среднее по подкатегории
            </span>{" "}
            (↑) →{" "}
            <span className="text-amber-600 dark:text-amber-500">
              глобальное среднее
            </span>{" "}
            (*).
          </p>
          <p>
            • <strong>Выкупы</strong> засчитываются на T+3 от заказа. В горизонт
            попадают только заказы с T+3 ≤ конечная дата.
          </p>
          <p>
            • <strong>Цена выкупа</strong> — взвешенная по qty
            <code> WbCardOrdersDaily.buyerPrice</code> за последние 7 дней,
            fallback на <code>WbCard.price</code>.
          </p>
        </div>
      </details>
    </div>
  )
}
