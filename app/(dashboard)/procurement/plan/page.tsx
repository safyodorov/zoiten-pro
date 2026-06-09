// app/(dashboard)/procurement/plan/page.tsx
// Phase 20 (D-10, D-11, D-12): /procurement/plan MVP — read-only прогноз закупок.
//
// Свежая страница (НЕ связана с временным /purchase-plan). Показывает товары
// с дефицитом (Д > 0 по РФ-агрегату), обогащённые сроком готовности (leadTimeDays)
// из привязки поставщика + рекомендованной датой заказа + ETA доставки.
//
// v1: read-only forecast, без записей в БД (RESEARCH Open Question #1).
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { getStockData } from "@/lib/stock-data"
import { calculateStockMetrics } from "@/lib/stock-math"
import {
  buildProcurementPlanRows,
  type ProcurementPlanInput,
} from "@/lib/procurement-plan-data"
import {
  ProcurementPlanTable,
  type ProcurementPlanTableRow,
} from "@/components/procurement/ProcurementPlanTable"

export default async function ProcurementPlanPage() {
  await requireSection("PROCUREMENT")

  // 1. Дефицитные товары (РФ-агрегат) — переиспользуем stock-data helper.
  const { products, turnoverNormDays } = await getStockData({ onlyDeficit: true })

  if (products.length === 0) {
    return (
      <div className="h-full flex flex-col gap-3 p-4">
        <div className="flex-1 min-h-0">
          <ProcurementPlanTable rows={[]} />
        </div>
      </div>
    )
  }

  // 2. SupplierProductLink с leadTimeDays для этих товаров (один батч-запрос).
  const productIds = products.map((p) => p.id)
  const links = await prisma.supplierProductLink.findMany({
    where: {
      productId: { in: productIds },
      leadTimeDays: { not: null },
    },
    select: {
      productId: true,
      leadTimeDays: true,
      supplier: { select: { nameEnglish: true } },
    },
  })

  // Для каждого товара выбираем привязку с минимальным leadTimeDays (быстрейший поставщик).
  const bestLinkByProduct = new Map<
    string,
    { leadTimeDays: number; supplierName: string }
  >()
  for (const link of links) {
    if (!link.productId || link.leadTimeDays === null) continue
    const existing = bestLinkByProduct.get(link.productId)
    if (!existing || link.leadTimeDays < existing.leadTimeDays) {
      bestLinkByProduct.set(link.productId, {
        leadTimeDays: link.leadTimeDays,
        supplierName: link.supplier.nameEnglish,
      })
    }
  }

  // 3. Собрать input: пересчитать Д через calculateStockMetrics (РФ-агрегат) + обогатить lead-time.
  // products уже отсортированы PRODUCT_HIERARCHY_ORDER_BY в getStockData.
  const inputs: ProcurementPlanInput[] = []
  for (const p of products) {
    const metrics = calculateStockMetrics({
      stock: p.aggregates.rfTotalStock,
      ordersPerDay: p.aggregates.wbTotalOrdersPerDay,
      turnoverNormDays,
    })
    if (metrics.deficit === null || metrics.deficit <= 0) continue

    const best = bestLinkByProduct.get(p.id)
    inputs.push({
      productId: p.id,
      sku: p.sku,
      name: p.name,
      brandName: p.brandName,
      categoryName: p.categoryName,
      subcategoryName: p.subcategoryName,
      deficit: metrics.deficit,
      leadTimeDays: best?.leadTimeDays ?? null,
      supplierName: best?.supplierName ?? null,
    })
  }

  // 4. Прогнозные строки (orderByDate = сегодня, deliveryEta = сегодня + leadTime).
  const planRows = buildProcurementPlanRows({ products: inputs })

  // Показываем только товары, привязанные к поставщику (key_link: leadTimeDays from SupplierProductLink).
  const rows: ProcurementPlanTableRow[] = planRows
    .filter((r) => r.supplierName !== null)
    .map((r) => ({
      productId: r.productId,
      sku: r.sku,
      name: r.name,
      deficit: r.deficit,
      supplierName: r.supplierName,
      leadTimeDays: r.leadTimeDays,
      deliveryEta: r.deliveryEta,
    }))

  return (
    <div className="h-full flex flex-col gap-3 p-4">
      <div className="flex-1 min-h-0">
        <ProcurementPlanTable rows={rows} />
      </div>
    </div>
  )
}
