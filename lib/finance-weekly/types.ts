// lib/finance-weekly/types.ts
//
// Публичные интерфейсы движка понедельного WB фин-отчёта (/finance/weekly).
// Pure — ноль импортов Prisma / React / Next. Входы сериализуемые
// (number/string/boolean/null; без Date/Decimal) — один и тот же контракт
// используется на сервере (RSC) и в клиентской drill-down модалке.
//
// Дизайн-спека: docs/superpowers/specs/2026-07-08-weekly-finreport-design.md (§4.3).
// Golden-тест: tests/finance-weekly-engine.test.ts (nmId 165967746).
//
// Phase quick-260710-e7h (Фин. отчёт за неделю — движок, 2026-07-10)

// ── Union типы ───────────────────────────────────────────────────────────────

// Два непересекающихся мира затрат (§2.2 дизайн-спеки):
//   appliances — бытовая техника (Zoiten), несёт пул процентов по кредиту.
//   clothing   — одежда (Альверто), НЕ несёт кредит (в Excel строки одежды U=0).
export type Universe = "appliances" | "clothing"

// ── Вход per артикул (строка листа «Показатели») ──────────────────────────────

export interface WeeklyArticleInput {
  nmId: number
  universe: Universe
  // H — кол-во единиц за неделю. С W2d базис зависит от universe:
  // appliances → заказы (WbCardFunnelDaily), clothing → выкупы gross (WbSalesDaily).
  qtyOrders: number
  grossPricePerUnit: number    // K — восстановленная цена продажи / ед
  commIuPct: number            // J для сценария ИУ (% комиссии)
  commStdPct: number           // J для сценария Оферта (% комиссии)
  costPerUnit: number          // O — закупка / ед
  adSpendTotal: number         // L — реклама за неделю (тотал по nmId)
  // M — списание за баллы-за-отзывы за неделю (тотал).
  // W1: факт из WbRealizationWeekly (свои строки nmId + доля account-level по выручке).
  reviewWriteoffTotal: number
  // N для ИУ. W1: факт из WbRealizationWeekly — возвратная логистика (брак/возвраты),
  // deliveryRub/qty; без строк реализации = 0 (логистика зашита в ИУ-комиссию).
  logisticsIuPerUnit: number
  logisticsStdPerUnit: number  // N для Оферты (полная объёмная логистика / ед) — МОДЕЛЬ, не факт
  // Опциональный per-article override хранения / ед. Действует ТОЛЬКО на
  // Оферту (ИУ хранение не несёт — WB не выставляет, зашито в комиссию).
  // Если не задан — Оферта берёт из пула хранения (poolPerUnit).
  storagePerUnit?: number
}

// ── Пул недели ────────────────────────────────────────────────────────────────

// Пул несёт СВОЮ базу распределения (§2.1 / §7 п.6 — per-pool базы, не единая).
// poolPerUnit(K, baseRevenue, total) = (K / baseRevenue) × total.
export interface WeeklyPool {
  total: number        // сумма пула за неделю (₽)
  baseRevenue: number  // база распределения — Σ выручки сущностей, делящих пул
}

// Набор пулов одного мира затрат.
// Для clothing пул creditInterest НЕ распределяется (guard в движке) —
// поле присутствует для симметрии структуры, но игнорируется для одежды.
export interface UniversePools {
  deliveryToMp: WeeklyPool    // Доставка до МП (P)
  creditInterest: WeeklyPool  // Проценты по кредиту (U) — только appliances
  overhead: WeeklyPool        // Общие расходы (W)
  acceptance: WeeklyPool      // Платная приёмка / штрафы (Y)
  storage: WeeklyPool         // Хранение (Z) — распределяется ТОЛЬКО в Оферте (ИУ=0)
}

// ── Константы недели ──────────────────────────────────────────────────────────

export interface WeeklyConstants {
  taxPct: number        // налог (% от K)
  jemPct: number        // тариф Джем (% от K)
  defectPct: number     // брак (% от закупки O)
  acquiringPct: number  // эквайринг (% от K)
  // Quick 260714-gff: Опция Джем — надбавка к КОМИССИИ WB (п.п.), применяется
  // аддитивно к обоим сценариям (ИУ и Оферта). ДРУГАЯ сущность, чем jemPct
  // (тариф Джем — per-unit статья % от K, НЕ трогать). Опционально: движок
  // default = 0 через coalesce (см. engine.ts) — golden-тест не меняется.
  jemOptionPct?: number
}

// Excel-значение эквайринга 2.87% (НЕ 2.7% из /prices/wb — §7 п.4).
// Все константы overridable через WeeklyFinReportInputs.constants.
export const DEFAULT_WEEKLY_CONSTANTS: WeeklyConstants = {
  taxPct: 8,
  jemPct: 1,
  defectPct: 2,
  acquiringPct: 2.87,
}

// ── Вход движка ───────────────────────────────────────────────────────────────

export interface WeeklyFinReportInputs {
  articles: WeeklyArticleInput[]
  pools: {
    appliances: UniversePools
    clothing: UniversePools
  }
  constants?: Partial<WeeklyConstants>
}

// ── Пооперационная per-unit разбивка одного сценария ──────────────────────────

// Пооперационная per-unit разбивка одного сценария (строка Excel «Показатели»).
// Все поля — ₽/ед, кроме commissionPct (%). Различаются ИУ vs Оферта:
// commissionPct (J), netOfCommissionPerUnit (I), logisticsPerUnit (N) и
// storagePerUnit (Z — ИУ=0); остальные (delivery/credit/overhead/acceptance +
// брак/джем/налог/эквайринг/закупка) идентичны.
export interface CostBreakdown {
  pricePerUnit: number           // K — цена продажи / ед
  commissionPct: number          // J — комиссия % (различается ИУ/Оферта)
  netOfCommissionPerUnit: number // I = K×(100−J)/100 — цена минус комиссия / ед
  costPerUnit: number            // O — закупка / ед
  adPerUnit: number              // реклама / ед (L/H)
  reviewPerUnit: number          // списание за отзыв / ед (M/H)
  logisticsPerUnit: number       // N — логистика / ед (различается ИУ/Оферта)
  deliveryPerUnit: number        // доставка до МП / ед (пул P)
  creditPerUnit: number          // проценты по кредиту / ед (пул U, 0 для clothing)
  overheadPerUnit: number        // общие расходы / ед (пул W)
  acceptancePerUnit: number      // платная приёмка / штрафы / ед (пул Y)
  storagePerUnit: number         // хранение / ед (пул Z/override) — ТОЛЬКО Оферта; ИУ=0
  defectPerUnit: number          // брак / ед (O×defectPct)
  jemPerUnit: number             // джем / ед (K×jemPct)
  taxPerUnit: number             // налог / ед (K×taxPct)
  acquiringPerUnit: number       // эквайринг / ед (K×acquiringPct)
}

// ── Результат per сценарий / per артикул ──────────────────────────────────────

export interface ScenarioResult {
  cutPricePerUnit: number  // I — цена минус комиссия / ед (K×(100−J)/100)
  profitPerUnit: number    // AA — прибыль / ед
  revenue: number          // AE — K×H
  profit: number           // AF — AA×H
  rePct: number            // AC — Re продаж (profit/revenue), доля 0..1
  roi: number              // AD — ROI (profit/(O×H)), доля 0..1
  breakdown: CostBreakdown // пооперационная per-unit разбивка (для drill-down модалки)
}

export interface ArticleResult {
  nmId: number
  universe: Universe
  qtyOrders: number  // H — кол-во заказов за неделю (для gross = perUnit×H в модалке)
  iu: ScenarioResult
  std: ScenarioResult
}

// ── Роллап (Σ per universe + grand total) ─────────────────────────────────────

export interface ScenarioRollup {
  revenue: number
  profit: number
  rePct: number  // profit / revenue (guard), доля 0..1
}

export interface UniverseRollup {
  universe: Universe
  iu: ScenarioRollup
  std: ScenarioRollup
}

export interface WeeklyRollup {
  byUniverse: UniverseRollup[]
  grand: {
    iu: ScenarioRollup
    std: ScenarioRollup
  }
}

// ── Водопад затрат (Σ бакетов × H) ────────────────────────────────────────────

// Отдельно для iu и std, т.к. логистика (N) различается по сценариям.
export interface CostWaterfall {
  cost: number        // закупка (O·H)
  ad: number          // реклама (adPerUnit·H)
  review: number      // отзывы (reviewPerUnit·H)
  logistics: number   // логистика (N·H)
  delivery: number    // доставка до МП
  credit: number      // проценты по кредиту (0 для clothing)
  overhead: number    // общие расходы
  acceptance: number  // приёмка / штрафы
  storage: number     // хранение
  defect: number      // брак
  jem: number         // джем
  tax: number         // налог
  acquiring: number   // эквайринг
}

export interface WeeklyWaterfall {
  iu: CostWaterfall
  std: CostWaterfall
}

// ── Выход движка ──────────────────────────────────────────────────────────────

export interface WeeklyFinReportOutput {
  articles: ArticleResult[]
  rollup: WeeklyRollup
  waterfall: WeeklyWaterfall
}
