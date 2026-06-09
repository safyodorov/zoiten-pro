// app/(dashboard)/procurement/purchases/page.tsx
// RSC список закупок (D-05, D-12, D-13, D-18).
// Sticky raw-HTML таблица + фильтры Статус/Период/Поставщик/Закупщик.
// OVERDUE вычисляется live на read time (RESEARCH Open Questions #2).
import { requireSection, getSectionRole } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { PurchaseFilters } from "@/components/procurement/PurchaseFilters"
import { PurchasesTable, type PurchaseRow } from "@/components/procurement/PurchasesTable"
import type {
  SupplierOption,
  ProductOption,
  ProductLinkMap,
} from "@/components/procurement/PurchaseModal"
import type { Prisma, PurchaseStatus } from "@prisma/client"
import { PRODUCT_HIERARCHY_ORDER_BY } from "@/lib/product-order"

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    suppliers?: string
    buyers?: string
    dateFrom?: string
    dateTo?: string
  }>
}) {
  await requireSection("PROCUREMENT")
  const canManage = (await getSectionRole("PROCUREMENT")) === "MANAGE"

  const sp = await searchParams
  const validStatuses: PurchaseStatus[] = ["PLANNED", "ACTIVE", "COMPLETED"]
  const selectedStatuses = (sp.status ? sp.status.split(",") : []).filter(
    (s): s is PurchaseStatus => validStatuses.includes(s as PurchaseStatus)
  )
  const selectedSupplierIds = sp.suppliers ? sp.suppliers.split(",").filter(Boolean) : []
  const selectedBuyerIds = sp.buyers ? sp.buyers.split(",").filter(Boolean) : []
  const dateFrom = sp.dateFrom || null
  const dateTo = sp.dateTo || null

  // ── where (D-13) ──
  const where: Prisma.PurchaseWhereInput = {}
  if (selectedStatuses.length > 0) where.status = { in: selectedStatuses }
  if (selectedSupplierIds.length > 0) where.supplierId = { in: selectedSupplierIds }
  if (selectedBuyerIds.length > 0) {
    where.supplier = { buyerEmployeeId: { in: selectedBuyerIds } }
  }
  if (dateFrom || dateTo) {
    const createdAt: Prisma.DateTimeFilter = {}
    if (dateFrom) {
      const d = new Date(dateFrom)
      if (!isNaN(d.getTime())) createdAt.gte = d
    }
    if (dateTo) {
      const d = new Date(dateTo)
      if (!isNaN(d.getTime())) {
        // включительно до конца дня
        d.setHours(23, 59, 59, 999)
        createdAt.lte = d
      }
    }
    where.createdAt = createdAt
  }

  const now = new Date()

  const [purchases, suppliersForFilter, employees, suppliersAll, products, links] =
    await Promise.all([
      prisma.purchase.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          supplier: {
            select: {
              nameEnglish: true,
              buyer: { select: { lastName: true, firstName: true } },
            },
          },
          items: { select: { quantity: true, unitPrice: true } },
          payments: {
            select: { dueDate: true, paidDate: true, status: true },
          },
        },
      }),
      // Поставщики для фильтра — только не удалённые, с хотя бы одной закупкой не нужно;
      // показываем все активные для удобства.
      prisma.supplier.findMany({
        where: { deletedAt: null },
        select: { id: true, nameEnglish: true },
        orderBy: { nameEnglish: "asc" },
      }),
      prisma.employee.findMany({
        where: { fireDate: null },
        select: { id: true, lastName: true, firstName: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      }),
      // Для модалки создания: поставщики + товары + per-supplier product links.
      prisma.supplier.findMany({
        where: { deletedAt: null },
        select: { id: true, nameEnglish: true, nameForeign: true },
        orderBy: { nameEnglish: "asc" },
      }),
      prisma.product.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, sku: true },
        orderBy: PRODUCT_HIERARCHY_ORDER_BY,
      }),
      prisma.supplierProductLink.findMany({
        where: { productId: { not: null }, supplier: { deletedAt: null } },
        select: {
          supplierId: true,
          productId: true,
          unitPrice: true,
          currency: true,
          depositPct: true,
          balancePct: true,
          leadTimeDays: true,
        },
      }),
    ])

  // ── Преобразование закупок в строки ──
  const rows: PurchaseRow[] = purchases.map((p) => {
    const total = p.items.reduce(
      (sum, i) => sum + i.quantity * Number(i.unitPrice),
      0
    )
    // OVERDUE live: любой платёж dueDate < now, не оплачен.
    const hasOverdue = p.payments.some(
      (pay) => pay.status !== "PAID" && !pay.paidDate && pay.dueDate < now
    )
    // Ближайший неоплаченный платёж по dueDate.
    const unpaid = p.payments
      .filter((pay) => pay.status !== "PAID" && !pay.paidDate)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    const nearestDueDate = unpaid[0]?.dueDate.toISOString() ?? null

    return {
      id: p.id,
      createdAt: p.createdAt.toISOString(),
      supplierName: p.supplier.nameEnglish,
      buyerName: p.supplier.buyer
        ? `${p.supplier.buyer.lastName} ${p.supplier.buyer.firstName}`.trim()
        : null,
      currency: p.currency,
      total,
      status: p.status,
      nearestDueDate,
      hasOverdue,
    }
  })

  const supplierFilterOptions = suppliersForFilter.map((s) => ({
    id: s.id,
    name: s.nameEnglish,
  }))
  const buyerOptions = employees.map((e) => ({
    id: e.id,
    name: `${e.lastName} ${e.firstName}`.trim(),
  }))

  // ── Данные для модалки создания ──
  const supplierOptions: SupplierOption[] = suppliersAll.map((s) => ({
    id: s.id,
    name: s.nameEnglish || s.nameForeign,
  }))
  const productOptions: ProductOption[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
  }))
  // supplierId → (productId → link params)
  const productLinkMap: ProductLinkMap = {}
  for (const l of links) {
    if (!l.productId) continue
    if (!productLinkMap[l.supplierId]) productLinkMap[l.supplierId] = {}
    productLinkMap[l.supplierId][l.productId] = {
      unitPrice: l.unitPrice != null ? Number(l.unitPrice) : null,
      currency: l.currency ?? null,
      depositPct: l.depositPct != null ? Number(l.depositPct) : null,
      balancePct: l.balancePct != null ? Number(l.balancePct) : null,
      leadTimeDays: l.leadTimeDays ?? null,
    }
  }

  return (
    <div className="h-full flex flex-col gap-3 p-4">
      <PurchaseFilters
        suppliers={supplierFilterOptions}
        buyers={buyerOptions}
        selectedStatuses={selectedStatuses}
        selectedSupplierIds={selectedSupplierIds}
        selectedBuyerIds={selectedBuyerIds}
        dateFrom={dateFrom}
        dateTo={dateTo}
      />
      <div className="flex-1 min-h-0">
        <PurchasesTable
          rows={rows}
          canManage={canManage}
          suppliers={supplierOptions}
          products={productOptions}
          productLinkMap={productLinkMap}
        />
      </div>
    </div>
  )
}
