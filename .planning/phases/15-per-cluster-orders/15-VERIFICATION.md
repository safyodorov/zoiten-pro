---
phase: 15-per-cluster-orders
verified: 2026-04-22T12:20:00Z
status: human_needed
score: 6/6 must-haves verified (automated)
human_verification:
  - test: "Открыть /stock/wb и убедиться что колонка З для каждого кластера показывает разные значения (не одинаковое для всех кластеров одной карточки)"
    expected: "Кластеры с реальными заказами показывают ненулевое Z (шт/день), кластеры без заказов показывают '—'. Значения различаются между кластерами одного nmId."
    why_human: "Требует визуальной проверки в браузере на реальных данных (398 WbCardWarehouseOrders записей уже в БД). Нельзя проверить через grep/static analysis."
  - test: "Развернуть кластер (кнопка expand) для карточки с заказами и проверить per-warehouse колонку З"
    expected: "Каждый склад внутри кластера показывает ordersPerDay = ordersCount/7 (шт/день). При hover виден tooltip с остатком и количеством заказов."
    why_human: "Требует взаимодействия с UI и визуальной проверки на реальных данных."
  - test: "Убедиться что МП-колонка З (общая, card-level) по-прежнему показывает card.avgSalesSpeed7d (не per-cluster)"
    expected: "МП колонка З показывает значение общей скорости заказов по nmId (без разбивки по кластерам), не влияет на изменения Phase 15."
    why_human: "Требует визуальной проверки что правильная колонка не изменена."
---

# Phase 15: Per-Cluster Orders Verification Report

**Phase Goal:** Менеджер открывает /stock/wb и видит реальную скорость заказов per-кластер и per-склад (за 7 дней), а не единое среднее по nmId. Каждый кластер показывает свою З = сумма orders кластера / periodDays.
**Verified:** 2026-04-22T12:20:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | REQUIREMENTS.md содержит ORDERS-01, ORDERS-02, ORDERS-03 | VERIFIED | ORDERS-01: 3 вхождения, ORDERS-02: 2, ORDERS-03: 3 в файле |
| 2 | Prisma schema содержит WbCardWarehouseOrders с unique(wbCardId, warehouseId) + Cascade от WbCard | VERIFIED | `model WbCardWarehouseOrders` на строке 819, `orders WbCardWarehouseOrders[]` в WbWarehouse строка 798 |
| 3 | lib/wb-api.ts экспортирует fetchOrdersPerWarehouse + OrdersWarehouseStats, fetchAvgSalesSpeed7d сохранена | VERIFIED | 1 export function + 1 export interface, fetchAvgSalesSpeed7d = 1 вхождение |
| 4 | POST /api/wb-sync использует fetchOrdersPerWarehouse (не fetchAvgSalesSpeed7d) и выполняет clean-replace WbCardWarehouseOrders | VERIFIED | fetchOrdersPerWarehouse: 3 вхождения, fetchAvgSalesSpeed7d: 0, upsert + 2x deleteMany |
| 5 | scripts/wb-sync-stocks.js расширен секцией orders с clean-replace WbCardWarehouseOrders | VERIFIED | wbCardWarehouseOrders: 4 вхождения, supplier/orders: 1, PERIOD_DAYS: 4, isCancel: 2 |
| 6 | /stock/wb UI: collapsed cluster З = clusterData.ordersPerDay; expanded = slot.ordersPerDay; МП = card.avgSalesSpeed7d | VERIFIED | clusterOrdersPerDay: 4 вхождения в StockWbTable.tsx, calculateStockMetrics использует clusterOrdersPerDay, slot?.ordersPerDay в expanded view |

**Score:** 6/6 truths verified (automated)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prisma/schema.prisma` | Model WbCardWarehouseOrders | VERIFIED | Строка 819, включает @@unique, @@index, onDelete: Cascade |
| `prisma/migrations/20260422_phase15_orders_per_warehouse/migration.sql` | SQL миграция CREATE TABLE + CASCADE FK | VERIFIED | Файл существует, `ON DELETE CASCADE` присутствует (строка 24) |
| `.planning/REQUIREMENTS.md` | ORDERS-01..ORDERS-03 в секции v1.2 | VERIFIED | 3+ вхождений каждого требования |
| `lib/wb-api.ts` | fetchOrdersPerWarehouse + OrdersWarehouseStats | VERIFIED | 1 export function, 1 export interface, perWarehouse: 7+ вхождений |
| `tests/wb-orders-per-warehouse.test.ts` | 7 vitest тестов GREEN | VERIFIED | npm test -- wb-orders-per-warehouse: 7 passed (7) |
| `app/api/wb-sync/route.ts` | Секция orders per-warehouse + обновлённый avgSalesSpeed | VERIFIED | fetchOrdersPerWarehouse: 3, fetchAvgSalesSpeed7d: 0, wbCardWarehouseOrders.upsert: 1 |
| `scripts/wb-sync-stocks.js` | Orders section curl + clean-replace | VERIFIED | syntax OK, все паттерны найдены, секция stocks не удалена |
| `lib/stock-wb-data.ts` | WarehouseSlot.ordersPerDay, ClusterAggregate.ordersPerDay, Prisma include warehouseOrders | VERIFIED | warehouseOrders: 5, ordersCount: 10, ordersPerDay: 7, totalOrdersCount: 6 |
| `components/stock/StockWbTable.tsx` | Collapsed З = clusterData.ordersPerDay, expanded = slot.ordersPerDay | VERIFIED | clusterOrdersPerDay: 4 вхождения, slot?.ordersPerDay: 1, card.avgSalesSpeed7d: 3 (только МП и card-level) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/wb-api.ts` | statistics-api.wildberries.ru/api/v1/supplier/orders | fetch с Authorization header | WIRED | statistics-api URL: 2+ вхождений в wb-api.ts |
| `prisma/schema.prisma WbCardWarehouseOrders` | WbCard, WbWarehouse | onDelete: Cascade (wbCard) + Restrict (warehouse) | WIRED | ON DELETE CASCADE в migration.sql строка 24; orders[] relation в WbWarehouse строка 798 |
| `app/api/wb-sync/route.ts` | lib/wb-api.ts fetchOrdersPerWarehouse | import + await call | WIRED | 3 вхождения (type import + function import + usage) |
| `app/api/wb-sync/route.ts` | prisma.wbCardWarehouseOrders | tx.wbCardWarehouseOrders.upsert + deleteMany | WIRED | upsert: строка 328; deleteMany: строки 350, 358 |
| `scripts/wb-sync-stocks.js` | Statistics Orders API + prisma.wbCardWarehouseOrders | curl + async transaction | WIRED | supplier/orders: строка найдена; wbCardWarehouseOrders: 4 вхождения |
| `lib/stock-wb-data.ts` | prisma.wbCardWarehouseOrders | include: { warehouseOrders: { include: { warehouse: true } } } | WIRED | warehouseOrders: в include строка 94, в цикле строки 121, 170, 184, 199 |
| `components/stock/StockWbTable.tsx` | calculateStockMetrics с clusterOrdersPerDay | clusterData?.ordersPerDay | WIRED | `ordersPerDay: clusterOrdersPerDay` строка 324 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `StockWbTable.tsx` collapsed З | clusterOrdersPerDay | lib/stock-wb-data.ts ClusterAggregate.ordersPerDay | YES — вычисляется из WbCardWarehouseOrders.ordersCount через Prisma include | FLOWING |
| `StockWbTable.tsx` expanded З | slot.ordersPerDay | lib/stock-wb-data.ts WarehouseSlot.ordersPerDay | YES — ordersCount из WbCardWarehouseOrders делённое на periodDays | FLOWING |
| `lib/stock-wb-data.ts` | card.warehouseOrders | prisma.wbCard.findMany include warehouseOrders | YES — реальные данные из WbCardWarehouseOrders таблицы (398 записей на VPS) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| wb-orders тесты: 7/7 | npm test -- wb-orders-per-warehouse --run | 7 passed (7) | PASS |
| Phase 14+15 тесты без регрессий | npm test -- stock wb-orders wb-stocks pricing-math ... --run | 92 passed (92) | PASS |
| TypeScript компилируется | npx tsc --noEmit | 0 ошибок | PASS |
| scripts/wb-sync-stocks.js синтаксис | node --check scripts/wb-sync-stocks.js | OK | PASS |
| Визуальная проверка per-cluster З в UI | Открыть /stock/wb | — | SKIP (нужен браузер + VPS данные) |

Note: 10 тест-файлов падают в общем прогоне `npm test -- --run`, но все они из модуля ai-cs (appeal-actions, customer-actions, template-picker и др.) — не относятся к Phase 15 и существовали до этой фазы.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ORDERS-01 | 15-01 | WbCardWarehouseOrders миграция + модель с per-warehouse unique | SATISFIED | Prisma schema + migration.sql созданы, lib/wb-api.ts fetchOrdersPerWarehouse реализована, 7 тестов GREEN |
| ORDERS-02 | 15-01, 15-02 | POST /api/wb-sync синхронизирует orders per-warehouse, clean-replace в транзакции | SATISFIED | route.ts: fetchOrdersPerWarehouse + wbCardWarehouseOrders.upsert + deleteMany; script: orders section |
| ORDERS-03 | 15-02, 15-03 | /stock/wb колонка З кластера = per-cluster ordersPerDay; expanded = per-warehouse ordersPerDay | SATISFIED (automated) / NEEDS HUMAN (visual) | StockWbTable.tsx: clusterOrdersPerDay + slot.ordersPerDay подтверждены статически; визуальная корректность — человеком |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | Значимых анти-паттернов не обнаружено |

Проверены на наличие TODO/FIXME/placeholder в изменённых файлах — не найдены. Нет `return null` / `return []` без реального источника данных.

### Human Verification Required

#### 1. Per-cluster З различается между кластерами одной карточки

**Test:** Открыть /stock/wb, найти карточку с заказами (87 nmIds имеют данные), сверить колонку З в нескольких кластерах одной строки.
**Expected:** Значения З различаются между кластерами (например, ЦФО = 0.43, ЮГ = 0.14, остальные — "—"). Не должно быть одного и того же значения card.avgSalesSpeed7d во всех кластерах.
**Why human:** Требует визуального сравнения в браузере на реальных данных из БД.

#### 2. Expanded per-warehouse показывает ordersPerDay, tooltip содержит остаток

**Test:** Кликнуть кнопку expand кластера (например, ЦФО) для карточки с заказами. Проверить значения в развёрнутых ячейках складов. Навести мышь на ячейку.
**Expected:** Ячейки показывают дробные значения (ordersPerDay = ordersCount/7). Tooltip = "Остаток: N шт · Заказов/7д: M".
**Why human:** Требует взаимодействия с UI (click, hover), нельзя проверить статическим анализом.

#### 3. МП card-level колонка З не изменилась

**Test:** Проверить крайнюю левую колонку З (МП-блок, перед кластерными колонками) для любой карточки.
**Expected:** Значение card.avgSalesSpeed7d (единое для nmId, не per-cluster). Не должно быть "—" если avgSalesSpeed7d != null.
**Why human:** Убедиться что правильная колонка не затронута изменениями Phase 15.

### Gaps Summary

Нет автоматически обнаруженных пробелов. Все 6 observable truths верифицированы:
- Схема БД, миграция, TypeScript API — созданы и корректны
- Интеграция в /api/wb-sync — fetchOrdersPerWarehouse заменила fetchAvgSalesSpeed7d, clean-replace транзакция работает
- scripts/wb-sync-stocks.js — секция orders добавлена, синтаксис корректен
- lib/stock-wb-data.ts — per-cluster агрегация через Prisma include реализована
- StockWbTable.tsx — collapsed использует clusterOrdersPerDay, expanded использует slot.ordersPerDay
- Тесты: 7/7 wb-orders GREEN, 92/92 Phase 14+15 тесты GREEN, TypeScript clean
- Данные на VPS: 398 записей WbCardWarehouseOrders (был 0 до Phase 15)

Статус human_needed — все автоматические проверки пройдены, ожидается визуальная UAT на /stock/wb.

---

_Verified: 2026-04-22T12:20:00Z_
_Verifier: Claude (gsd-verifier)_
