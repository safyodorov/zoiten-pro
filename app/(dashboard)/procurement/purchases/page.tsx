// app/(dashboard)/procurement/purchases/page.tsx
// RSC список закупок (D-05, D-12, D-13, D-18).
// Sticky raw-HTML таблица + фильтры Статус/Период/Поставщик/Закупщик.
// OVERDUE вычисляется live на read time (RESEARCH Open Questions #2).
import { requireSection, getSectionRole } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { getLatestRate } from "@/lib/cbr-rates"
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
          group: { select: { id: true, name: true } },
          items: {
            select: {
              quantity: true,
              unitPrice: true,
              product: { select: { name: true, sku: true, photoUrl: true } },
            },
          },
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

  // ── Курсы ЦБ для пересчёта в рубли (по уникальным валютам списка) ──
  const currencies = [...new Set(purchases.map((p) => p.currency).filter((c) => c !== "RUB"))]
  const rateMap: Record<string, number> = {}
  await Promise.all(
    currencies.map(async (c) => {
      const r = await getLatestRate(c, prisma)
      if (r) rateMap[c] = Number(r.rateToRub)
    })
  )

  // ── Преобразование закупок в строки ──
  const rows: PurchaseRow[] = purchases.map((p) => {
    const total = p.items.reduce(
      (sum, i) => sum + i.quantity * Number(i.unitPrice),
      0
    )
    const rate = p.currency === "RUB" ? 1 : rateMap[p.currency] ?? null
    const totalRub = rate != null ? total * rate : null
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
      supplierId: p.supplierId,
      supplierName: p.supplier.nameEnglish,
      buyerName: p.supplier.buyer
        ? `${p.supplier.buyer.lastName} ${p.supplier.buyer.firstName}`.trim()
        : null,
      currency: p.currency,
      total,
      totalRub,
      status: p.status,
      nearestDueDate,
      hasOverdue,
      groupId: p.group?.id ?? null,
      items: p.items.map((i) => ({
        name: i.product.name,
        sku: i.product.sku,
        photoUrl: i.product.photoUrl,
        quantity: i.quantity,
      })),
    }
  })

  // ── Группы инвойсов: агрегаты + кластеризация строк ──
  const groupMeta = new Map(
    purchases.filter((p) => p.group).map((p) => [p.group!.id, p.group!.name])
  )
  const groups: Record<
    string,
    { name: string; totalRub: number | null; byCurrency: { currency: string; total: number }[] }
  > = {}
  for (const [gid, name] of groupMeta) {
    const members = rows.filter((r) => r.groupId === gid)
    const byCurrencyMap: Record<string, number> = {}
    let rubSum = 0
    let rubComplete = true
    for (const m of members) {
      byCurrencyMap[m.currency] = (byCurrencyMap[m.currency] ?? 0) + m.total
      if (m.totalRub != null) rubSum += m.totalRub
      else rubComplete = false
    }
    groups[gid] = {
      name,
      totalRub: rubComplete ? rubSum : null,
      byCurrency: Object.entries(byCurrencyMap).map(([currency, total]) => ({ currency, total })),
    }
  }

  // Кластеризация: члены группы идут подряд, группа встаёт на позицию самого
  // свежего своего члена (rows уже отсортированы createdAt desc).
  const orderedRows: PurchaseRow[] = []
  const emitted = new Set<string>()
  for (const r of rows) {
    if (emitted.has(r.id)) continue
    if (r.groupId) {
      for (const m of rows.filter((x) => x.groupId === r.groupId)) {
        if (!emitted.has(m.id)) {
          orderedRows.push(m)
          emitted.add(m.id)
        }
      }
    } else {
      orderedRows.push(r)
      emitted.add(r.id)
    }
  }

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
          rows={orderedRows}
          groups={groups}
          canManage={canManage}
          suppliers={supplierOptions}
          products={productOptions}
          productLinkMap={productLinkMap}
        />
      </div>
    </div>
  )
}
