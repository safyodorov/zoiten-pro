---
phase: 07-prices-wb
plan: 07
subsystem: ui
tags: [client-components, shadcn, base-ui, table, rowspan, sticky, debounced-save, tooltip, price-calculator]

# Dependency graph
requires:
  - phase: 07-prices-wb-02
    provides: lib/pricing-math.ts (calculatePricing, COLUMN_ORDER, PricingInputs/PricingOutputs)
  - phase: 07-prices-wb-05
    provides: app/actions/pricing.ts (updateAppSetting server action)
  - phase: 07-prices-wb-06
    provides: components/ui/tooltip.tsx (shadcn wrapper над @base-ui/react/tooltip)
provides:
  - GlobalRatesBar компонент (inline-редактор 6 глобальных ставок с debounced save)
  - PromoTooltip компонент (обёртка tooltip с description + advantages)
  - PriceCalculatorTable компонент (главная таблица с rowSpan/sticky/indicator strips/clickable rows)
  - Exported types для плана 07-08: PriceRow, WbCardRowGroup, ProductGroup, PriceRowType
affects: [07-08, 07-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Debounced save: useRef<timers> + setTimeout 500ms + startTransition + toast"
    - "base-ui Tooltip.Trigger render-prop для замены button на span (shadcn/dialog.tsx паттерн)"
    - "rowSpan группировка через productRowIdx counter в flatMap"
    - "Sticky columns с накопительным left (0/20/320/400) + z-40 header / z-10 body"
    - "Indicator strips через border-l-4 на первой не-sticky ячейке (Статус цены)"
    - "CELL_CLASS константа для унификации стиля 26 расчётных ячеек"
    - "profitClass helper для подсветки значений (зелёный ≥0 / красный <0)"

key-files:
  created:
    - "components/prices/GlobalRatesBar.tsx"
    - "components/prices/PromoTooltip.tsx"
    - "components/prices/PriceCalculatorTable.tsx"
  modified: []

key-decisions:
  - "COLUMN_ORDER распределён между sticky и scroll областями: первые 4 элемента (Сводка/Статус цены/Ярлык/Артикул) рендерятся как sticky-колонки + label cell, остальные 26 — в scroll-области. Избегает дублирования заголовков."
  - "PriceRow интерфейс расширен 10 input-полями (sellerDiscountPct, wbDiscountPct, clubDiscountPct, walletPct, commFbwPct, drrPct, defectRatePct, costPrice, deliveryCostRub + оставлен sellerPriceBeforeDiscount) — плану 07-08 не нужны дополнительные запросы при сборке."
  - "WbCardRowGroup.card включает опциональное поле buyoutPct — для колонки «Процент выкупа» (COLUMN_ORDER[4]) которая привязана к карточке, а не к ценовой строке."
  - "base-ui TooltipTrigger использует render prop (не asChild как radix) — паттерн взят из components/ui/dialog.tsx."
  - "GlobalRatesBar хранит values как строки (не числа) — пользователь может временно печатать '2.' без потери символа при форматировании."
  - "Indicator strip рендерится на первой не-sticky ячейке (Статус цены), а не на <tr> — чтобы border-l-4 не конфликтовал с sticky колонками и сохранял визуальную полосу только в scroll-области."
  - "Debounced save через useRef<Partial<Record<key, timer>>> — отдельный таймер на каждое поле, чтобы изменение одного не сбрасывало pending save другого."
  - "Пустой state таблицы — ссылка на /cards/wb с инструкцией привязать карточки к товарам; избегает глухого 'нет данных'."

patterns-established:
  - "Phase 7 клиентские компоненты: 'use client' первой строкой, exported types для RSC сборщика, RSC передаёт уже посчитанные computed: PricingOutputs (таблица НЕ вызывает calculatePricing сама)"
  - "rowSpan группировка на 2 уровня: totalRowsInProduct для Фото/Сводка + priceRows.length для Ярлык/Артикул"
  - "Подсветка финансовых значений через helper profitClass(n) — переиспользуется для 3 колонок (Прибыль/Re/ROI)"

requirements-completed: [PRICES-02, PRICES-03, PRICES-04, PRICES-06, PRICES-13, PRICES-15, PRICES-16]

# Metrics
duration: 15min
completed: 2026-04-10
---

# Phase 07-07: 3 клиентских компонента UI «Управление ценами WB» Summary

Реализованы три ключевых клиентских компонента Phase 7 (`GlobalRatesBar`, `PromoTooltip`, `PriceCalculatorTable`) с полной TypeScript-типизацией и exported types для сборщика RSC-страницы в плане 07-08. Все компоненты принимают данные через props, не делают Prisma-запросов, визуально соответствуют 07-UI-SPEC (spacing 8-point, typography text-xs/text-sm/text-base, цветовая схема 60/30/10, indicator strips blue/purple/amber).

## Созданные компоненты

### 1. `components/prices/GlobalRatesBar.tsx` (124 строк)

Inline-редактор 6 глобальных ставок в шапке раздела.

**Signature:**
```typescript
interface GlobalRatesBarProps {
  initialRates: Record<RateKey, number>  // 6 ключей из lib/pricing-schemas
}
```

**Поведение:**
- Layout: `<Card p-4 bg-muted/30>` → `grid grid-cols-3 md:grid-cols-6 gap-4`, адаптивно
- 6 полей: Кошелёк WB / Эквайринг / Тариф Джем / Кредит / Общие / Налог
- Input: `type="number" step="0.1" min="0" max="100" inputMode="decimal" h-8 w-20 text-sm` + «%»
- Debounce 500 ms per-field через `useRef<Partial<Record<RateKey, timer>>>` — каждое поле имеет свой таймер, изменение одного не сбрасывает pending save другого
- Сохранение через `updateAppSetting(key, newValue)` → toast success/error
- `disabled={isPending}` во время `startTransition` чтобы избежать гонок

### 2. `components/prices/PromoTooltip.tsx` (64 строк)

Обёртка для shadcn Tooltip с описанием акции и списком преимуществ.

**Signature:**
```typescript
interface PromoTooltipProps {
  children: React.ReactNode
  description?: string | null
  advantages?: readonly string[] | null
}
```

**Поведение:**
- Early return: если нет ни `description`, ни `advantages` → рендерит children без обёртки
- `TooltipTrigger` использует `render` prop для замены button на `<span className="text-sm hover:underline cursor-help">` (base-ui pattern)
- `TooltipContent`: `max-w-sm text-xs space-y-2` — description в `<p leading-relaxed>`, advantages в `<ul list-disc list-inside>`

### 3. `components/prices/PriceCalculatorTable.tsx` (505 строк)

Главная таблица раздела. Самый сложный компонент Phase 7.

**Exported types:**
```typescript
export type PriceRowType = "current" | "regular" | "auto" | "calculated"

export interface PriceRow {
  id: string
  type: PriceRowType
  label: string
  // 10 input-полей для 26 расчётных колонок:
  sellerPriceBeforeDiscount: number
  sellerDiscountPct: number
  wbDiscountPct: number
  clubDiscountPct: number
  walletPct: number
  commFbwPct: number
  drrPct: number
  defectRatePct: number
  costPrice: number
  deliveryCostRub: number
  // optional metadata:
  promotionDescription?: string | null
  promotionAdvantages?: readonly string[] | null
  calculatedSlot?: 1 | 2 | 3
  // уже посчитанный результат:
  computed: PricingOutputs
}

export interface WbCardRowGroup {
  card: { id, nmId, label?, buyoutPct? }
  priceRows: PriceRow[]
}

export interface ProductGroup {
  product: { id, name, photoUrl, totalStock, totalAvgSalesSpeed }
  cards: WbCardRowGroup[]
  totalRowsInProduct: number
}
```

**Визуальные фичи:**
- 4 sticky колонки (Фото `w-20 left-0` / Сводка `w-60 left-20` / Ярлык `w-20 left-[320px]` / Артикул `w-28 left-[400px]`) с `z-40` на header и `z-10` на body
- Sticky шапка таблицы `top-0 z-30 bg-background border-b`
- Колонка «Статус цены» — первая не-sticky, содержит: `<Badge>Текущая</Badge>` (primary) / `<PromoTooltip>promo_name</PromoTooltip>` / `<span>Расчётная цена N</span>`. Indicator strip border-l-4 blue/purple/amber рендерится именно на этой ячейке
- 26 расчётных колонок из `COLUMN_ORDER.slice(4)` с классом `CELL_CLASS = "px-2 py-1 h-10 text-xs leading-tight tabular-nums text-right align-middle"`
- rowSpan: `group.totalRowsInProduct` для Фото+Сводка (anchor `isFirstRowOfProduct`), `cardGroup.priceRows.length` для Ярлык+Артикул (anchor `isFirstRowOfCard`)
- Жирный разделитель между Product: `border-t-4 border-t-border` (анкер `gIdx > 0 && isFirstRowOfProduct`). Тонкий между WbCard внутри Product: `border-t border-t-border/60`
- Подсветка Прибыль / Re продаж / ROI через helper `profitClass(n)`: `text-green-600 font-medium` (≥0) / `text-red-600 font-medium` (<0) с префиксом `+` у положительных процентов (accessibility)
- Clickable row: `onClick={() => onRowClick?.(card, row, productId)}` с `cursor-pointer hover:bg-muted/50 group` — sticky ячейки получают `group-hover:bg-muted/50` для синхронизации фона при hover
- Empty state: если `groups.length === 0` → ссылка на `/cards/wb` с инструкцией привязать карточки

**Форматирование (helpers):**
- `fmtMoney(n)` — 2 знака, ру локаль, «—» для NaN
- `fmtPct(n, withSign)` — 1 знак, опц. `+`/«−» префикс
- `fmtPctSimple(n)` — 1 знак без знака, «—» для null/undefined

## Сопоставление COLUMN_ORDER → PriceRow

Первые 4 элемента `COLUMN_ORDER` рендерятся как sticky-колонки + label cell:
- `[0] Сводка` → sticky col 2 (Product.name + totalStock + totalAvgSalesSpeed)
- `[1] Статус цены` → первая не-sticky (Badge / PromoTooltip / calculated label)
- `[2] Ярлык` → sticky col 3 (WbCard.label)
- `[3] Артикул` → sticky col 4 (WbCard.nmId)

Остальные 26 — в scroll-области (`COLUMN_ORDER.slice(4)`):
- `[4] Процент выкупа` → `card.buyoutPct`
- `[5] Цена для установки` → `row.sellerPriceBeforeDiscount`
- `[6] Скидка продавца` → `row.sellerDiscountPct`
- `[7] Цена продавца` → `row.computed.sellerPrice`
- `[8] Скидка WB` → `row.wbDiscountPct`
- `[9] Цена со скидкой WB` → `row.computed.priceAfterWbDiscount`
- `[10] WB Клуб` → `row.clubDiscountPct`
- `[11] Цена со скидкой WB клуба` → `row.computed.priceAfterClubDiscount`
- `[12] Кошелёк` → `row.walletPct`
- `[13] Цена с WB кошельком` → `row.computed.priceAfterWallet`
- `[14] Эквайринг` → `row.computed.acquiringAmount`
- `[15] Комиссия, %` → `row.commFbwPct`
- `[16] Комиссия, руб.` → `row.computed.commissionAmount`
- `[17] ДРР, %` → `row.drrPct`
- `[18] Реклама, руб.` → `row.computed.drrAmount`
- `[19] Тариф джем` → `row.computed.jemAmount`
- `[20] К перечислению` → `row.computed.transferAmount`
- `[21] Закупка` → `row.costPrice`
- `[22] Брак` → `row.computed.defectAmount`
- `[23] Доставка` → `row.computed.deliveryAmount`
- `[24] Кредит` → `row.computed.creditAmount`
- `[25] Общие расходы` → `row.computed.overheadAmount`
- `[26] Налог` → `row.computed.taxAmount`
- `[27] Прибыль` → `row.computed.profit` (подсветка)
- `[28] Re продаж` → `row.computed.returnOnSalesPct` (подсветка)
- `[29] ROI` → `row.computed.roiPct` (подсветка)

## TODO для плана 07-08

Плану 07-08 (RSC page `/prices/wb`) нужно:

1. **Импортировать три компонента:**
   ```tsx
   import { GlobalRatesBar } from "@/components/prices/GlobalRatesBar"
   import { PriceCalculatorTable, type ProductGroup } from "@/components/prices/PriceCalculatorTable"
   ```

2. **Собрать `initialRates` через `getPricingSettings()`** (уже существует в `app/actions/pricing.ts`) и передать в `<GlobalRatesBar initialRates={...} />`.

3. **Построить `groups: ProductGroup[]`:**
   - Query Product → WbCard (через nmId в MarketplaceArticle) → WbPromotionNomenclature
   - Fallback chain для ДРР/брака/доставки: `Product.override → Sub/Category.default → hardcoded (10/2/30)` — использовать `resolveDrrPct()` / `resolveDefectRatePct()` / `resolveDeliveryCostRub()` из `lib/pricing-math.ts`
   - Для каждой ценовой строки собрать `PricingInputs` и вызвать `calculatePricing(inputs)` → результат в `row.computed`
   - Заполнить 10 input-полей `PriceRow` (они все нужны для рендера колонок)
   - Подсчитать `totalRowsInProduct = sum(cards.map(c => c.priceRows.length))`
   - Подсчитать `totalStock = sum(cards.stockQty)` и `totalAvgSalesSpeed = sum(cards.avgSalesSpeed7d)`

4. **Порядок ценовых строк внутри WbCard (D-10):**
   - Index 0: «Текущая цена» (sellerPriceBeforeDiscount = WbCard.priceBeforeDiscount, sellerDiscountPct = WbCard.sellerDiscount)
   - Далее: Regular акции (WbPromotion.type="regular") DESC by WbPromotionNomenclature.planPrice
   - Далее: Auto акции (type="auto", только если есть planPrice из Excel) DESC by planPrice
   - В конце: CalculatedPrice slots 1/2/3 — в порядке слота

5. **PriceCalculatorTable.onRowClick** пока не подключён — в плане 07-09 оборачиваем таблицу в client wrapper с `useState` для модалки.

## Известные ограничения

- **`onRowClick` не подключён** в таблице: prop опциональный, если не передан — клик по строке безопасно игнорируется (`onRowClick?.()`).
- **`card.buyoutPct` опциональный**: если WbCard не имеет `avgBuyoutPct` — колонка показывает «—».
- **`defectRatePct` присутствует в PriceRow, но нет отдельной колонки процента брака** в `COLUMN_ORDER` — используется только через `computed.defectAmount` (COLUMN_ORDER[22] «Брак, руб.»). Поле остаётся в интерфейсе для snapshot в CalculatedPrice и реалтайм пересчёта в модалке (план 07-09).
- **Индикатор полоски на ячейке, не на ряду**: border-l-4 применён к первой не-sticky ячейке («Статус цены»), чтобы не конфликтовать с sticky колонками слева. Визуально полоса появляется от начала scroll-области, а не от левого края таблицы — это корректное поведение (sticky-колонки остаются нейтральными).

## Self-Check: PASSED

### Files verified:
- FOUND: components/prices/GlobalRatesBar.tsx
- FOUND: components/prices/PromoTooltip.tsx
- FOUND: components/prices/PriceCalculatorTable.tsx

### Commits verified:
- FOUND: 6df2f09 — feat(07-prices-wb-07): добавить GlobalRatesBar и PromoTooltip
- FOUND: b91f652 — feat(07-prices-wb-07): добавить PriceCalculatorTable

### Checks:
- `npx tsc --noEmit` — без ошибок
- `grep "use client"` — присутствует в первой строке всех трёх компонентов
- `grep "COLUMN_ORDER"` в PriceCalculatorTable — 40 упоминаний (заголовки + комментарии)
- `grep "rowSpan"` в PriceCalculatorTable — 13 упоминаний
- `grep "sticky"` в PriceCalculatorTable — 12 упоминаний
- `grep "border-l-(blue|purple|amber)-500"` — 3 типа indicator strips присутствуют
- `grep "text-green-600|text-red-600"` — подсветка профита присутствует
- `grep "updateAppSetting"` в GlobalRatesBar — server action импортирован и вызывается в startTransition
- `grep "setTimeout.*500"` в GlobalRatesBar — debounce 500 ms присутствует
- `grep "TooltipTrigger|TooltipContent"` в PromoTooltip — оба примитива используются
- Stubs scan: нет hardcoded `[]`/`{}`/«coming soon»/«placeholder» — все данные передаются через props, pending pages wire в 07-08
