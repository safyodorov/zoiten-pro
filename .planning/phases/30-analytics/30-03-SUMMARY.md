# Phase 30 — Plan 03 Summary (Wave 1: контракты + движок)

**Status:** ✅ executed + verified (14/14 golden-тестов зелёные; 0 новых tsc-ошибок в analytics/*).
**Executed:** 2026-07-13 (branch `gsd/phase-30-analytics`, local — no push/deploy).

## Файлы
- `lib/analytics/types.ts` — контракты payload (PURE, без prisma/сети).
- `lib/analytics/engine.ts` — чистый движок.
- `tests/analytics-engine.test.ts` — 14 golden-тестов.

## Экспортируемые контракты (импортируют 30-04 … 30-12)
- **`NicheRunPayload`** = `{ version:1, dateFrom, dateTo, skus: SkuPayload[] }` — форма `NicheRun.payloadJson`.
- **`SkuPayload`** — покрывает все 5 вкладок: `nmId, brand, seller, subject, name, rating, feedbacksCount, mainPhoto, listingPhotos[≤5], characteristics[{name,value}], funnel: FunnelAggregate, funnelDays: FunnelDayRaw[], priceDays[{dt,value}], queries: QueryPositionSeries[], revenue, complete, incompleteReasons?`.
- **`FunnelDayRaw`** (сверено с фикстурой): `nmId, dt, viewCount, openCard, addToCart, orders, ordersSum, buyoutCount, medianPrice`.
- **`FunnelMonthTotals`** = `{ viewCount, orders, ordersSum }` — источник объёмов «÷30» (из `data.salesFunnel.byMonth`).
- **`FunnelAggregate`** = `{ viewsPerDay, ordersPerDay, ordersSumPerDay, ctr, clickToCart, cartToOrder, clickToOrder, buyoutPct, medianPriceWallet }`.
- **`QueryPositionSeries`** = `{ query, frequency(=wb_count), days: PositionDay[], avgPosition }`; **`PositionDay`** = `{ dt, organic:number|null, ad: {position,cpm,placementType,boostPosition}|null }`.
- Типы: `SortMode = "revenue"|"clickToOrder"`, `MetricKey`, `CompletenessResult`, `SkuCompletenessInput`, `Characteristic`, `AdPosition`.
- Константы: `NICHE_RUN_SNAPSHOT_VERSION=1`, **`DAYS_IN_MONTH=30`** (делитель объёмов), `WALLET_PRICE_FACTOR=0.97`.

## Сигнатуры движка (engine.ts)
- `aggregateFunnel(days: FunnelDayRaw[], monthly?: FunnelMonthTotals): FunnelAggregate` — объёмы = (monthly ?? Σbyday) **÷ 30 (КОНСТАНТА)**; конверсии/выкуп «от сумм» (Σ/Σ); `clickToOrder = Σorders/Σopen == clickToCart×cartToOrder`; `medianPriceWallet = avg(medianPrice)×0.97`; защита от /0.
- `sortSkus(skus, mode)` — desc по revenue / funnel.clickToOrder, тай-брейк nmId (единый порядок всех вкладок + PDF).
- `evaluateCompleteness(skus)` — ранг по revenue desc; сбой в топ-10 → FAILED, 11–30 → PARTIAL, иначе OK.
- `averagePositionByQuery(days)` — средняя organic по дням присутствия; все прочерки → null.

## Verification
- `npx vitest run tests/analytics-engine.test.ts` → **14 passed** (÷30 на фикстуре n=28; «от сумм» ≠ среднему %; clickToOrder=произведение; цена×0.97; FAILED/PARTIAL по рангу; avg игнорит прочерки).
- `npx tsc --noEmit`: 0 ошибок в `lib/analytics/*` (баланс проекта — 507 пред-существующих ошибок в старом коде, не связаны; проект собирается `next build`).
- HIGH-1 (plan-check) закрыт в коде: делитель `DAYS_IN_MONTH`, тест на n=28 падал бы при делении на n.

## Downstream unblocked
30-04 (парсер → FunnelMonthTotals/FunnelDayRaw), 30-05 (mpstats → QueryPositionSeries/PositionDay), 30-06 (скан → listingPhotos/characteristics), 30-07 (collector собирает SkuPayload/NicheRunPayload), 30-10/11 (вкладки читают SkuPayload), 30-12 (PDF из NicheRunPayload).
