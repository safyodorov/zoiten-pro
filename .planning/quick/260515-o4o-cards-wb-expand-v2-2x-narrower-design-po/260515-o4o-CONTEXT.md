---
name: 260515-o4o-context
description: /cards/wb expand row v2 — narrower panel + design colors + 2 цены в WbCardOrdersDaily + retro backfill + cron 05:10 МСК + cron schedule UI + line chart цены
---

# Quick Task 260515-o4o: /cards/wb expand v2 + цены — Context

**Gathered:** 2026-05-15
**Status:** Ready for planning

<domain>
## Task Boundary

Доработка expandable row на `/cards/wb` (фича из quick 260515-m5o):

1. Уменьшить визуальную ширину панели в ~2× (контент центрирован, не растягивается на всю строку).
2. Цветовая полировка с design-подходом, dark-mode aware (тёмная тема — обязательно красиво).
3. Добавить в `WbCardOrdersDaily` две новые колонки:
   - `sellerPrice INT?` — цена с учётом скидки продавца (₽)
   - `buyerPrice INT?` — цена с учётом WB скидки (СПП) + WB кошелька (₽)
4. **Retroactive backfill** для существующих 2165 строк: применить **сегодняшние** значения price/discountWb/walletPct.
5. Новый daily cron в **05:10 МСК** (после orders в 05:00) синхронизирует цены через card.wb.ru v4 API.
6. Время cron'ов **настраивается в /admin/settings** (новый таб «Расписание»).
7. На bar-chart заказов добавить **continuous line** цены `buyerPrice` (ComposedChart recharts).

**Пример:** nmId 800750522 → sellerPrice 5310 ₽ / buyerPrice 3817 ₽ (~28% reduction).

</domain>

<decisions>
## Implementation Decisions

### D-01 Хранение цен (ПОЛЬЗОВАТЕЛЬ ВЫБРАЛ)

- **2 nullable INTEGER колонки в существующей `WbCardOrdersDaily`:**
  ```sql
  ALTER TABLE "WbCardOrdersDaily" ADD COLUMN "sellerPrice" INTEGER;
  ALTER TABLE "WbCardOrdersDaily" ADD COLUMN "buyerPrice" INTEGER;
  ```
- Plus добавляем @@index([nmId, date]) если ещё нет (уже есть compound UNIQUE — этого достаточно для query).
- Plain INTEGER в ₽ (не decimal, не копейки) — UI всё равно округляет.
- NULL допустимы для строк где цена ещё не заполнена (между migration и backfill).

### D-02 Retroactive backfill (Claude's discretion + RESEARCH-corrected)

**Подход:** UPDATE ВСЕ существующие 2165 строк сегодняшними расчётными значениями per-nmId.

- Для каждого `nmId` берём:
  - `sellerPriceToday = current WbCard.price` (это уже finalized seller-price, после скидки продавца)
  - `discountWb = current WbCard.discountWb` (СПП — уже включает эффект кошелька, см. RESEARCH § "критический ответ")
  - `buyerPriceToday = round(sellerPriceToday × (1 - discountWb/100))`  **БЕЗ дополнительного × (1 - walletPct/100)**
- `UPDATE WbCardOrdersDaily SET sellerPrice = sellerPriceToday, buyerPrice = buyerPriceToday WHERE nmId = X AND sellerPrice IS NULL`
- Это даёт прямую линию цены на графике для всей предыстории, далее (с следующего дня) — реальные значения.
- В дни, когда не было заказов — записи не существует, цена не рендерится за этот день в линии (gap). Это ок: пользователь видит "ровную полку" по дням с заказами + breaks для дней без активности.

**Verification:** 5310 × (1 − 0.2812) = 3817 ✓ (точно соответствует примеру user'а).

**Alternative rejected:** «snapshot только сегодня» — не даст линию на графике, бессмысленно.

### D-03 Daily cron для цен (ПОЛЬЗОВАТЕЛЬ УКАЗАЛ 05:10 МСК)

- Новый endpoint `GET /api/cron/wb-prices-daily` (x-cron-secret guard).
- Поведение:
  1. Берём список **активных** nmId (из `WbCard` WHERE deletedAt IS NULL).
  2. Новая функция `fetchBuyerPricesViaCurlV4(nmIds)` в `lib/wb-api.ts` — паттерн как `fetchWbDiscounts` (curl, батчи по 20, пауза 3 сек), но возвращает `Map<nmId, buyerPriceRub>` где buyerPriceRub = `round(sizes[].price.product / 100)` — **финальная цена на витрине**, уже включает SPP + кошелёк + клуб + промо.
  3. Считаем `sellerPrice = current WbCard.price` (актуальная цена продавца) и `buyerPrice = fetchedBuyerPriceRub` (БЕЗ дополнительного умножения!).
  4. UPSERT в `WbCardOrdersDaily` по `(nmId, date)` где `date = сегодня MSK` (snapshot цены — что показывалось сегодня). Если row уже есть (от orders-cron, qty>0) — UPDATE только price-колонки, qty не трогаем.
  5. Если row нет (день без заказов) — INSERT с `qty=0`.

**Важно:** Это меняет ранее принятое в quick 260515-m5o правило «не пишем qty=0 строки». Теперь — пишем, чтобы линия цены была непрерывной.

**RESEARCH-confirmed:** v4 API `sizes[].price.product` уже содержит ВСЕ скидки (включая кошелёк). НЕ умножать дополнительно на (1 - walletPct/100) — будет двойной счёт.

### D-04 Dispatcher cron + configurable time (Claude's discretion)

**Архитектура:**

- systemd timer fires **каждые 5 минут** (`OnCalendar=*-*-* *:00,05,10,15,20,25,30,35,40,45,50,55:00 Europe/Moscow`) или проще `OnCalendar=*:0/5` — calls `GET /api/cron/dispatch`.
- Endpoint `dispatch` читает 2 AppSetting:
  - `wbOrdersDailyCronTime` (default `"05:00"`)
  - `wbPricesDailyCronTime` (default `"05:10"`)
- Для каждого: если `current MSK time hh:mm === stored hh:mm` AND `lastRunDate !== today MSK` → fire correspond endpoint INTERNALLY (server-side fetch с x-cron-secret).
- Каждый внутренний endpoint после успешного run пишет `wbOrdersDailyLastRun` / `wbPricesDailyLastRun` в AppSetting = today MSK date.
- 5-минутная granularity достаточна (user указал 05:10, это round 5-min value).
- Полный cost: 288 hits/day на dispatch, 286 — noop (~5ms), 2 — real work.

**Settings UI:** новый таб `/admin/settings` → «Расписание» → 2 строки с `<select>` времени (5-мин шаги, 00:00..23:55). Server action `updateCronSchedule(key, value)` + `requireSuperadmin()`.

**Существующий timer** `zoiten-wb-orders.timer` (orders 05:00) — **заменяется** новым timer `zoiten-cron-dispatch.timer`. Старый timer disable+remove. Внутри dispatcher endpoint orders и prices синхронизации триггерятся через **internal fetch** на endpoint'ы (которые остаются защищёнными CRON_SECRET — dispatcher шлёт правильный header).

### D-05 Width / layout (Claude's discretion)

- Внутренний контент панели max-width **~50%** ширины таблицы (640px / `max-w-[640px]`), центрирован `mx-auto`.
- Bar chart compact: `height={180}` (было 280?), XAxis interval=6, less labels.
- 2 числа `avg30d` / `avg7d` справа от графика (не сверху) → горизонтальный layout: chart 70% / stats 30%.
- Закрытая строка не меняется. Раскрытая — padding `py-4 px-6` + Card-shape с `border + rounded-md + bg-card`.

### D-06 Color palette / design (Claude's discretion)

**Design подход:** заказы — context-метрика (где? сколько?), цена — primary-метрика (значимая, привлекающая взгляд).

- **Bars (qty заказов):** muted secondary
  - Light: `oklch(0.85 0.05 200)` ~ soft cool grey-cyan
  - Dark: `oklch(0.45 0.05 200)` ~ darker version
- **Line (buyerPrice):** orange brand accent (project существующий accent в Claude Code-стиле)
  - Light: `oklch(0.65 0.2 30)` ~ vibrant orange
  - Dark: `oklch(0.7 0.18 30)` ~ slightly brighter for dark bg
  - Line stroke width 2px, dot radius 3
- **Tooltip:** показывает дату + qty + buyerPrice (₽); background `bg-popover/95 backdrop-blur-sm` для glass-эффект (project уже использует это в landing).
- **avg числа:** monospace, large `text-2xl font-semibold tabular-nums`. Subtitle `text-xs text-muted-foreground`.
- **Использовать shadcn-charts color tokens:** `--chart-1` = bars, `--chart-2` = line. Define в `app/globals.css` для light/dark.

### D-07 Settings UI placement (Claude's discretion)

- Новый таб в `/admin/settings` рядом с существующими `Brands / Categories / Marketplaces`.
- Label: **«Расписание синхронизаций»** (or just «Cron»).
- Только для SUPERADMIN (`requireSuperadmin()`).
- 2 строки, каждая:
  - Название задачи (Заказы WB / Цены WB)
  - `<select>` время (5-мин шаги, default value из AppSetting)
  - Last run timestamp (read-only, из AppSetting)
- Server action saves + revalidatePath.

</decisions>

<specifics>
## Specific Ideas

### Schema migration

```sql
-- prisma/migrations/20260515_wb_card_orders_daily_prices/migration.sql
ALTER TABLE "WbCardOrdersDaily" ADD COLUMN "sellerPrice" INTEGER;
ALTER TABLE "WbCardOrdersDaily" ADD COLUMN "buyerPrice" INTEGER;
```

### AppSetting keys (новые)

- `wbOrdersDailyCronTime` (string `"HH:MM"`, default `"05:00"`)
- `wbPricesDailyCronTime` (string `"HH:MM"`, default `"05:10"`)
- `wbOrdersDailyLastRun` (string `"YYYY-MM-DD"`)
- `wbPricesDailyLastRun` (string `"YYYY-MM-DD"`)

### Endpoints

- `GET /api/cron/dispatch` — НОВЫЙ; вызывается systemd каждые 5 мин; orchestrates orders + prices internally
- `GET /api/cron/wb-orders-daily` — existing, без изменений
- `GET /api/cron/wb-prices-daily` — НОВЫЙ; делает price sync через `fetchSppViaCurlV4` + UPSERT в WbCardOrdersDaily
- `POST /api/wb-prices-retroactive-backfill` — НОВЫЙ; UI кнопка-один раз для retroactive UPDATE 2165 строк

### Chart: ComposedChart

```tsx
<ComposedChart data={timeSeries}>
  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
  <XAxis dataKey="date" tickFormatter={shortDate} interval={6} />
  <YAxis yAxisId="qty" orientation="left" allowDecimals={false} />
  <YAxis yAxisId="price" orientation="right" domain={['dataMin - 100', 'dataMax + 100']} />
  <Bar yAxisId="qty" dataKey="qty" fill="var(--chart-1)" radius={[2, 2, 0, 0]} />
  <Line yAxisId="price" type="monotone" dataKey="buyerPrice" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
  <ChartTooltip content={<CustomTooltip />} />
</ComposedChart>
```

`connectNulls={false}` — если день без заказов и без цены (gap), линия рвётся. Это honest visual.

### Backfill button

Уже есть `WbOrdersBackfillButton` — добавить рядом `WbPricesRetroactiveBackfillButton` или объединить в один dropdown:

```
[ Backfill ▾ ]
  • Заказы с 2026-04-01
  • Цены ретроактивно (сегодняшние)
```

### Тесты

- `tests/wb-prices-retroactive.test.ts` — golden: dado nmId с sellerPrice=5310, discountWb=27.5, walletPct=2 → buyerPrice=5310 × 0.725 × 0.98 = 3771 (ну или 3817 в зависимости от точной формулы — researcher уточнит)
- `tests/wb-prices-cron-dispatch.test.ts` — match time + lastRun guard

## Open questions для researcher

1. **Точная формула buyerPrice:** v4 API даёт цену **с** или **без** учёта WB кошелька? Может быть price.product **уже** включает кошелёк, и тогда buyerPrice = price.product / 100 без доп. умножения. Пример 800750522 = 3817 даст ответ — researcher проверит через curl.

2. **Existing fetchSppViaCurlV4** или похожая функция в `lib/wb-api.ts` — найти точное имя, что возвращает.

3. **shadcn ComposedChart** — поддерживает ли `components/ui/chart.tsx` уже добавленный wrapper.

</specifics>

<canonical_refs>
## Canonical References

- `lib/wb-api.ts` — `fetchSppViaCurlV4` (или похожее имя) для card.wb.ru v4 API
- CLAUDE.md секция «Скидка WB (СПП) — КРИТИЧЕСКИ ВАЖНАЯ ЛОГИКА» — формула и tradeoffs curl vs fetch
- CLAUDE.md секция «WB API rate-limit защиты» — лимиты, retry, paths
- `components/ui/chart.tsx` — shadcn-charts wrapper (только что создан в 260515-m5o)
- `components/cards/WbCardOrdersChart.tsx` — текущий BarChart (заменяем на ComposedChart)
- `prisma/schema.prisma` — модель WbCardOrdersDaily (создана в 260515-m5o)
- recharts ComposedChart docs: https://recharts.org/en-US/api/ComposedChart
- `/admin/settings` существующие tabs (BrandsTab/CategoriesTab/MarketplacesTab) — pattern для нового CronScheduleTab
- `/etc/systemd/system/zoiten-wb-orders.{service,timer}` — existing pattern для нового zoiten-cron-dispatch
- CRON_SECRET в /etc/zoiten.pro.env (общий для всех cron endpoints)
</canonical_refs>
