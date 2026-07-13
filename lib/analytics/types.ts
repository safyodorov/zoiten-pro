// lib/analytics/types.ts
// Phase 30 (analytics) — контракты payload + константы. PURE: без prisma/сети.
// Единый источник форм для парсера (30-04), клиентов (30-05/06), коллектора (30-07),
// снапшота (30-07), вкладок UI (30-10/11) и PDF (30-12). Имена полей воронки сверены
// с реальной фикстурой tests/fixtures/analytics-detail-sample-1.json (Wave 0).

export const NICHE_RUN_SNAPSHOT_VERSION = 1 as const
/** Делитель объёмов по ТЗ §3: «месячное значение ÷ 30» — КОНСТАНТА, не число дней n. */
export const DAYS_IN_MONTH = 30 as const
/** Поправка на WB-Кошелёк: цена отчёта (с СПП) × 0.97 (−3%). */
export const WALLET_PRICE_FACTOR = 0.97 as const

/** Одна строка посуточной воронки (data.salesFunnel.byDay). */
export interface FunnelDayRaw {
  nmId: number
  dt: string // YYYY-MM-DD
  viewCount: number // показы
  openCard: number // переходы (клики)
  addToCart: number // корзины
  orders: number // заказы
  ordersSum: number // сумма заказов (₽)
  buyoutCount: number // выкупы
  medianPrice: number // медианная цена с СПП (до −3%)
}

/** Месячные тоталы (data.salesFunnel.byMonth) — источник объёмов «÷30». */
export interface FunnelMonthTotals {
  viewCount: number
  orders: number
  ordersSum: number
}

/** Агрегированная воронка SKU за период (для «Общая»/«Статистика карточки»). */
export interface FunnelAggregate {
  viewsPerDay: number // месяц ÷ 30
  ordersPerDay: number // месяц ÷ 30
  ordersSumPerDay: number // месяц ÷ 30
  ctr: number // Σпереходов / Σпоказов
  clickToCart: number // Σкорзин / Σпереходов
  cartToOrder: number // Σзаказов / Σкорзин
  clickToOrder: number // Σзаказов / Σпереходов (== clickToCart × cartToOrder)
  buyoutPct: number // Σвыкупов / Σзаказов
  medianPriceWallet: number // средняя medianPrice за период × 0.97
}

/** Рекламная позиция дня (из auto[] MPSTATS by_keywords: [cpm, ?, ad_type, position]). */
export interface AdPosition {
  position: number
  cpm: number
  placementType: string // ad_type, напр. "b"
  boostPosition: number
}

/** Позиция по одному запросу за один день. organic===null → отсутствие (прочерк). */
export interface PositionDay {
  dt: string
  organic: number | null
  ad: AdPosition | null
}

/** Ряд позиций по одному запросу за период. */
export interface QueryPositionSeries {
  query: string
  frequency: number // wb_count (фильтр ниши > 500)
  days: PositionDay[]
  avgPosition: number | null // средняя organic по дням присутствия (ANL-10)
}

export interface Characteristic {
  name: string
  value: string
}

/** Полный payload одного SKU — покрывает ВСЕ 5 вкладок. */
export interface SkuPayload {
  nmId: number
  brand: string
  seller: string // supplier_id или имя (если резолвится)
  subject: string // категория
  name: string
  rating: number | null
  feedbacksCount: number | null
  mainPhoto: string
  listingPhotos: string[] // до 5 (30-06)
  characteristics: Characteristic[]
  funnel: FunnelAggregate
  funnelDays: FunnelDayRaw[] // для графиков «Статистика карточки» (30-10)
  priceDays: { dt: string; value: number }[] // цена по дням (×0.97) — график/PDF
  queries: QueryPositionSeries[] // «Статистика запросов» (30-10)
  revenue: number // сумма заказов за месяц (ranking, ANL-06)
  complete: boolean
  incompleteReasons?: string[]
}

/** Иммутабельный снапшот прогона ниши (NicheRun.payloadJson). */
export interface NicheRunPayload {
  version: typeof NICHE_RUN_SNAPSHOT_VERSION
  dateFrom: string
  dateTo: string
  skus: SkuPayload[]
}

export type SortMode = "revenue" | "clickToOrder"

/** Метрики панели «Статистика карточки» (без позиций). */
export type MetricKey =
  | "views"
  | "ctr"
  | "clickToCart"
  | "clickToOrder"
  | "orders"
  | "ordersSum"
  | "buyout"
  | "price"

export interface SkuCompletenessInput {
  nmId: number
  revenue: number
  complete: boolean
}

export interface CompletenessResult {
  status: "OK" | "PARTIAL" | "FAILED"
  failedInTop10: number[]
  failedIn11to30: number[]
}
