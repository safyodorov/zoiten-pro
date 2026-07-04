---
phase: 25-v2-h2-2026
plan: "03"
subsystem: sales-plan
tags: [loader, prisma, bootstrap, data-layer]
dependency_graph:
  requires: [25-01, 25-02]
  provides: [loadSalesPlanInputs, loadFactDaily, bootstrap-migration]
  affects: [sales-plan/engine.ts, SalesPlanMonthLevel, AppSetting]
tech_stack:
  added: []
  patterns:
    - DI PrismaClient (паттерн lib/stock-data.ts)
    - funnel-агрегация settled/7d/seed (паттерн lib/sales-forecast.ts)
    - 4-уровневая buyout% fallback-цепочка (own→legacy→subcategory→global)
    - resolveArrivalBatches (Prisma → pure-функция)
    - idempotent deleteMany+createMany bootstrap (паттерн bootstrap-balance-snapshot.ts)
key_files:
  created:
    - lib/sales-plan/data.ts
    - scripts/bootstrap-sales-plan-monthly.ts
  modified: []
decisions:
  - DI PrismaClient — функции принимают db, не импортируют глобальный prisma; готово к переиспользованию в RSC-страницах
  - buyoutPct в SalesPlanMonthLevel хранится 0..100, в движке нужно 0..1 — конвертируется в loader (не в схеме)
  - minLeadTimeByProduct — берём min среди всех SupplierProductLink для товара (консервативная оценка)
  - loadFactDaily company-level не фильтрует по nmId — берёт всё из funnel за период (включая 73 непривязанных)
  - bootstrap не создаёт строки с targetOrdersPerDay=null AND priceRub=null (избыточно)
  - leadTimes2 создаётся только если пользователь менял с дефолта 3/3 — без лишней записи при чистой БД
metrics:
  duration: "~8 минут"
  completed_date: "2026-07-04"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
---

# Phase 25 Plan 03: Prisma-загрузчик + bootstrap-скрипт

**One-liner:** DI-загрузчик `loadSalesPlanInputs/loadFactDaily` с funnel-агрегацией и resolveArrivalBatches + идемпотентный bootstrap переноса baselineOverrides/priceOverrides → SalesPlanMonthLevel

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | lib/sales-plan/data.ts — loadSalesPlanInputs + loadFactDaily | 2b2d131 | lib/sales-plan/data.ts |
| 2 | scripts/bootstrap-sales-plan-monthly.ts — миграция overrides | 66bc186 | scripts/bootstrap-sales-plan-monthly.ts |

## What Was Built

### lib/sales-plan/data.ts

`loadSalesPlanInputs(db, params)` — основная сборочная функция:
- Товары с иерархией (Brand→Direction, Category, Subcategory), WB-артикулами, месячными уровнями, дневными overrides, виртуальными закупками (SUGGESTED+ACCEPTED)
- Funnel-агрегация за один запрос, три окна: settled [today−37;today−7] для buyout%/avgPrice, last7d для baseline, seed [today−3;today−1] для T+3 выкупов первых дней
- 4-уровневая buyout% цепочка: own (weighted per ords7) → legacy (WbCard.buyoutPercent) → subcategory → global
- stockNow = Σ WbCard.stockQty + ivanovoStock
- Приходы: Purchase PLANNED/ACTIVE с qtyRemaining (max(0, qty − WAREHOUSE.qty)), TRANSIT-stage, leadTimeDays из SupplierProductLink; прогоняются через resolveArrivalBatches
- Все выходы сериализуемы (Date→ISO string, Decimal→number)

`loadFactDaily(db, from, to)` — факт двумя разрезами:
- company-level: SUM по ВСЕМ nmId funnel GROUP BY date (включая 73 непривязанных) — для сравнения с ИУ
- product-level: через MarketplaceArticle join (nmId → productId) — для строк товаров
- settledThroughIso = today−7 (дни свежее помечаются unsettled на стороне потребителя)

### scripts/bootstrap-sales-plan-monthly.ts

Идемпотентный одноразовый скрипт для деплоя:
- Читает AppSetting `salesPlan.baselineOverrides`, `salesPlan.priceOverrides`, `salesPlan.leadTimes`
- Переносит baselineOverrides → SalesPlanMonthLevel.targetOrdersPerDay с семантикой §2.7:
  - месяцы до `ProductIncoming.expectedDate` → baselineOverride (или null)
  - месяцы от expectedDate → `plannedSalesPerDay ?? baselineOverride ?? null`
  - товар без ProductIncoming → baselineOverride на все 6 месяцев H2-2026
- Переносит priceOverrides → SalesPlanMonthLevel.priceRub на все месяцы
- Переносит leadTimes → salesPlan.leadTimes2 (только если пользователь менял с дефолта 3/3)
- Транзакция: deleteMany(productId + horizonMonths) + createMany — повторный запуск безопасен
- Standalone: `import { PrismaClient } from "@prisma/client"` напрямую, без @/lib

## Verification

- `npx tsc --noEmit` — обе задачи без ошибок TS
- data.ts: ноль React/Next импортов, DI PrismaClient, PRODUCT_HIERARCHY_ORDER_BY, resolveArrivalBatches
- bootstrap: standalone tsx, идемпотентен, учитывает семантику plannedSalesPerDay

## Deviations from Plan

None — план исполнен точно. Единственная автоматическая правка (Rule 2): в загрузчике добавлен null-guard для `link.productId` в SupplierProductLink (поле nullable в схеме), предотвращает TS-ошибку.

## Prod Tasks (Деплой-задачи VPS)

**ОБЯЗАТЕЛЬНО выполнить после деплоя на VPS:**

1. Применить миграцию (если ещё не применена):
   ```bash
   cd /opt/zoiten-pro && npx prisma migrate deploy
   ```

2. Запустить bootstrap-скрипт (перенос старых overrides):
   ```bash
   set -a; . /etc/zoiten.pro.env; set +a
   npx tsx scripts/bootstrap-sales-plan-monthly.ts
   ```
   Скрипт идемпотентен — повторный запуск безопасен.

3. После bootstrap старый UI `/sales-plan` продолжает работать без изменений.

## Self-Check: PASSED

- [x] lib/sales-plan/data.ts создан (2b2d131)
- [x] scripts/bootstrap-sales-plan-monthly.ts создан (66bc186)
- [x] `npx tsc --noEmit` — 0 ошибок
- [x] loadSalesPlanInputs + loadFactDaily экспортированы
- [x] PRODUCT_HIERARCHY_ORDER_BY применён
- [x] resolveArrivalBatches вызывается
- [x] wbCardFunnelDaily запрашивается
- [x] company + byProduct в loadFactDaily
- [x] Ноль React/Next импортов в data.ts
- [x] new PrismaClient() в bootstrap
- [x] salesPlanMonthLevel в bootstrap
- [x] leadTimes2 в bootstrap
- [x] plannedSalesPerDay/expectedDate семантика реализована
- [x] $disconnect + process.exit в bootstrap
- [x] Ноль @/lib imports в bootstrap
