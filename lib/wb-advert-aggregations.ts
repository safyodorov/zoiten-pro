// Phase 19 / Plan 19-05: Pure helpers для агрегации WB Advert stats.
// Без Prisma/Next deps — testable в vitest.
//
// Формулы:
//   ДРР = sum_spent / sum_revenue * 100
//   CPC = sum_spent / sum_clicks
//   CTR = sum_clicks / sum_views * 100
//   CR  = sum_orders / sum_clicks * 100
//
// Все ratio возвращают null когда знаменатель = 0 (zero-guard вместо NaN/Infinity).

// ──────────────────────────────────────────────────────────────────
// Базовые типы данных
// ──────────────────────────────────────────────────────────────────

export interface StatRow {
  advertId: number
  nmId: number
  appType: number
  date: string
  views: number
  clicks: number
  sum: number
  atbs: number
  orders: number
  shks: number
  sumPrice: number
}

export interface Aggregated {
  totalSpent: number
  totalOrders: number
  totalRevenue: number
  totalViews: number
  totalClicks: number
  drr: number | null
  cpc: number | null
  ctr: number | null
  cr: number | null
}

// ──────────────────────────────────────────────────────────────────
// Shared types для page.tsx + AdvertCampaignsTable (single source of truth)
// ──────────────────────────────────────────────────────────────────

export interface ProductMeta {
  id: string
  name: string
  article: string | null
  sku: string
  photoUrl: string | null
  brand: { id: string; name: string; directionId: string | null } | null
  category: { id: string; name: string } | null
  subcategory: { id: string; name: string } | null
}

export interface CampaignRow {
  advertId: number
  name: string | null
  type: number
  status: number
  agg: Aggregated // суммарно за период по этой кампании
}

export interface ProductCampaignGroup {
  product: ProductMeta
  productAgg: Aggregated // суммарно по всем кампаниям продукта
  campaigns: CampaignRow[]
  // Phase 19 fix-iter 2: per-nmId / per-imtId агрегации внутри продукта
  // Заполняются в page.tsx и используются в Plan 19-06 (expand-панель)
  nmIdAgg?: Map<number, Aggregated>
  imtIdAgg?: Map<number, Aggregated>
  // imtId map per nmId — нужно компоненту чтобы группировать nmIds в imt-блоки
  nmIdToImtId?: Map<number, number | null>
  ordersCharts?: Array<{ nmId: number; data: unknown[] }> // заполняется в Plan 19-06
}

// ──────────────────────────────────────────────────────────────────
// Pure functions
// ──────────────────────────────────────────────────────────────────

export function aggregateStats(rows: StatRow[]): Aggregated {
  let totalSpent = 0
  let totalOrders = 0
  let totalRevenue = 0
  let totalViews = 0
  let totalClicks = 0
  for (const r of rows) {
    totalSpent += r.sum
    totalOrders += r.orders
    totalRevenue += r.sumPrice
    totalViews += r.views
    totalClicks += r.clicks
  }
  return {
    totalSpent,
    totalOrders,
    totalRevenue,
    totalViews,
    totalClicks,
    drr: totalRevenue > 0 ? (totalSpent / totalRevenue) * 100 : null,
    cpc: totalClicks > 0 ? totalSpent / totalClicks : null,
    ctr: totalViews > 0 ? (totalClicks / totalViews) * 100 : null,
    cr: totalClicks > 0 ? (totalOrders / totalClicks) * 100 : null,
  }
}

export function groupByCampaign(rows: StatRow[]): Map<number, Aggregated> {
  const buckets = new Map<number, StatRow[]>()
  for (const r of rows) {
    const list = buckets.get(r.advertId) ?? []
    list.push(r)
    buckets.set(r.advertId, list)
  }
  const out = new Map<number, Aggregated>()
  for (const [id, list] of buckets) out.set(id, aggregateStats(list))
  return out
}

export function groupByProduct(
  rows: StatRow[],
  nmIdToProductId: Map<number, string>,
): Map<string, Aggregated> {
  const buckets = new Map<string, StatRow[]>()
  for (const r of rows) {
    const pid = nmIdToProductId.get(r.nmId)
    if (!pid) continue
    const list = buckets.get(pid) ?? []
    list.push(r)
    buckets.set(pid, list)
  }
  const out = new Map<string, Aggregated>()
  for (const [pid, list] of buckets) out.set(pid, aggregateStats(list))
  return out
}

/**
 * per-nmId summary — дефолтный bucket для строк рекламы по карточке товара.
 * Возвращает Map<nmId, Aggregated>.
 */
export function groupByNmId(rows: StatRow[]): Map<number, Aggregated> {
  const buckets = new Map<number, StatRow[]>()
  for (const r of rows) {
    const list = buckets.get(r.nmId) ?? []
    list.push(r)
    buckets.set(r.nmId, list)
  }
  const out = new Map<number, Aggregated>()
  for (const [nm, list] of buckets) out.set(nm, aggregateStats(list))
  return out
}

/**
 * per-imtId summary («по связке»). Объединяет nmIds одной WB-склейки.
 *
 * @param rows            stat rows
 * @param nmIdToImtId     map nmId → imtId | null (загружается из WbCard в page.tsx)
 *
 * Поведение: rows c nmId, для которых imtId === null или нет в map'е — пропускаются.
 * Тем самым «связка» как dimension показывает ТОЛЬКО товары, реально склеенные на WB.
 */
export function groupByImtId(
  rows: StatRow[],
  nmIdToImtId: Map<number, number | null>,
): Map<number, Aggregated> {
  const buckets = new Map<number, StatRow[]>()
  for (const r of rows) {
    const imt = nmIdToImtId.get(r.nmId)
    if (imt == null) continue
    const list = buckets.get(imt) ?? []
    list.push(r)
    buckets.set(imt, list)
  }
  const out = new Map<number, Aggregated>()
  for (const [imt, list] of buckets) out.set(imt, aggregateStats(list))
  return out
}

/**
 * per-campaign-type summary.
 *
 * @param rows            stat rows
 * @param advertIdToType  map advertId → type number (из WbAdvertCampaign)
 *
 * Rows с advertId не в map'е — пропускаются.
 */
export function groupByType(
  rows: StatRow[],
  advertIdToType: Map<number, number>,
): Map<number, Aggregated> {
  const buckets = new Map<number, StatRow[]>()
  for (const r of rows) {
    const t = advertIdToType.get(r.advertId)
    if (t == null) continue
    const list = buckets.get(t) ?? []
    list.push(r)
    buckets.set(t, list)
  }
  const out = new Map<number, Aggregated>()
  for (const [t, list] of buckets) out.set(t, aggregateStats(list))
  return out
}

/**
 * Период [today-days .. today-1] MSK в формате YYYY-MM-DD.
 * Используется в RSC для where: { date: { gte: begin, lte: end } } к WbAdvertStatDaily.
 */
export function getPeriodRange(
  days: number,
  now: Date = new Date(),
): { begin: string; end: string } {
  const mskMs = now.getTime() + 3 * 3600_000
  const todayMs = Math.floor(mskMs / 86400_000) * 86400_000
  const endMs = todayMs - 24 * 3600_000 // вчера
  const beginMs = endMs - (days - 1) * 24 * 3600_000
  return {
    begin: new Date(beginMs).toISOString().slice(0, 10),
    end: new Date(endMs).toISOString().slice(0, 10),
  }
}
