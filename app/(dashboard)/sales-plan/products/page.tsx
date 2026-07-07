// app/(dashboard)/sales-plan/products/page.tsx
// RSC: таб «Товары» — помесячные плановые уровни per товар.
// Образец: app/(dashboard)/prices/wb/page.tsx
//
// Phase 25 wave 4 (25-04)

import { prisma } from "@/lib/prisma"
import { requireSection, getSectionRole } from "@/lib/rbac"
import { loadSalesPlanInputs, loadFactDaily } from "@/lib/sales-plan/data"
import { computeSalesPlan } from "@/lib/sales-plan/engine"
import { computeEffectiveOrderEnabled } from "@/lib/sales-plan/virtual-purchases"
import { SalesPlanTabs } from "@/components/sales-plan/SalesPlanTabs"
import { PlanVersionBar } from "@/components/sales-plan/PlanVersionBar"
import type { PlanVersion } from "@/components/sales-plan/PlanVersionBar"
import { SalesPlanFilters } from "@/components/sales-plan/SalesPlanFilters"
import { ModelParamsBar } from "@/components/sales-plan/ModelParamsBar"
import { ProductPlanTable } from "@/components/sales-plan/ProductPlanTable"
import { SeasonalityBar } from "@/components/sales-plan/SeasonalityBar"
import type { ModelParams } from "@/lib/sales-plan/types"
import { Pencil, Eye } from "lucide-react"

// Статические классы кнопки (= buttonVariants({variant:"outline",size:"sm"})).
// buttonVariants нельзя вызывать здесь: components/ui/button.tsx — "use client",
// вызов client-функции из RSC падает в рантайме (Next.js client reference).
const MODE_TOGGLE_BTN_CLASS =
  "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg border text-[0.8rem] font-medium transition-all outline-none select-none h-7 gap-1.5 px-2.5 border-border bg-background hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:border-input dark:bg-input/30 dark:hover:bg-input/50"

// ── Горизонт H2-2026 ─────────────────────────────────────────────────────────

const HORIZON_FROM = "2026-07-01"
const HORIZON_TO   = "2026-12-31"
const MONTHS       = [
  "2026-07-01", "2026-08-01", "2026-09-01",
  "2026-10-01", "2026-11-01", "2026-12-01",
]

// ── Хелперы дат (UTC, без импорта) ───────────────────────────────────────────

function getMskTodayIso(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

async function getSettingNumber(key: string, defaultVal: number): Promise<number> {
  const row = await prisma.appSetting.findUnique({ where: { key } })
  if (!row) return defaultVal
  const n = Number(row.value)
  return Number.isFinite(n) ? n : defaultVal
}

async function getLeadTimeDays(key: "deliveryDays" | "returnDays", defaultVal: number): Promise<number> {
  const row2 = await prisma.appSetting.findUnique({ where: { key: "salesPlan.leadTimes2" } })
  if (row2) {
    try {
      const obj = JSON.parse(row2.value) as Record<string, number>
      if (typeof obj[key] === "number" && Number.isFinite(obj[key])) return obj[key]
    } catch { /* fallthrough */ }
  }
  const rowOld = await prisma.appSetting.findUnique({ where: { key: "salesPlan.leadTimes" } })
  if (rowOld) {
    try {
      const obj = JSON.parse(rowOld.value) as Record<string, number>
      if (typeof obj[key] === "number" && Number.isFinite(obj[key])) return obj[key]
    } catch { /* fallthrough */ }
  }
  return defaultVal
}

// ── Page ─────────────────────────────────────────────────────────────────────

interface SearchParams {
  mode?: string
  directions?: string
  brands?: string
  categories?: string
  subcategories?: string
  version?: string
}

export default async function SalesPlanProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireSection("SALES")
  const canManage = (await getSectionRole("SALES")) === "MANAGE"
  const sp = await searchParams
  const today = getMskTodayIso()

  const mode = sp.mode === "edit" ? "edit" : "compare"
  const versionId = sp.version
  const readOnly = mode !== "edit" || !canManage || Boolean(versionId)

  // Каскадные фильтры из searchParams
  const selectedDirectionIds = sp.directions?.split(",").filter(Boolean) ?? []
  const selectedBrandIds = sp.brands?.split(",").filter(Boolean) ?? []
  const selectedCategoryIds = sp.categories?.split(",").filter(Boolean) ?? []
  const selectedSubcategoryIds = sp.subcategories?.split(",").filter(Boolean) ?? []

  // ── Параметры модели из AppSetting ──────────────────────────────────────────
  const [deliveryDays, returnDays, wbInboundLagDays, transitDays, defaultLeadTimeDays, safetyStockDays, vpCoverDays] =
    await Promise.all([
      getLeadTimeDays("deliveryDays", 3),
      getLeadTimeDays("returnDays", 3),
      getSettingNumber("salesPlan.wbInboundLagDays", 0),
      getSettingNumber("salesPlan.transitDays", 20),
      getSettingNumber("salesPlan.defaultLeadTimeDays", 45),
      getSettingNumber("salesPlan.safetyStockDays", 14),
      getSettingNumber("salesPlan.vpCoverDays", 60),
    ])

  const modelParams: ModelParams = {
    deliveryDays,
    returnDays,
    wbInboundLagDays,
    transitDays,
    defaultLeadTimeDays,
    safetyStockDays,
    vpCoverDays,
  }

  // ── Версии плана ────────────────────────────────────────────────────────────
  const activeVersionSetting = await prisma.appSetting.findUnique({
    where: { key: "salesPlan.activeVersionId" },
  })
  const activeVersionId = activeVersionSetting?.value ?? null
  const allVersions = await prisma.salesPlanVersion.findMany({
    select: { id: true, label: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  })
  const versionsForBar: PlanVersion[] = allVersions.map((v) => ({
    id: v.id,
    label: v.label,
    createdAt: v.createdAt.toISOString(),
  }))

  // ── Загрузка данных ─────────────────────────────────────────────────────────
  const inputs = await loadSalesPlanInputs(prisma, {
    today,
    horizonFrom: HORIZON_FROM,
    horizonTo: HORIZON_TO,
    deliveryDays,
    returnDays,
    wbInboundLagDays,
    transitDays,
    defaultLeadTimeDays,
    safetyStockDays,
    vpCoverDays,
  })

  const planResult = computeSalesPlan(inputs)

  // Факт за горизонт
  const factData = await loadFactDaily(prisma, HORIZON_FROM, today)

  // Фото товаров
  const productPhotoMap = new Map<string, string | null>()
  {
    const productIds = inputs.products.map((p) => p.productId)
    const photos = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, photoUrl: true },
    })
    for (const ph of photos) productPhotoMap.set(ph.id, ph.photoUrl)
  }

  // dayOverrideMonths — для маркера •д в ячейках
  const dayOverrideMonthsMap = new Map<string, string[]>()
  {
    const productIds = inputs.products.map((p) => p.productId)
    const overrides = await prisma.salesPlanDayOverride.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, date: true },
    })
    for (const ov of overrides) {
      const m = ov.date.toISOString().slice(0, 7) + "-01"
      const pid = ov.productId
      const existing = dayOverrideMonthsMap.get(pid) ?? []
      if (!existing.includes(m)) existing.push(m)
      dayOverrideMonthsMap.set(pid, existing)
    }
  }

  // ── Каскадные опции фильтров (FK-поля — паттерн CLAUDE.md) ─────────────────
  const [directions, brands, categories, subcategories] = await Promise.all([
    prisma.productDirection.findMany({
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.brand.findMany({
      select: { id: true, name: true, directionId: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.category.findMany({
      select: { id: true, name: true, brandId: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.subcategory.findMany({
      select: { id: true, name: true, categoryId: true },
      orderBy: { sortOrder: "asc" },
    }),
  ])

  // Индексы сезонности: черновик (versionId=null) или просматриваемая версия
  const seasonalityRaw = await prisma.salesPlanSeasonality.findMany({
    where: { versionId: versionId ?? null },
    select: { scope: true, scopeId: true, month: true, indexPct: true },
  })
  const seasonalityRows = seasonalityRaw.map((s) => ({
    scope: s.scope as string,
    scopeId: s.scopeId,
    month: s.month.toISOString().slice(0, 10),
    indexPct: s.indexPct,
  }))
  const currentMonthIso = today.slice(0, 7) + "-01"
  // Категории с производным directionId (через бренд) — для каскада сезонности
  const brandDirMap = new Map(brands.map((b) => [b.id, b.directionId]))
  const categoriesForBar = categories.map((c) => ({
    id: c.id,
    name: c.name,
    directionId: c.brandId ? (brandDirMap.get(c.brandId) ?? null) : null,
  }))

  // ── Применяем каскадные фильтры к товарам ──────────────────────────────────
  const productResultMap = new Map(planResult.products.map((pr) => [pr.productId, pr]))

  const filteredProducts = inputs.products.filter((p) => {
    if (selectedDirectionIds.length > 0 && !selectedDirectionIds.includes(p.directionId ?? "")) return false
    if (selectedBrandIds.length > 0 && !selectedBrandIds.includes(p.brandId ?? "")) return false
    if (selectedCategoryIds.length > 0 && !selectedCategoryIds.includes(p.categoryId ?? "")) return false
    if (selectedSubcategoryIds.length > 0 && !selectedSubcategoryIds.includes(p.subcategoryId ?? "")) return false
    return true
  })

  // ── Сериализуем данные для клиента ─────────────────────────────────────────
  // Факт per-товар — по дате реализации (redemptionByProduct, НЕТТО), не когортный funnel.
  // Примечание: funnel byProduct в loadFactDaily НЕ удалён — может пригодиться Сводному.
  const factByProduct: Record<string, Record<string, {
    buyoutsRub: number; ordersRub: number; buyoutsUnits: number; ordersUnits: number
  }>> = {}

  for (const [productId, dateMap] of factData.redemptionByProduct.entries()) {
    factByProduct[productId] = {}
    for (const [date, row] of dateMap.entries()) {
      factByProduct[productId][date] = {
        buyoutsRub: row.buyoutsRub,
        ordersRub: row.ordersRub,
        buyoutsUnits: row.buyoutsUnits,
        ordersUnits: row.ordersUnits,
      }
    }
  }

  // ── D-4: pro-rata план активной версии для прошедших дней ──────────────────
  // versionPastPlanByProduct[productId][monthIso] = Σ planBuyoutsRub по дням ≤ today−1
  // versionPastUnitsByProduct — то же в штуках (для строки «план · шт» текущего/прошлых месяцев)
  const versionPastPlanByProduct: Record<string, Record<string, number>> = {}
  const versionPastUnitsByProduct: Record<string, Record<string, number>> = {}
  if (activeVersionId) {
    const yesterday = new Date(new Date(today + "T00:00:00Z").getTime() - 86_400_000)
      .toISOString().slice(0, 10)
    const versionDays = await prisma.salesPlanVersionDay.findMany({
      where: {
        versionId: activeVersionId,
        date: { gte: new Date(HORIZON_FROM + "T00:00:00Z"), lte: new Date(yesterday + "T00:00:00Z") },
      },
      select: { productId: true, date: true, planBuyoutsRub: true, planBuyoutsUnits: true },
    })
    for (const r of versionDays) {
      const monthIso = r.date.toISOString().slice(0, 7) + "-01"
      const pid = r.productId
      if (!versionPastPlanByProduct[pid]) versionPastPlanByProduct[pid] = {}
      if (!versionPastUnitsByProduct[pid]) versionPastUnitsByProduct[pid] = {}
      versionPastPlanByProduct[pid][monthIso] =
        (versionPastPlanByProduct[pid][monthIso] ?? 0) + r.planBuyoutsRub
      versionPastUnitsByProduct[pid][monthIso] =
        (versionPastUnitsByProduct[pid][monthIso] ?? 0) + r.planBuyoutsUnits
    }
  }

  // Строки таблицы
  const tableProducts = filteredProducts.map((p) => {
    const pr = productResultMap.get(p.productId)
    return {
      productId: p.productId,
      sku: p.sku,
      name: p.name,
      photoUrl: productPhotoMap.get(p.productId) ?? null,
      stockNow: p.stockNow,
      baselineOrdersPerDay: p.baselineOrdersPerDay,
      avgPriceRub: p.avgPriceRub,
      currentLevels: Object.fromEntries(
        p.monthLevels.map((ml) => [ml.month, ml.targetOrdersPerDay]),
      ),
      dayOverrideMonths: dayOverrideMonthsMap.get(p.productId) ?? [],
      arrivals: p.arrivals,
      abcStatus: p.abcStatus ?? null,
      orderEnabled: p.orderEnabled ?? true,
      effectiveOrderEnabled: computeEffectiveOrderEnabled(p.abcStatus, p.orderEnabled),
      versionPastPlanRub: versionPastPlanByProduct[p.productId] ?? {},
      versionPastPlanUnits: versionPastUnitsByProduct[p.productId] ?? {},
      planResult: pr ?? {
        productId: p.productId,
        days: [],
        monthTotals: [],
        firstStockoutDate: null,
        lostUnitsToStockout: 0,
        lostRubToStockout: 0,
      },
    }
  })

  // Тулбар: кнопка «Редактировать» / «Просмотр»
  const modeToggleUrl = mode === "edit" ? "/sales-plan/products" : "/sales-plan/products?mode=edit"

  return (
    <div className="flex flex-col h-full gap-3 p-4">
      {/* Табы */}
      <SalesPlanTabs />

      {/* Бар версий */}
      <PlanVersionBar
        versions={versionsForBar}
        activeVersionId={activeVersionId}
        currentVersionId={versionId ?? null}
        canManage={canManage}
        readOnly={readOnly}
        drift={null}
      />

      {/* Режим + кнопка переключения */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          Режим: <strong>{mode === "edit" ? "Редактирование" : "Просмотр"}</strong>
        </span>
        {canManage && !versionId && (
          <a
            href={modeToggleUrl}
            className={MODE_TOGGLE_BTN_CLASS}
          >
            {mode === "edit"
              ? <><Eye className="h-3.5 w-3.5" /> Просмотр</>
              : <><Pencil className="h-3.5 w-3.5" /> Редактировать</>}
          </a>
        )}
      </div>

      {/* Параметры модели */}
      <ModelParamsBar params={modelParams} readOnly={!canManage} />

      {/* Фильтры */}
      <SalesPlanFilters
        directions={directions}
        brands={brands}
        categories={categories}
        subcategories={subcategories}
        selectedDirectionIds={selectedDirectionIds}
        selectedBrandIds={selectedBrandIds}
        selectedCategoryIds={selectedCategoryIds}
        selectedSubcategoryIds={selectedSubcategoryIds}
        basePath="/sales-plan/products"
      />

      {/* Сезонность */}
      <SeasonalityBar
        directions={directions}
        categories={categoriesForBar}
        subcategories={subcategories}
        months={MONTHS}
        currentMonth={currentMonthIso}
        rows={seasonalityRows}
        readOnly={readOnly}
      />

      {/* Таблица */}
      <div className="flex-1 min-h-0 border rounded-md overflow-hidden">
        <ProductPlanTable
          products={tableProducts}
          months={MONTHS}
          mode={mode as "compare" | "edit"}
          readOnly={readOnly}
          canManage={canManage}
          factByProduct={factByProduct}
          today={today}
        />
      </div>
    </div>
  )
}
