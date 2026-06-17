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
import { currentStageOf } from "@/lib/purchase-stages"

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
              id: true,
              quantity: true,
              unitPrice: true,
              stages: { select: { stage: true, quantity: true, date: true } },
              product: {
                select: {
                  name: true,
                  sku: true,
                  photoUrl: true,
                  weightKg: true,
                  heightCm: true,
                  widthCm: true,
                  depthCm: true,
                  brand: {
                    select: {
                      sortOrder: true,
                      direction: { select: { id: true, name: true, sortOrder: true } },
                    },
                  },
                },
              },
            },
          },
          payments: {
            select: { dueDate: true, paidDate: true, status: true, amount: true },
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

  const NULL_DIR = 99_999_999
  // Доли направлений по стоимости на закупку (для сортировки и кластеризации групп).
  type DirCost = Record<string, { name: string; sortOrder: number; cost: number }>
  const dirCostById = new Map<string, DirCost>()

  // ── Преобразование закупок в строки ──
  const rows: PurchaseRow[] = purchases.map((p) => {
    const total = p.items.reduce(
      (sum, i) => sum + i.quantity * Number(i.unitPrice),
      0
    )
    const rate = p.currency === "RUB" ? 1 : rateMap[p.currency] ?? null
    const totalRub = rate != null ? total * rate : null

    // Оплачено / осталось оплатить (в валюте закупки + ₽).
    const paid = p.payments
      .filter((pay) => pay.status === "PAID")
      .reduce((s, pay) => s + Number(pay.amount), 0)
    const remaining = total - paid
    const paidRub = rate != null ? paid * rate : null
    const remainingRub = rate != null ? remaining * rate : null

    // Вес (кг) и объём (м³) из БД Товары: qty × per-unit.
    let weightKg = 0
    let volumeM3 = 0
    let hasWeight = false
    let hasVolume = false
    // Главное направление закупки = с наибольшей долей в стоимости (₽/валюта).
    const dirCost: Record<string, { name: string; sortOrder: number; cost: number }> = {}
    for (const i of p.items) {
      const cost = i.quantity * Number(i.unitPrice)
      const pr = i.product
      if (pr.weightKg != null) {
        weightKg += i.quantity * pr.weightKg
        hasWeight = true
      }
      if (pr.heightCm != null && pr.widthCm != null && pr.depthCm != null) {
        volumeM3 += (i.quantity * pr.heightCm * pr.widthCm * pr.depthCm) / 1_000_000
        hasVolume = true
      }
      const dir = pr.brand?.direction
      const key = dir?.id ?? "—"
      if (!dirCost[key]) {
        dirCost[key] = {
          name: dir?.name ?? "Без направления",
          sortOrder: dir?.sortOrder ?? NULL_DIR,
          cost: 0,
        }
      }
      dirCost[key].cost += cost
    }
    dirCostById.set(p.id, dirCost)
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
      paid,
      paidRub,
      remaining,
      remainingRub,
      status: p.status,
      nearestDueDate,
      hasOverdue,
      groupId: p.group?.id ?? null,
      weightKg: hasWeight ? weightKg : null,
      volumeM3: hasVolume ? volumeM3 : null,
      items: p.items.map((i) => {
        const reached = i.stages.map((s) => s.stage)
        const cur = currentStageOf(reached) // StageKey | null
        // кол-во на текущем этапе: quantity записи прогресса для cur, иначе baseline i.quantity
        const curStageRow = cur ? i.stages.find((s) => s.stage === cur) : undefined
        const curQty = curStageRow?.quantity ?? i.quantity
        // дата достижения текущего этапа (когда товар, напр., стал готов)
        const curStageDate = curStageRow?.date ? curStageRow.date.toISOString() : null
        const pr = i.product
        const sum = i.quantity * Number(i.unitPrice)              // в валюте закупки, ЗАКАЗАННОЕ кол-во
        const sumRub = rate != null ? sum * rate : null           // через тот же rate что закупка
        const itemWeightKg = pr.weightKg != null ? i.quantity * pr.weightKg : null
        const itemVolumeM3 =
          pr.heightCm != null && pr.widthCm != null && pr.depthCm != null
            ? (i.quantity * pr.heightCm * pr.widthCm * pr.depthCm) / 1_000_000
            : null
        return {
          id: i.id,
          name: pr.name,
          sku: pr.sku,
          photoUrl: pr.photoUrl,
          quantity: i.quantity,
          currentStage: cur,
          currentStageQty: curQty,
          currentStageDate: curStageDate,
          sum,
          sumRub,
          currency: p.currency,
          weightKg: itemWeightKg,
          volumeM3: itemVolumeM3,
        }
      }),
    }
  })

  // ── Группы инвойсов: агрегаты (стоимость/оплачено/осталось) + кластеризация ──
  type MoneyAgg = { rub: number | null; byCurrency: { currency: string; total: number }[] }
  function moneyAgg(
    members: PurchaseRow[],
    amt: (r: PurchaseRow) => number,
    rub: (r: PurchaseRow) => number | null
  ): MoneyAgg {
    const byCurrencyMap: Record<string, number> = {}
    let rubSum = 0
    let complete = true
    for (const m of members) {
      byCurrencyMap[m.currency] = (byCurrencyMap[m.currency] ?? 0) + amt(m)
      const v = rub(m)
      if (v != null) rubSum += v
      else complete = false
    }
    return {
      rub: complete ? rubSum : null,
      byCurrency: Object.entries(byCurrencyMap).map(([currency, total]) => ({ currency, total })),
    }
  }

  const groupMeta = new Map(
    purchases.filter((p) => p.group).map((p) => [p.group!.id, p.group!.name])
  )
  const groups: Record<
    string,
    { name: string; cost: MoneyAgg; paid: MoneyAgg; remaining: MoneyAgg }
  > = {}
  for (const [gid, name] of groupMeta) {
    const members = rows.filter((r) => r.groupId === gid)
    groups[gid] = {
      name,
      cost: moneyAgg(members, (r) => r.total, (r) => r.totalRub),
      paid: moneyAgg(members, (r) => r.paid, (r) => r.paidRub),
      remaining: moneyAgg(members, (r) => r.remaining, (r) => r.remainingRub),
    }
  }

  // ── Сортировка по направлениям (как в /prices/wb) + кластеризация групп ──
  // Кластер = отдельная закупка ИЛИ группа (члены идут подряд). Главное направление
  // кластера = с наибольшей долей в стоимости; при разных направлениях внутри
  // закупки/группы берётся доминирующее по ₽-стоимости.
  type Cluster = { key: string; members: PurchaseRow[]; dirSort: number; recent: number }
  const clusterMap = new Map<string, Cluster>()
  for (const r of rows) {
    const ckey = r.groupId ? `g:${r.groupId}` : `p:${r.id}`
    let c = clusterMap.get(ckey)
    if (!c) {
      c = { key: ckey, members: [], dirSort: NULL_DIR, recent: 0 }
      clusterMap.set(ckey, c)
    }
    c.members.push(r)
    c.recent = Math.max(c.recent, new Date(r.createdAt).getTime())
  }
  // главное направление кластера — агрегируем dirCost всех членов
  for (const c of clusterMap.values()) {
    const agg: Record<string, { sortOrder: number; cost: number }> = {}
    for (const m of c.members) {
      const dc = dirCostById.get(m.id)
      if (!dc) continue
      for (const k of Object.keys(dc)) {
        if (!agg[k]) agg[k] = { sortOrder: dc[k].sortOrder, cost: 0 }
        agg[k].cost += dc[k].cost
      }
    }
    const best = Object.values(agg).sort((a, b) => b.cost - a.cost)[0]
    c.dirSort = best?.sortOrder ?? NULL_DIR
  }
  const orderedRows: PurchaseRow[] = [...clusterMap.values()]
    .sort((a, b) => a.dirSort - b.dirSort || b.recent - a.recent)
    .flatMap((c) =>
      [...c.members].sort(
        (x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime()
      )
    )

  // ── Итого по списку (стоимость/оплачено/осталось + вес + объём) ──
  let grandWeight = 0
  let grandVolume = 0
  for (const r of rows) {
    if (r.weightKg != null) grandWeight += r.weightKg
    if (r.volumeM3 != null) grandVolume += r.volumeM3
  }
  const grandTotals = {
    cost: moneyAgg(rows, (r) => r.total, (r) => r.totalRub),
    paid: moneyAgg(rows, (r) => r.paid, (r) => r.paidRub),
    remaining: moneyAgg(rows, (r) => r.remaining, (r) => r.remainingRub),
    weightKg: grandWeight,
    volumeM3: grandVolume,
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
          grandTotals={grandTotals}
          canManage={canManage}
          suppliers={supplierOptions}
          products={productOptions}
          productLinkMap={productLinkMap}
        />
      </div>
    </div>
  )
}
