// lib/wb-orders-chart.ts
// Pure-helpers для сборки 28-дневного chart timeSeries из raw WbCardOrdersDaily rows.
// MSK timezone — date keys всегда в МСК-локальной дате.
// W-4 fix: helpers getMskTodayDate/getMskYesterdayDate — единая точка истины,
// re-used из cron route + page.tsx + getLast28DaysMsk.

export interface DayPoint {
  date: string // "YYYY-MM-DD"
  qty: number
  // 2026-05-15 (quick 260515-o4o): финальная цена покупателя (₽) на витрине WB
  // на эту дату — round(v4 sizes[].price.product / 100). null если нет snapshot.
  // recharts connectNulls={false} рвёт линию на null, поэтому используем null (не undefined).
  buyerPrice?: number | null
}

/** 00:00:00 UTC даты, соответствующей сегодняшнему дню в MSK (UTC+3).
 *  Используется для построения окна [today-28, today-1] и для границы "вчера".
 *  `now` — для тестов; в проде не задаётся.
 */
export function getMskTodayDate(now?: Date): Date {
  const baseUtcMs = (now ?? new Date()).getTime()
  const mskNow = new Date(baseUtcMs + 3 * 3600_000)
  return new Date(
    Date.UTC(mskNow.getUTCFullYear(), mskNow.getUTCMonth(), mskNow.getUTCDate()),
  )
}

/** 00:00:00 UTC даты, соответствующей вчерашнему дню в MSK.
 *  = getMskTodayDate(now) - 24h. Используется как dateFrom для daily delta cron.
 */
export function getMskYesterdayDate(now?: Date): Date {
  const today = getMskTodayDate(now)
  return new Date(today.getTime() - 24 * 3600_000)
}

/** Возвращает массив 28 строк YYYY-MM-DD от today_msk - 28 до today_msk - 1 (включительно).
 *  Если `now` не задано — использует Date.now() в MSK (UTC+3).
 *  Реализуется через getMskTodayDate — без дублирования MSK math.
 */
export function getLast28DaysMsk(now?: Date): string[] {
  const today = getMskTodayDate(now)
  const result: string[] = []
  for (let offset = 28; offset >= 1; offset--) {
    const d = new Date(today.getTime() - offset * 24 * 3600_000)
    const yy = d.getUTCFullYear()
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
    const dd = String(d.getUTCDate()).padStart(2, "0")
    result.push(`${yy}-${mm}-${dd}`)
  }
  return result
}

/** Складывает 28-точечный массив для bar chart.
 *  raw: записи из WbCardOrdersDaily.
 *  Дни вне окна игнорируются. Дни без записей → qty=0, buyerPrice=null.
 *  2026-05-15 (quick 260515-o4o): теперь принимает + buyerPrice per row, прокидывает в DayPoint.
 *  `now` — для тестов; в проде не задаётся.
 */
export function fillTimeSeries(
  raw: Array<{ date: Date; qty: number; buyerPrice?: number | null }>,
  now?: Date,
): DayPoint[] {
  const window = getLast28DaysMsk(now)
  const qtyByKey = new Map<string, number>()
  const priceByKey = new Map<string, number | null>()
  for (const r of raw) {
    // r.date — JS Date с time=00:00 UTC после Prisma @db.Date чтения.
    // Конвертируем в MSK YYYY-MM-DD ключ.
    const mskDate = new Date(r.date.getTime() + 3 * 3600_000)
    const yy = mskDate.getUTCFullYear()
    const mm = String(mskDate.getUTCMonth() + 1).padStart(2, "0")
    const dd = String(mskDate.getUTCDate()).padStart(2, "0")
    const key = `${yy}-${mm}-${dd}`
    qtyByKey.set(key, (qtyByKey.get(key) ?? 0) + r.qty)
    // Если buyerPrice задана и > 0 — сохраняем. Если несколько записей за день — берём последнюю не-null.
    if (r.buyerPrice != null && r.buyerPrice > 0) {
      priceByKey.set(key, r.buyerPrice)
    } else if (!priceByKey.has(key)) {
      priceByKey.set(key, null)
    }
  }
  return window.map((date) => ({
    date,
    qty: qtyByKey.get(date) ?? 0,
    buyerPrice: priceByKey.get(date) ?? null,
  }))
}
