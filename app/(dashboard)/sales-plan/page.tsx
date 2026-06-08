// app/(dashboard)/sales-plan/page.tsx
// План продаж — прогноз выкупов до заданной даты, с разрезами по товарам.

import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { computeForecast, getMskTodayIso } from "@/lib/sales-forecast"
import { SalesForecastSummary } from "@/components/sales-plan/SalesForecastSummary"
import { SalesForecastFilters } from "@/components/sales-plan/SalesForecastFilters"
import { SalesForecastEndDate } from "@/components/sales-plan/SalesForecastEndDate"
import { SalesForecastTable } from "@/components/sales-plan/SalesForecastTable"
import { SalesForecastDailyChart } from "@/components/sales-plan/SalesForecastDailyChart"

const BASELINE_OVERRIDES_KEY = "salesPlan.baselineOverrides"
const PRICE_OVERRIDES_KEY = "salesPlan.priceOverrides"
const LEAD_TIMES_KEY = "salesPlan.leadTimes"
const DEFAULT_DELIVERY_DAYS = 3
const DEFAULT_RETURN_DAYS = 3

const DEFAULT_END_DATE = "2026-06-30"
const DEFAULT_CHART_END = "2026-07-31"

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
  // Chart-горизонт — фиксированный (до 31.07), либо endDate, если он больше
  const chartEndDate = endDate > DEFAULT_CHART_END ? endDate : DEFAULT_CHART_END

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

  // Глобальные корректировки плана (общие для всех) — из AppSetting (JSON-строки).
  const settingsRows = await prisma.appSetting.findMany({
    where: { key: { in: [BASELINE_OVERRIDES_KEY, PRICE_OVERRIDES_KEY, LEAD_TIMES_KEY] } },
    select: { key: true, value: true },
  })
  const settingByKey = new Map(settingsRows.map((s) => [s.key, s.value]))

  function parseJsonObject(raw: string | undefined): Record<string, unknown> {
    if (!raw) return {}
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  }

  const baselineOverrides: Record<string, number> = {}
  for (const [k, v] of Object.entries(parseJsonObject(settingByKey.get(BASELINE_OVERRIDES_KEY)))) {
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) baselineOverrides[k] = v
  }
  const priceOverrides: Record<string, number> = {}
  for (const [k, v] of Object.entries(parseJsonObject(settingByKey.get(PRICE_OVERRIDES_KEY)))) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) priceOverrides[k] = v
  }
  let deliveryDaysOverride: number | undefined
  let returnDaysOverride: number | undefined
  const leadRaw = parseJsonObject(settingByKey.get(LEAD_TIMES_KEY))
  if (typeof leadRaw.deliveryDays === "number" && leadRaw.deliveryDays >= 0) {
    deliveryDaysOverride = leadRaw.deliveryDays
  }
  if (typeof leadRaw.returnDays === "number" && leadRaw.returnDays >= 0) {
    returnDaysOverride = leadRaw.returnDays
  }

  const [forecast, allBrands, allCategories, allSubcategories, allDirections] =
    await Promise.all([
      computeForecast({
        endDate,
        chartEndDate,
        today,
        baselineOverrides,
        priceOverrides,
        deliveryDaysOverride,
        returnDaysOverride,
      }),
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

  // Агрегируем dailySales по видимым товарам — для chart.
  // Дополнительно разбиваем выручку по направлениям (Одежда / Бытовая техника / Прочее)
  // для двухцветных stacked-баров.
  type DirBucket = "clothing" | "appliances" | "other"
  function bucketOf(name: string | null): DirBucket {
    if (name === "Одежда") return "clothing"
    if (name === "Бытовая техника") return "appliances"
    return "other"
  }
  interface DailyAgg {
    units: number
    rub: number
    rubClothing: number
    rubAppliances: number
    rubOther: number
    unitsClothing: number
    unitsAppliances: number
    unitsOther: number
  }
  function emptyAgg(): DailyAgg {
    return {
      units: 0,
      rub: 0,
      rubClothing: 0,
      rubAppliances: 0,
      rubOther: 0,
      unitsClothing: 0,
      unitsAppliances: 0,
      unitsOther: 0,
    }
  }
  const dailyByDate = new Map<string, DailyAgg>()
  for (const p of visible) {
    const b = bucketOf(p.directionName)
    for (const d of p.dailySales) {
      const cur = dailyByDate.get(d.date) ?? emptyAgg()
      cur.units += d.units
      cur.rub += d.rub
      if (b === "clothing") {
        cur.rubClothing += d.rub
        cur.unitsClothing += d.units
      } else if (b === "appliances") {
        cur.rubAppliances += d.rub
        cur.unitsAppliances += d.units
      } else {
        cur.rubOther += d.rub
        cur.unitsOther += d.units
      }
      dailyByDate.set(d.date, cur)
    }
  }
  function fmtDayLabel(iso: string): string {
    const dt = new Date(iso + "T00:00:00Z")
    return dt.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "UTC",
    })
  }
  const sortedDates = Array.from(dailyByDate.keys()).sort()
  const chartData = sortedDates.map((date) => {
    const a = dailyByDate.get(date)!
    return {
      date,
      label: fmtDayLabel(date),
      units: a.units,
      rub: a.rub,
      rubClothing: a.rubClothing,
      rubAppliances: a.rubAppliances,
      rubOther: a.rubOther,
      unitsClothing: a.unitsClothing,
      unitsAppliances: a.unitsAppliances,
      unitsOther: a.unitsOther,
    }
  })

  // endStockDateLabel — день после endDate (по умолчанию 01.07)
  function isoAddOne(iso: string): string {
    const dt = new Date(iso + "T00:00:00Z")
    dt.setUTCDate(dt.getUTCDate() + 1)
    return dt.toISOString().slice(0, 10)
  }
  const endStockIso = isoAddOne(endDate)
  const endStockDateLabel = fmtDayLabel(endStockIso)
  const accountingEndLabel = fmtDayLabel(endDate)

  return (
    <div className="h-full flex flex-col gap-4 min-h-0">
      <div className="flex-none space-y-4">
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

      <SalesForecastDailyChart
        data={chartData}
        accountingEndDate={endDate}
        accountingEndLabel={accountingEndLabel}
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
      </div>

      <SalesForecastTable
        products={visible}
        endStockDateLabel={endStockDateLabel}
        currentOverrides={baselineOverrides}
        currentPriceOverrides={priceOverrides}
        currentDeliveryDays={forecast.deliveryDays}
        currentReturnDays={forecast.returnDays}
        defaultDeliveryDays={DEFAULT_DELIVERY_DAYS}
        defaultReturnDays={DEFAULT_RETURN_DAYS}
      />

      <details className="text-xs text-muted-foreground rounded-md border bg-muted/30 p-3 flex-none">
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
            (buyouts/orders из funnel) на settled-окне{" "}
            <code>[today−37; today−7]</code>. Сдвиг на 7 дней назад
            исключает «свежие» заказы, по которым выкупы ещё не материализовались
            (T+3 лаг доставки) — без сдвига % занижается на 15-20 п.п. Если своей
            истории нет — fallback по цепочке: legacy{" "}
            <code>WbCard.buyoutPercent</code> →{" "}
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
