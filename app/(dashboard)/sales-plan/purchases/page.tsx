// app/(dashboard)/sales-plan/purchases/page.tsx
// RSC — таб «Пора заказывать»: список VirtualPurchase с фильтрами по статусу.
// Phase 25-07 (Task 3)

import { prisma } from "@/lib/prisma"
import { requireSection, getSectionRole } from "@/lib/rbac"
import { loadSalesPlanInputs } from "@/lib/sales-plan/data"
import { computeSalesPlan } from "@/lib/sales-plan/engine"
import { SalesPlanTabs } from "@/components/sales-plan/SalesPlanTabs"
import { SalesPlanFilters } from "@/components/sales-plan/SalesPlanFilters"
import { VirtualPurchasesTable } from "@/components/sales-plan/VirtualPurchasesTable"

// ── Горизонт H2-2026 ─────────────────────────────────────────────────────────

const HORIZON_FROM = "2026-07-01"
const HORIZON_TO = "2026-12-31"

// ── Хелперы ───────────────────────────────────────────────────────────────────

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
  return defaultVal
}

// ── Row type для передачи в клиент ───────────────────────────────────────────

export interface VirtualPurchaseRow {
  id: string
  productId: string
  sku: string
  name: string
  stockNow: number
  baselineOrdersPerDay: number
  orderDate: string          // ISO "2026-08-12"
  expectedArrivalDate: string
  leadTimeDaysUsed: number | null
  qty: number
  unitPrice: string | null   // Decimal → string
  currency: string
  source: string
  status: "SUGGESTED" | "ACCEPTED" | "DISMISSED" | "CONVERTED"
  supplierId: string | null
  supplierNameForeign: string | null
  supplierNameEnglish: string | null
  // computed
  stockoutDate: string | null  // firstStockoutDate из simulations
  isOverdue: boolean           // orderDate < today
}

// ── Page ─────────────────────────────────────────────────────────────────────

interface SearchParams {
  status?: string
  directions?: string
  brands?: string
  categories?: string
  subcategories?: string
}

export default async function SalesPlanPurchasesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireSection("SALES")
  const canManage = (await getSectionRole("SALES")) === "MANAGE"
  const sp = await searchParams
  const today = getMskTodayIso()

  // ── Сегмент-фильтр статуса ────────────────────────────────────────────────

  const VALID_STATUSES = ["suggested", "accepted", "dismissed", "all"] as const
  type StatusFilter = (typeof VALID_STATUSES)[number]
  const statusFilter: StatusFilter =
    VALID_STATUSES.includes(sp.status as StatusFilter)
      ? (sp.status as StatusFilter)
      : "suggested"

  // ── Каскадные фильтры ─────────────────────────────────────────────────────

  const selectedDirectionIds = sp.directions?.split(",").filter(Boolean) ?? []
  const selectedBrandIds = sp.brands?.split(",").filter(Boolean) ?? []
  const selectedCategoryIds = sp.categories?.split(",").filter(Boolean) ?? []
  const selectedSubcategoryIds = sp.subcategories?.split(",").filter(Boolean) ?? []

  // ── Параметры модели из AppSetting ────────────────────────────────────────

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

  // ── Загрузка плана ────────────────────────────────────────────────────────

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

  // stockoutDate per productId
  const stockoutMap = new Map<string, string | null>()
  for (const pr of planResult.products) {
    stockoutMap.set(pr.productId, pr.firstStockoutDate)
  }

  // stockNow + baselineOrdersPerDay из inputs
  const productInputMap = new Map(inputs.products.map((p) => [p.productId, p]))

  // ── Каскадные опции фильтров ──────────────────────────────────────────────

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

  // ── Загрузка виртуальных закупок ─────────────────────────────────────────

  // Строим where по статусу
  const vpStatusAll = ["SUGGESTED", "ACCEPTED", "DISMISSED"] as ("SUGGESTED" | "ACCEPTED" | "DISMISSED")[]
  const statusWhere =
    statusFilter === "all"
      ? { status: { in: vpStatusAll } }
      : statusFilter === "suggested"
        ? { status: "SUGGESTED" as const }
        : statusFilter === "accepted"
          ? { status: "ACCEPTED" as const }
          : { status: "DISMISSED" as const }

  const vpAll = await prisma.virtualPurchase.findMany({
    where: statusWhere,
    include: {
      product: {
        include: {
          brand: {
            include: { direction: { select: { id: true } } },
          },
          category: { select: { id: true } },
          subcategory: { select: { id: true } },
        },
      },
      supplier: { select: { id: true, nameForeign: true, nameEnglish: true } },
    },
    orderBy: { orderDate: "asc" },
  })

  // Счётчики per статус (для бейджей)
  const vpCounts = await prisma.virtualPurchase.groupBy({
    by: ["status"],
    where: { status: { in: ["SUGGESTED", "ACCEPTED", "DISMISSED"] } },
    _count: { id: true },
  })
  const countByStatus: Record<string, number> = {}
  for (const c of vpCounts) {
    countByStatus[c.status] = c._count.id
  }

  // urgentCount для бейджа таба — SUGGESTED с orderDate <= today+14 дней
  const urgentDate = new Date(Date.now() + 3 * 60 * 60 * 1000 + 14 * 86_400_000)
    .toISOString()
    .slice(0, 10)
  const urgentCount = await prisma.virtualPurchase.count({
    where: { status: "SUGGESTED", orderDate: { lte: new Date(urgentDate + "T00:00:00Z") } },
  })

  // ── Каскадная фильтрация + сериализация ──────────────────────────────────

  const rows: VirtualPurchaseRow[] = []
  for (const vp of vpAll) {
    const p = vp.product

    // Каскадные фильтры
    if (selectedDirectionIds.length > 0 && !selectedDirectionIds.includes(p.brand?.direction?.id ?? "")) continue
    if (selectedBrandIds.length > 0 && !selectedBrandIds.includes(p.brandId ?? "")) continue
    if (selectedCategoryIds.length > 0 && !selectedCategoryIds.includes(p.categoryId ?? "")) continue
    if (selectedSubcategoryIds.length > 0 && !selectedSubcategoryIds.includes(p.subcategoryId ?? "")) continue

    const productInput = productInputMap.get(p.id)

    rows.push({
      id: vp.id,
      productId: p.id,
      sku: p.sku,
      name: p.name,
      stockNow: productInput?.stockNow ?? 0,
      baselineOrdersPerDay: productInput?.baselineOrdersPerDay ?? 0,
      orderDate: vp.orderDate.toISOString().slice(0, 10),
      expectedArrivalDate: vp.expectedArrivalDate.toISOString().slice(0, 10),
      leadTimeDaysUsed: vp.leadTimeDaysUsed,
      qty: vp.qty,
      unitPrice: vp.unitPrice != null ? vp.unitPrice.toString() : null,
      currency: vp.currency,
      source: vp.source,
      status: vp.status as "SUGGESTED" | "ACCEPTED" | "DISMISSED" | "CONVERTED",
      supplierId: vp.supplierId,
      supplierNameForeign: vp.supplier?.nameForeign ?? null,
      supplierNameEnglish: vp.supplier?.nameEnglish ?? null,
      stockoutDate: stockoutMap.get(p.id) ?? null,
      isOverdue: vp.orderDate.toISOString().slice(0, 10) < today,
    })
  }

  // Список поставщиков для dropdown в VirtualPurchaseDialog
  const suppliers = await prisma.supplier.findMany({
    where: { deletedAt: null },
    select: { id: true, nameForeign: true, nameEnglish: true },
    orderBy: { nameForeign: "asc" },
  })

  return (
    <div className="flex flex-col h-full gap-3 p-4">
      {/* Табы с urgentCount */}
      <SalesPlanTabs urgentCount={urgentCount} />

      {/* Сегмент-фильтр статуса */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["suggested", "accepted", "dismissed", "all"] as const).map((s) => {
          const isActive = statusFilter === s
          const label =
            s === "suggested" ? "Предложения" :
            s === "accepted" ? "Подтверждённые" :
            s === "dismissed" ? "Отклонённые" :
            "Все"
          const count =
            s === "all"
              ? (countByStatus["SUGGESTED"] ?? 0) + (countByStatus["ACCEPTED"] ?? 0) + (countByStatus["DISMISSED"] ?? 0)
              : s === "suggested" ? (countByStatus["SUGGESTED"] ?? 0)
              : s === "accepted" ? (countByStatus["ACCEPTED"] ?? 0)
              : (countByStatus["DISMISSED"] ?? 0)
          const url = new URLSearchParams()
          url.set("status", s)
          if (sp.directions) url.set("directions", sp.directions)
          if (sp.brands) url.set("brands", sp.brands)
          if (sp.categories) url.set("categories", sp.categories)
          if (sp.subcategories) url.set("subcategories", sp.subcategories)
          return (
            <a
              key={s}
              href={`/sales-plan/purchases?${url.toString()}`}
              className={[
                "px-3 py-1 rounded-full text-sm font-medium transition-colors border",
                isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : "text-muted-foreground border-border hover:text-foreground hover:border-foreground/30",
              ].join(" ")}
            >
              {label}
              {count > 0 && (
                <span className="ml-1.5 text-xs opacity-70">({count})</span>
              )}
            </a>
          )
        })}
      </div>

      {/* Каскадные фильтры */}
      <SalesPlanFilters
        directions={directions}
        brands={brands}
        categories={categories}
        subcategories={subcategories}
        selectedDirectionIds={selectedDirectionIds}
        selectedBrandIds={selectedBrandIds}
        selectedCategoryIds={selectedCategoryIds}
        selectedSubcategoryIds={selectedSubcategoryIds}
        basePath="/sales-plan/purchases"
      />

      {/* Таблица */}
      <div className="flex-1 min-h-0 border rounded-md overflow-hidden">
        <VirtualPurchasesTable
          rows={rows}
          canManage={canManage}
          today={today}
          statusFilter={statusFilter}
          suppliers={suppliers}
          defaultLeadTimeDays={defaultLeadTimeDays}
        />
      </div>
    </div>
  )
}
