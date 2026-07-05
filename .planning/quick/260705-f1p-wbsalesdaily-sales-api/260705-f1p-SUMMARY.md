---
phase: quick-260705-f1p
plan: "01"
subsystem: sales-plan
tags: [wb-api, sales-daily, redemption, cron, plan-fact]
dependency_graph:
  requires: []
  provides: [WbSalesDaily table, fetchSalesDaily, aggregateSalesRows, wb-sales-daily cron, redemption-fact in /sales-plan]
  affects: [lib/sales-plan/data.ts, app/(dashboard)/sales-plan/page.tsx, app/api/cron/dispatch/route.ts]
tech_stack:
  added: [WbSalesDaily model, Statistics Sales API supplier/sales]
  patterns: [no-FK analytic table, clean-replace cron pattern, redemption vs funnel dual source]
key_files:
  created:
    - prisma/migrations/20260705_wb_sales_daily/migration.sql
    - app/api/cron/wb-sales-daily/route.ts
    - tests/wb-sales-daily.test.ts
  modified:
    - prisma/schema.prisma
    - lib/wb-api.ts
    - app/api/cron/dispatch/route.ts
    - lib/sales-plan/data.ts
    - app/(dashboard)/sales-plan/page.tsx
    - components/sales-plan/PlanFactControls.tsx
    - components/sales-plan/PlanFactMatrix.tsx
    - components/sales-plan/PlanFactSummaryCards.tsx
decisions:
  - "WbSalesDaily без FK на WbCard.nmId — паттерн проекта (исторические данные выживают при soft-delete)"
  - "clean-replace (deleteMany≥dateFrom + createMany) в одной транзакции — идемпотентность без per-row upsert"
  - "redemptionSettledThroughIso = today−2 (не today−7 как funnel) — выкупы по дате реализации финализируются быстрее"
  - "factSource dual-routing: buyout-метрики → redemptionByProduct/redemptionCompany; orders-метрики → funnel (byProductMap/companyFactMap)"
  - "aggregateSalesRows: pure function, не зависит от Prisma/Next — тестируется изолированно"
  - "fetchSalesDaily использует wbFetch (cooldown bucket statistics-sales) — защита от 429 через WbRateLimitError"
metrics:
  duration: "~15 min"
  completed: "2026-07-05"
  tasks: 3
  files: 9
---

# Quick 260705-f1p: Факт выкупов по дате реализации (WbSalesDaily)

## One-liner

WbSalesDaily таблица + cron (~04:30 МСК) из Statistics Sales API + /sales-plan Сводный переключён на redemption-факт (дата реализации, settledThrough=today−2).

## Problem

Факт выкупов в /sales-plan брался из `WbCardFunnelDaily.buyoutsSumRub` — дата ЗАКАЗА (когорта). Для свежего периода когорта не дозрела: 01–05.07 показывал ~1,85 М/день вместо реальных ~3,3–3,9 М/день, что ломало сравнение с ИУ (2 380 805 ₽/день) и KPI «Факт за период».

## Solution

1. **WbSalesDaily** — новая аналитическая таблица (no-FK, дата реализации):
   - `buyoutsRub/Count`: Σ `priceWithDisc` где `saleID.startsWith('S')` — цена продавца до СПП
   - `returnsRub/Count`: Σ `priceWithDisc` где `saleID` не 'S'
   - `forPayRub`: Σ `forPay` по выкупам

2. **aggregateSalesRows** (pure) + **fetchSalesDaily** (wbFetch → bucket statistics-sales):
   - `aggregateSalesRows`: чистая функция, тестируется без Prisma
   - `fetchSalesDaily`: `Statistics API sales` → cooldown + WbRateLimitError при 429

3. **Cron wb-sales-daily** (GET `/api/cron/wb-sales-daily`):
   - Защищён `x-cron-secret`
   - ?days=1..60 backfill override; auto-backfill 30 дней при пустой таблице
   - clean-replace: `deleteMany(date≥dateFrom) + createMany` в одной транзакции
   - Уpsert `wbSalesDailyLastRun` в AppSetting

4. **dispatch**: `wbSalesDailyCronTime` (default 04:30) + `wbSalesDailyLastRun` в findMany; ветка `shouldFireCron → import wb-sales-daily/route`

5. **loadFactDaily** расширен: `redemptionCompany`, `redemptionByProduct`, `redemptionSettledThroughIso` (today−2)

6. **/sales-plan page**: для buyout-метрик (`buyouts-rub`, `buyouts-units`) — `factSource = redemptionByProduct`, `companySource = redemptionCompany`, `settledIso = today−2`; для orders-метрик — funnel (без изменений)

7. **UI**: метки «Выкуплено ₽ (реализация)»/«Выкуплено шт (реализация)»; footer-note в матрице; подпись в карточке «Факт за период»

## What was NOT changed

- WbCardFunnelDaily и per-товар ячейки Товаров — нетронуты (остаются для когортного плана)
- Golden ИУ 438 068 120 ₽, `iuMetric='buyouts'`, `DEFAULT_IU_TARGETS` 2 380 805 ₽/день
- `buildPlanFactReport` сигнатура/логика — без изменений
- Существующий СПП-fallback вызов supplier/sales на строке ~488 — не тронут

## Deviations from Plan

None — план выполнен точно.

## Self-Check

### Files exist
- `prisma/migrations/20260705_wb_sales_daily/migration.sql` — created
- `app/api/cron/wb-sales-daily/route.ts` — created
- `tests/wb-sales-daily.test.ts` — created

### Commits
- `3806dc7` — Task 1: WbSalesDaily + миграция + aggregateSalesRows/fetchSalesDaily + тест
- `29ab686` — Task 2: sync-роут + cron-wire в dispatch
- `c001787` — Task 3: Сводный /sales-plan на redemption-факт

### Test results
- `npx vitest run tests/wb-sales-daily.test.ts` — 2 passed
- `npx vitest run tests/sales-plan-*.test.ts tests/wb-sales-daily.test.ts` — 32 passed
- Существующие 118 sales-plan тестов не сломаны (appeal-actions/template-picker/customer-actions failures — pre-existing, не связаны с задачей)
- `npx tsc --noEmit` — чисто
- `npx prisma validate` — схема валидна

## Self-Check: PASSED
