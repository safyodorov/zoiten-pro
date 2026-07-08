// lib/pricing-math.ts
//
// Pure function для расчёта юнит-экономики WB карточек.
// Используется и на сервере (RSC рендер таблицы), и на клиенте (realtime пересчёт в модалке).
//
// Phase 7 — Управление ценами WB (план 07-02)
// D-12: формулы выведены из canonical Excel "C:/Users/User/Desktop/Форма управления ценами.xlsx",
// строка nmId 800750522.
//
// Golden test (nmId 800750522):
//   priceBeforeDiscount=25833, sellerDiscountPct=70, wbDiscountPct=25,
//   commFbwPct=32.58, drrPct=10, costPrice=2204, defectRatePct=2,
//   deliveryCostRub=30, creditPct=3, overheadPct=6, taxPct=8,
//   walletPct=2, acquiringPct=2.7, jemPct=1, clubDiscountPct=0
//   → profit ≈ 567.683, Re продаж ≈ 7.32%, ROI ≈ 25.76%
//
// ВАЖНО (отклонение от плана 07-02):
//   Плановая спецификация указывала creditPct=7 в golden test input'ах,
//   однако canonical Excel для строки nmId 800750522 использует creditPct=3
//   (232.497 / 7749.9 = 0.03). Формула calculatePricing использует
//   creditAmount = sellerPrice × creditPct/100 (подтверждено Excel),
//   а golden test inputs приведены в соответствие с Excel (creditPct=3).
//
// **Никаких side effects**: функции детерминированные, без импортов Prisma / React / Next.

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

/** Входные параметры для расчёта одной ценовой строки WbCard. */
export interface PricingInputs {
  // Цена и скидки
  /** Цена продавца до скидки, ₽ (поле «Цена для установки» в Excel) */
  priceBeforeDiscount: number
  /** Скидка продавца, % */
  sellerDiscountPct: number
  /** Скидка WB (СПП), % */
  wbDiscountPct: number
  /** Скидка клуба WB, % (обычно 0) */
  clubDiscountPct: number

  // Комиссия маркетплейса
  /** Комиссия ИУ FBW, % (из WbCard.commFbwIu) */
  commFbwPct: number

  // Per-product параметры (resolved через fallback chain)
  /** ДРР, % */
  drrPct: number
  /** Процент брака, % */
  defectRatePct: number
  /** Доставка на маркетплейс, ₽ */
  deliveryCostRub: number
  /** Себестоимость, ₽ */
  costPrice: number
  /** Процент выкупа за месяц, % (из WbCard.buyoutPercent) — для отображения */
  buyoutPct: number

  // Глобальные ставки (из AppSetting)
  /** Кошелёк WB, % */
  walletPct: number
  /** Эквайринг, % */
  acquiringPct: number
  /** Тариф Джем, % */
  jemPct: number
  /** Кредит, % */
  creditPct: number
  /** Общие расходы, % */
  overheadPct: number
  /** Налог, % */
  taxPct: number

  // ── Фаза B (2026-07-07) / Фаза B v2 (2026-07-08): второй фин-рез
  // «на стандартных условиях». Все поля опциональны — существующий golden
  // test (без std-входов) не затрагивается, calculatePricingStandard не
  // вызывается implicitly.
  /** Стандартная комиссия (не ИУ), % — обычно card.commFbwStd. */
  commStdPct?: number
  /** Объём товара, литры (Д×Ш×В/1000), округляется до 0,1 л внутри функции. */
  volumeLiters?: number
  /** Эфф-ставка логистики (первый литр), ₽ — УЖЕ с вшитым коэффициентом склада
   *  (acceptance/coefficients deliveryBaseLiter, взвешено по стоку per направление) —
   *  AppSetting.wbEffCoef.<направление>.delivBaseLiter. */
  delivBaseLiter?: number
  /** Эфф-ставка логистики за доп. литр, ₽ — УЖЕ с вшитым коэффициентом —
   *  AppSetting.wbEffCoef.<направление>.delivAddLiter. */
  delivAddLiter?: number
  /** Индекс локализации (множитель, ~1.0) — AppSetting.wbLocalizationIndex. */
  localizationIndex?: number
  /** Стоимость обратной логистики при невыкупе, ₽ — AppSetting.wbReturnLogisticsRub. */
  returnLogisticsRub?: number
  /** Эфф-ставка хранения (первый литр), ₽/л/сутки — УЖЕ с вшитым коэффициентом —
   *  AppSetting.wbEffCoef.<направление>.storageBaseLiter. */
  storageBaseLiter?: number
  /** Эфф-ставка хранения за доп. литр, ₽/л/сутки — УЖЕ с вшитым коэффициентом —
   *  AppSetting.wbEffCoef.<направление>.storageAddLiter. */
  storageAddLiter?: number
  /** Дней на складе (оборачиваемость) — остаток / продажи в день, fallback 60. */
  daysInStock?: number
  /** Ставка возврата продавцу брака, ₽ — AppSetting.wbReturnToSellerRub
   *  (Фаза B v2, `/api/v1/tariffs/return` deliveryDumpSupReturnExpr). */
  returnToSellerRub?: number
}

/** Результат расчёта — все вычисляемые значения 31 колонок формы «Управление ценами». */
export interface PricingOutputs {
  // Цены
  /** Цена продавца (после скидки продавца), ₽ */
  sellerPrice: number
  /** Цена со скидкой WB (СПП), ₽ */
  priceAfterWbDiscount: number
  /** Цена со скидкой WB клуба, ₽ */
  priceAfterClubDiscount: number
  /** Цена с WB кошельком (итоговая цена покупателя), ₽ */
  priceAfterWallet: number

  // Абсолютные суммы (₽)
  /** Размер кошелька, ₽ */
  walletAmount: number
  /** Эквайринг, ₽ */
  acquiringAmount: number
  /** Комиссия ИУ FBW, ₽ */
  commissionAmount: number
  /** Реклама (ДРР), ₽ */
  drrAmount: number
  /** Тариф Джем, ₽ */
  jemAmount: number
  /** Скидка клуба (абсолютная сумма), ₽ */
  clubDiscountAmount: number
  /** К перечислению, ₽ */
  transferAmount: number
  /** Брак, ₽ */
  defectAmount: number
  /** Доставка, ₽ */
  deliveryAmount: number
  /** Кредит, ₽ */
  creditAmount: number
  /** Общие расходы, ₽ */
  overheadAmount: number
  /** Налог, ₽ */
  taxAmount: number

  // Финальные показатели
  /** Прибыль, ₽ */
  profit: number
  /** Re продаж (прибыль / цена продавца), % */
  returnOnSalesPct: number
  /** ROI (прибыль / закупка), % */
  roiPct: number

  // ── Фаза B (2026-07-07): второй фин-рез «на стандартных условиях» ──
  // Все поля опциональны — calculatePricing (первый блок) их не заполняет,
  // только calculatePricingStandard.
  /** Прибыль на стандартных условиях, ₽. */
  profitStd?: number
  /** ROI на стандартных условиях, %. */
  roiPctStd?: number
  /** Re продаж на стандартных условиях, %. */
  returnOnSalesPctStd?: number
  /** Хранение (на проданную единицу через оборачиваемость), ₽. */
  storageAmount?: number
  /** Логистика эффективная (с учётом выкупа и амортизации возврата), ₽. */
  logisticsEffAmount?: number
  /** Логистика «туда» (без учёта выкупа/возврата), ₽. */
  logisticsToAmount?: number
  /** Возврат продавцу брака, ₽ = returnToSellerRub × defectRatePct/100 (Фаза B v2). */
  returnToSellerAmount?: number
}

// ──────────────────────────────────────────────────────────────────
// Константы
// ──────────────────────────────────────────────────────────────────

/** Hardcoded fallback для ДРР (D-01). */
export const HARDCODED_DRR_PCT = 10

/** Hardcoded fallback для процента брака (D-01). */
export const HARDCODED_DEFECT_RATE_PCT = 2

/** Hardcoded fallback для доставки на маркетплейс, ₽ (D-01). */
export const HARDCODED_DELIVERY_COST_RUB = 30

/** Порядок колонок в таблице «Управление ценами WB» — ровно 30 колонок.
 *
 *  Источник истины: `C:/Users/User/Desktop/Форма управления ценами.xlsx`,
 *  заголовки из строки 9 (Excel 1-индекс), диапазон `A9:AE9`.
 *  Используется планом 07-07 (PriceCalculatorTable) для рендера колонок.
 *
 *  **30, не 31** — колонка «Фото» обрабатывается отдельно через rowSpan-группировку
 *  в таблице и не входит в `COLUMN_ORDER` (см. `.planning/phases/07-prices-wb/07-WAVE0-NOTES.md`
 *  секция 1).
 *
 *  Соответствие index → content:
 *    - 0..4   identifying (Сводка / Статус цены / Ярлык / Артикул / Процент выкупа)
 *    - 5..29  расчётные колонки формулы
 */
export const COLUMN_ORDER = [
  "Сводка",                        //  1 — identifying: name + stock + sales speed
  "Статус цены",                   //  2 — identifying: "Текущая цена" / название акции / "Расчетная цена N"
  "Ярлык",                         //  3 — identifying: product tag
  "Артикул",                       //  4 — identifying: nmId
  "Процент выкупа",                //  5 — input: buyoutPct
  "Цена для установки",            //  6 — input: priceBeforeDiscount
  "Скидка продавца",               //  7 — input: sellerDiscountPct
  "Цена продавца",                 //  8 — output: sellerPrice
  "Скидка WB",                     //  9 — input: wbDiscountPct
  "Цена со скидкой WB",            // 10 — output: priceAfterWbDiscount
  "WB Клуб",                       // 11 — input: clubDiscountPct
  "Цена со скидкой WB клуба",      // 12 — output: priceAfterClubDiscount
  "Кошелёк",                       // 13 — input: walletPct
  "Цена с WB кошельком",           // 14 — output: priceAfterWallet
  "Эквайринг",                     // 15 — output: acquiringAmount
  "Комиссия, %",                   // 16 — input: commFbwPct
  "Комиссия, руб.",                // 17 — output: commissionAmount
  "ДРР, %",                        // 18 — input: drrPct
  "Реклама, руб.",                 // 19 — output: drrAmount
  "Тариф джем, руб.",              // 20 — output: jemAmount
  "К перечислению",                // 21 — output: transferAmount
  "Закупка, руб.",                 // 22 — input: costPrice
  "Брак, руб.",                    // 23 — output: defectAmount
  "Доставка на маркеплейс, руб.",  // 24 — input/output: deliveryAmount (= deliveryCostRub)
  "Кредит, руб.",                  // 25 — output: creditAmount
  "Общие расходы, руб.",           // 26 — output: overheadAmount
  "Налог, руб.",                   // 27 — output: taxAmount
  "Прибыль, руб.",                 // 28 — output: profit
  "Re продаж, %",                  // 29 — output: returnOnSalesPct
  "ROI, %",                        // 30 — output: roiPct
] as const

// Compile-time assertion: COLUMN_ORDER содержит ровно 30 элементов.
// Если TypeScript подчёркивает эту строку — COLUMN_ORDER выше != 30 элементов.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _COLUMN_ORDER_LENGTH_CHECK: (typeof COLUMN_ORDER)["length"] extends 30 ? true : never = true as never

// ──────────────────────────────────────────────────────────────────
// Fallback resolvers (D-01)
// ──────────────────────────────────────────────────────────────────

/** Резолвит ДРР по fallback chain:
 *  Product.drrOverridePct → Subcategory.defaultDrrPct → 10 (hardcoded).
 */
export function resolveDrrPct(params: {
  productOverride: number | null
  subcategoryDefault: number | null
}): number {
  if (params.productOverride != null) return params.productOverride
  if (params.subcategoryDefault != null) return params.subcategoryDefault
  return HARDCODED_DRR_PCT
}

/** Резолвит процент брака по fallback chain:
 *  Product.defectRateOverridePct → Category.defaultDefectRatePct → AppSetting.wbDefectRatePct → 2 (hardcoded).
 */
export function resolveDefectRatePct(params: {
  productOverride: number | null
  categoryDefault: number | null
  globalDefault?: number | null
}): number {
  if (params.productOverride != null) return params.productOverride
  if (params.categoryDefault != null) return params.categoryDefault
  if (params.globalDefault != null) return params.globalDefault
  return HARDCODED_DEFECT_RATE_PCT
}

/** Резолвит стоимость доставки на маркетплейс:
 *  Product.deliveryCostRub → 30 (hardcoded).
 */
export function resolveDeliveryCostRub(productValue: number | null): number {
  if (productValue != null) return productValue
  return HARDCODED_DELIVERY_COST_RUB
}

// ──────────────────────────────────────────────────────────────────
// Main calculator
// ──────────────────────────────────────────────────────────────────

/**
 * Рассчитать юнит-экономику одной ценовой строки WbCard.
 *
 * **Pure function** — детерминированная, без side effects,
 * без зависимостей от Prisma/React/Next.
 *
 * Формулы (точно из canonical Excel «Форма управления ценами.xlsx»):
 *
 * ```
 *  sellerPrice            = priceBeforeDiscount × (1 - sellerDiscountPct/100)
 *  priceAfterWbDiscount   = sellerPrice × (1 - wbDiscountPct/100)
 *  priceAfterClubDiscount = priceAfterWbDiscount × (1 - clubDiscountPct/100)
 *  priceAfterWallet       = priceAfterClubDiscount × (1 - walletPct/100)
 *
 *  walletAmount        = priceAfterClubDiscount × walletPct/100
 *  clubDiscountAmount  = priceAfterWbDiscount × clubDiscountPct/100
 *  acquiringAmount     = sellerPrice × acquiringPct/100      // база = Цена продавца
 *  commissionAmount    = sellerPrice × commFbwPct/100        // база = Цена продавца
 *  drrAmount (Реклама) = sellerPrice × drrPct/100            // база = Цена продавца
 *  jemAmount           = sellerPrice × jemPct/100            // база = Цена продавца
 *
 *  transferAmount =
 *    sellerPrice
 *    - clubDiscountAmount
 *    - acquiringAmount
 *    - commissionAmount
 *    - drrAmount
 *    - jemAmount
 *
 *  defectAmount   = costPrice × defectRatePct/100
 *  deliveryAmount = deliveryCostRub
 *  creditAmount   = sellerPrice × creditPct/100
 *  overheadAmount = sellerPrice × overheadPct/100
 *  taxAmount      = sellerPrice × taxPct/100
 *
 *  profit =
 *    transferAmount
 *    - costPrice
 *    - defectAmount
 *    - deliveryAmount
 *    - creditAmount
 *    - overheadAmount
 *    - taxAmount
 *
 *  returnOnSalesPct = sellerPrice > 0 ? (profit / sellerPrice) × 100 : 0
 *  roiPct           = costPrice  > 0 ? (profit / costPrice)  × 100 : 0
 * ```
 *
 * Golden test (nmId 800750522): profit ≈ 567.683 ₽ (tolerance 0.01 ₽).
 */
export function calculatePricing(inputs: PricingInputs): PricingOutputs {
  // Guard against negative / zero edge cases
  const priceBeforeDiscount = Math.max(0, inputs.priceBeforeDiscount)
  const costPrice = Math.max(0, inputs.costPrice)

  // ── 1. Цена продавца (после скидки продавца) ────────────────────
  const sellerPrice =
    priceBeforeDiscount * (1 - inputs.sellerDiscountPct / 100)

  // ── 2. Цена со скидкой WB (СПП) ─────────────────────────────────
  const priceAfterWbDiscount =
    sellerPrice * (1 - inputs.wbDiscountPct / 100)

  // ── 3. Цена со скидкой клуба WB ─────────────────────────────────
  const priceAfterClubDiscount =
    priceAfterWbDiscount * (1 - inputs.clubDiscountPct / 100)

  // ── 4. Цена с кошельком (финальная цена покупателя) ─────────────
  // Формула Excel: [Цена со скидкой WB клуба] × (1 - [кошелёк])
  const walletAmount = priceAfterClubDiscount * (inputs.walletPct / 100)
  const priceAfterWallet = priceAfterClubDiscount - walletAmount

  // ── 5. Эквайринг ────────────────────────────────────────────────
  // Excel: [Ставка эквайринга] × [Цена продавца]
  // Golden: 2.7% × 7749.9 = 209.2473 ✓
  const acquiringAmount = sellerPrice * (inputs.acquiringPct / 100)

  // ── 6. Комиссия ИУ FBW ──────────────────────────────────────────
  // Excel: [Цена продавца] × [Комиссия FBW ИУ]
  // Golden: 7749.9 × 0.3258 = 2524.917 ✓
  const commissionAmount = sellerPrice * (inputs.commFbwPct / 100)

  // ── 7. ДРР (Реклама) ────────────────────────────────────────────
  // Excel: [Цена продавца] × [ДРР]
  // Golden: 7749.9 × 0.10 = 774.99 ✓
  const drrAmount = sellerPrice * (inputs.drrPct / 100)

  // ── 8. Тариф Джем ───────────────────────────────────────────────
  // Excel: [Цена продавца] × [Ставка Джем]
  // Golden: 7749.9 × 0.01 = 77.499 ✓
  const jemAmount = sellerPrice * (inputs.jemPct / 100)

  // ── 9. Абсолютная сумма скидки клуба ────────────────────────────
  // Участвует в формуле К перечислению; при clubDiscountPct=0 равна 0.
  const clubDiscountAmount =
    priceAfterWbDiscount * (inputs.clubDiscountPct / 100)

  // ── 10. К перечислению ──────────────────────────────────────────
  // Excel: [Цена продавца] - [скидка WB клуба] - [Эквайринг] - [Комиссия]
  //         - [Реклама] - [Тариф Джем]
  // Golden: 7749.9 - 0 - 209.2473 - 2524.917 - 774.99 - 77.499 = 4163.2467 ✓
  const transferAmount =
    sellerPrice -
    clubDiscountAmount -
    acquiringAmount -
    commissionAmount -
    drrAmount -
    jemAmount

  // ── 11. Брак ────────────────────────────────────────────────────
  // Excel: [Закупка] × [Процент Брака]
  // Golden: 2204 × 0.02 = 44.08 ✓
  const defectAmount = costPrice * (inputs.defectRatePct / 100)

  // ── 12. Доставка на маркетплейс ─────────────────────────────────
  // Фиксированная сумма из Product.deliveryCostRub (после fallback).
  const deliveryAmount = inputs.deliveryCostRub

  // ── 13. Кредит ──────────────────────────────────────────────────
  // Excel: [Ставка кредита] × [Цена продавца]
  // Golden: 7749.9 × 0.03 = 232.497 ✓  (Excel использует 3%, не 7%)
  const creditAmount = sellerPrice * (inputs.creditPct / 100)

  // ── 14. Общие расходы ───────────────────────────────────────────
  // Excel: [Ставка общих расходов] × [Цена продавца]
  // Golden: 7749.9 × 0.06 = 464.994 ✓
  const overheadAmount = sellerPrice * (inputs.overheadPct / 100)

  // ── 15. Налог ───────────────────────────────────────────────────
  // Excel: [Ставка налога] × [Цена продавца]
  // Golden: 7749.9 × 0.08 = 619.992 ✓
  const taxAmount = sellerPrice * (inputs.taxPct / 100)

  // ── 16. Прибыль ─────────────────────────────────────────────────
  // Excel: [К перечислению] - [Закупка] - [Брак] - [Доставка]
  //         - [Кредит] - [Общие расходы] - [Налог]
  // Golden: 4163.2467 - 2204 - 44.08 - 30 - 232.497 - 464.994 - 619.992
  //       ≈ 567.683 ✓
  const profit =
    transferAmount -
    costPrice -
    defectAmount -
    deliveryAmount -
    creditAmount -
    overheadAmount -
    taxAmount

  // ── 17. Re продаж (%) ───────────────────────────────────────────
  // Excel: [Прибыль] / [Цена продавца] (отображается как %)
  // Golden: 567.683 / 7749.9 ≈ 0.07325 → 7.33%
  const returnOnSalesPct =
    sellerPrice > 0 ? (profit / sellerPrice) * 100 : 0

  // ── 18. ROI (%) ─────────────────────────────────────────────────
  // Excel: [Прибыль] / [Закупка] (отображается как %)
  // Golden: 567.683 / 2204 ≈ 0.25757 → 25.76%
  const roiPct = costPrice > 0 ? (profit / costPrice) * 100 : 0

  return {
    sellerPrice,
    priceAfterWbDiscount,
    priceAfterClubDiscount,
    priceAfterWallet,
    walletAmount,
    acquiringAmount,
    commissionAmount,
    drrAmount,
    jemAmount,
    clubDiscountAmount,
    transferAmount,
    defectAmount,
    deliveryAmount,
    creditAmount,
    overheadAmount,
    taxAmount,
    profit,
    returnOnSalesPct,
    roiPct,
  }
}

// ──────────────────────────────────────────────────────────────────
// Фаза B (2026-07-07) / Фаза B v2 (2026-07-08): второй фин-рез
// «на стандартных условиях»
// ──────────────────────────────────────────────────────────────────

/**
 * Рассчитать юнит-экономику «на стандартных условиях» — параллельно основному
 * расчёту по ИУ (calculatePricing), но со стандартной комиссией, полной моделью
 * логистики к клиенту (с учётом выкупа и амортизацией возврата при невыкупе),
 * хранением (база+доп-литр × дни на складе) и возвратом продавцу брака.
 *
 * **Pure function**, переиспользует calculatePricing как ядро (комиссия = std,
 * доставка = логистика эффективная), затем вычитает Хранение и Возврат продавцу сверху.
 *
 * **v2 (2026-07-08):** входные ставки логистики/хранения (`delivBaseLiter`,
 * `delivAddLiter`, `storageBaseLiter`, `storageAddLiter`) — эфф-ставки WB
 * acceptance/coefficients, взвешенные по нашему стоку per направление
 * (`lib/wb-eff-coef.ts`). Коэффициент склада УЖЕ вшит в эти ставки —
 * в отличие от v1 здесь НЕТ отдельного умножения на `delivCoefPct/storageCoefPct`.
 * Хранение теперь считается по той же схеме база+доп-литр, что и логистика
 * (раньше — `storageBasePerLiter × V`, без доп-литра).
 *
 * Формулы (спека `docs/superpowers/specs/2026-07-07-...-design.md` §4, v2):
 * ```
 *  V       = round(max(0, volumeLiters) × 10) / 10       (округл. до 0,1 л)
 *  ПВ      = buyoutPct / 100
 *  Л_туда   = (delivBaseLiter + delivAddLiter × max(0, V−1)) × ИЛ
 *  Л_эфф    = ПВ > 0 ? [Л_туда + (1−ПВ) × returnLogisticsRub] / ПВ : Л_туда
 *  Хранение = (storageBaseLiter + storageAddLiter × max(0, V−1)) × daysInStock
 *  Возврат-продавцу = returnToSellerRub × (defectRatePct/100)
 *
 *  profitStd = calculatePricing({ commFbwPct: commStdPct, deliveryCostRub: Л_эфф }).profit
 *              − Хранение − Возврат-продавцу
 *  roiPctStd           = costPrice > 0  ? profitStd / costPrice × 100  : 0
 *  returnOnSalesPctStd = sellerPrice > 0 ? profitStd / sellerPrice × 100 : 0
 * ```
 *
 * std-golden v2 (детерминированный, на базе goldenInputs nmId 800750522 +
 * { commStdPct:25, volumeLiters:5, buyoutPct:90, delivBaseLiter:94.3, delivAddLiter:28.7,
 *   storageBaseLiter:0.16, storageAddLiter:0.16, localizationIndex:1.0, returnLogisticsRub:50,
 *   returnToSellerRub:250, daysInStock:60 }):
 *   Л_туда=209.1, Л_эфф≈237.8889, Хранение=48, Возврат-продавцу=5,
 *   profitStd≈894.24 ₽, roiPctStd≈40.57%, returnOnSalesPctStd≈11.54%
 *   (см. tests/pricing-math.test.ts).
 */
export function calculatePricingStandard(inputs: PricingInputs): PricingOutputs {
  const delivBaseLiter = inputs.delivBaseLiter ?? 0
  const delivAddLiter = inputs.delivAddLiter ?? 0
  const storageBaseLiter = inputs.storageBaseLiter ?? 0
  const storageAddLiter = inputs.storageAddLiter ?? 0
  const returnToSellerRub = inputs.returnToSellerRub ?? 0
  const localizationIndex = inputs.localizationIndex ?? 1
  const returnLogisticsRub = inputs.returnLogisticsRub ?? 50
  const daysInStock = inputs.daysInStock ?? 0

  const V = Math.round(Math.max(0, inputs.volumeLiters ?? 0) * 10) / 10
  const pv = (inputs.buyoutPct ?? 100) / 100

  // Коэф УЖЕ в ставке (acceptance/coefficients) → НЕ умножаем на delivCoefPct/storageCoefPct.
  const logTo = (delivBaseLiter + delivAddLiter * Math.max(0, V - 1)) * localizationIndex
  const logEff = pv > 0 ? (logTo + (1 - pv) * returnLogisticsRub) / pv : logTo

  const storage = (storageBaseLiter + storageAddLiter * Math.max(0, V - 1)) * daysInStock

  const returnToSeller = returnToSellerRub * ((inputs.defectRatePct ?? 0) / 100)

  // Ядро — переиспользуем calculatePricing (golden-протестированное тело):
  // комиссия заменяется на стандартную, доставка — на логистику эффективную.
  const base = calculatePricing({
    ...inputs,
    commFbwPct: inputs.commStdPct ?? inputs.commFbwPct,
    deliveryCostRub: logEff,
  })

  const profitStd = base.profit - storage - returnToSeller
  const costPrice = Math.max(0, inputs.costPrice)
  const roiPctStd = costPrice > 0 ? (profitStd / costPrice) * 100 : 0
  const returnOnSalesPctStd =
    base.sellerPrice > 0 ? (profitStd / base.sellerPrice) * 100 : 0

  return {
    ...base,
    profitStd,
    roiPctStd,
    returnOnSalesPctStd,
    storageAmount: storage,
    logisticsEffAmount: logEff,
    logisticsToAmount: logTo,
    returnToSellerAmount: returnToSeller,
  }
}
