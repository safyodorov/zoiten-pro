// lib/sales-plan/types.ts
//
// Все публичные интерфейсы движка плана продаж v2.
// Pure — ноль импортов Prisma / React / Next.
// Входы сериализуемые (string/number/boolean/null, без Date/Decimal)
// — одни и те же объекты используются на сервере (RSC) и клиенте (realtime-модалка).
//
// Phase 25 (План продаж v2, 2026-07)

// ── Union типы ───────────────────────────────────────────────────────────────

export type ArrivalDateSource = "manual" | "transit-eta" | "leadtime-eta" | "legacy-expected"
export type BuyoutSource = "own" | "legacy" | "subcategory" | "global"

// ── IuTarget ─────────────────────────────────────────────────────────────────

export interface IuTarget {
  from: string       // "2026-07-01"
  to: string         // "2026-12-31"
  dailyRub: number   // 2_380_805
}

// ── Партия прихода ───────────────────────────────────────────────────────────

export interface ArrivalBatch {
  date: string                                    // дата доступности на стоке (уже + wbInboundLag)
  qty: number
  source: "purchase" | "virtual" | "incoming-legacy"
  refId: string
  dateSource: ArrivalDateSource                   // аудит-тег
}

// ── Входы движка ─────────────────────────────────────────────────────────────

export interface SalesPlanInputs {
  today: string           // "2026-07-01" — граница план/факт
  horizonFrom: string     // "2026-07-01"
  horizonTo: string       // "2026-12-31"
  deliveryDays: number    // задержка выкупа (T+3)
  returnDays: number      // задержка возврата (T+6)
  wbInboundLagDays: number
  products: ProductPlanInput[]
}

export interface ProductPlanInput {
  productId: string
  sku: string
  name: string
  // Иерархия для сортировки/группировок
  brandId?: string | null
  brandName?: string | null
  directionId?: string | null
  directionName?: string | null
  categoryId?: string | null
  categoryName?: string | null
  subcategoryId?: string | null
  subcategoryName?: string | null
  nmIds: number[]
  stockNow: number                  // Σ WbCard.stockQty + ivanovoStock
  baselineOrdersPerDay: number
  buyoutPct: number                 // 0..1
  buyoutSource: BuyoutSource
  avgPriceRub: number
  monthLevels: Array<{
    month: string                   // "2026-07-01" (первое число)
    targetOrdersPerDay: number | null
    priceRub: number | null
    buyoutPct: number | null        // 0..1, null = использовать fallback
  }>
  dayOverrides: Record<string, number>   // "2026-07-15" → 20
  arrivals: ArrivalBatch[]
  seedOrders: Record<string, number>     // заказы [today−3, today−1] из funnel
  // Phase 27: ABC-статус и флаг «заказываем» (гейт виртуальных закупок)
  abcStatus?: "A" | "B" | "C" | null
  orderEnabled?: boolean                 // глобальный флаг Product.orderEnabled
  // Индекс сезонности — эффективный множитель ставки per месяц (%, уже нормирован
  // на текущий месяц); ключ "YYYY-MM-01"; отсутствие месяца = 100 (без множителя).
  indexByMonth?: Record<string, number>
}

// ── Параметры модели ─────────────────────────────────────────────────────────

export interface ModelParams {
  deliveryDays: number
  returnDays: number
  wbInboundLagDays: number
  safetyStockDays: number      // default 14
  vpCoverDays: number          // default 60
  defaultLeadTimeDays: number  // default 45
  transitDays: number          // default 20
}

// ── Выходы движка ────────────────────────────────────────────────────────────

export interface PlanDayRow {
  date: string
  ordersUnits: number
  buyoutsUnits: number
  buyoutsRub: number
  ordersRub: number
  stockEnd: number
  rateRequested: number    // ставка ДО сток-лимита — топливо suggester'а Wave 4
}

export interface ProductPlanResult {
  productId: string
  days: PlanDayRow[]       // ровно [horizonFrom … horizonTo]
  monthTotals: Array<{
    month: string
    ordersUnits: number
    buyoutsUnits: number
    buyoutsRub: number
  }>
  firstStockoutDate: string | null   // первый день нуля стока / пробоя страхового запаса
  lostUnitsToStockout: number        // Σ (rateRequested − ordersUnits)
  lostRubToStockout: number          // цена промедления — управленческая метрика
}

export interface SalesPlanResult {
  products: ProductPlanResult[]
  companyDaily: Array<{
    date: string
    ordersUnits: number
    buyoutsUnits: number
    buyoutsRub: number
    ordersRub: number
  }>
  companyMonthly: Array<{
    month: string
    ordersUnits: number
    buyoutsUnits: number
    buyoutsRub: number
  }>
}
