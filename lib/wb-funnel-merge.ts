// lib/wb-funnel-merge.ts
// Quick 260519-funnel: helper для слияния WbCardOrdersDaily (Statistics, цены)
// и WbCardFunnelDaily (Analytics, ordersCount) в единый источник для графика.
//
// Семантика: ordersCount из Funnel — приоритетный (то же что показывает
// WB cabinet «Аналитика → По дням»). Цены берутся из Orders (там snapshot
// от prices-daily cron). Если для какой-то (nmId, date) есть только Funnel
// (без Orders snapshot) — qty оттуда, цены = null.

export interface MergedDailyRow {
  date: Date
  qty: number
  sellerPrice: number | null
  buyerPrice: number | null
  discountWb: number | null
}

interface OrdersRow {
  nmId: number
  date: Date
  qty: number
  sellerPrice?: number | null
  buyerPrice?: number | null
  discountWb?: number | null
}

interface FunnelRow {
  nmId: number
  date: Date
  ordersCount: number
}

function dayKey(nmId: number, date: Date): string {
  // Date stored as @db.Date в Prisma → JS Date 00:00 UTC. Берём YYYY-MM-DD.
  return `${nmId}::${date.toISOString().slice(0, 10)}`
}

/** Merge orders (prices) + funnel (true ordersCount) by (nmId, date).
 *  Returns Map<nmId, MergedDailyRow[]> для использования с fillTimeSeries.
 *
 *  Правила:
 *   - qty = funnel.ordersCount если есть, иначе orders.qty, иначе 0
 *   - sellerPrice / buyerPrice — всегда из orders (Statistics), funnel их не содержит
 *   - Если день есть только в funnel — qty оттуда, цены null
 */
export function mergeOrdersAndFunnel(
  ordersRows: OrdersRow[],
  funnelRows: FunnelRow[],
): Map<number, MergedDailyRow[]> {
  // funnelMap: ключ (nmId, date) → ordersCount
  const funnelMap = new Map<string, number>()
  for (const f of funnelRows) {
    funnelMap.set(dayKey(f.nmId, f.date), f.ordersCount)
  }
  // Сборка merged по (nmId, date) — Orders сначала, потом Funnel-only
  const seen = new Set<string>()
  const byNm = new Map<number, MergedDailyRow[]>()
  for (const r of ordersRows) {
    const key = dayKey(r.nmId, r.date)
    seen.add(key)
    const fnQty = funnelMap.get(key)
    const arr = byNm.get(r.nmId) ?? []
    arr.push({
      date: r.date,
      qty: fnQty ?? r.qty,
      sellerPrice: r.sellerPrice ?? null,
      buyerPrice: r.buyerPrice ?? null,
      discountWb: r.discountWb ?? null,
    })
    byNm.set(r.nmId, arr)
  }
  // Funnel-only (нет Orders snapshot для этой даты)
  for (const f of funnelRows) {
    const key = dayKey(f.nmId, f.date)
    if (seen.has(key)) continue
    const arr = byNm.get(f.nmId) ?? []
    arr.push({
      date: f.date,
      qty: f.ordersCount,
      sellerPrice: null,
      buyerPrice: null,
      discountWb: null,
    })
    byNm.set(f.nmId, arr)
  }
  return byNm
}
