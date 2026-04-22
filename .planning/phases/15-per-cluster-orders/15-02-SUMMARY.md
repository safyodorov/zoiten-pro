---
phase: 15-per-cluster-orders
plan: "02"
subsystem: wb-orders
tags: [wb-api, orders, per-warehouse, clean-replace, prisma, script]
dependency_graph:
  requires: [Phase 15-01 fetchOrdersPerWarehouse, WbCardWarehouseOrders модель, stableWarehouseIdFromName helper]
  provides: [POST /api/wb-sync orders per-warehouse секция, scripts/wb-sync-stocks.js orders секция]
  affects: [app/api/wb-sync/route.ts, scripts/wb-sync-stocks.js]
tech_stack:
  added: []
  patterns: [clean-replace per wbCardId в транзакции, auto-insert unknown warehouses, degraded mode try/catch, rate-limit single request]
key_files:
  created: []
  modified:
    - app/api/wb-sync/route.ts
    - scripts/wb-sync-stocks.js
decisions:
  - "fetchAvgSalesSpeed7d заменён на fetchOrdersPerWarehouse — один запрос к Orders API покрывает card-level avg/yesterday и per-warehouse breakdown"
  - "ordersStats.avg7d → ordersStats.avg (новое поле OrdersWarehouseStats из Plan 15-01)"
  - "warehouseOrdersUpdated добавлен в response /api/wb-sync — счётчик для мониторинга"
  - "scripts/wb-sync-stocks.js использует findUnique+update/create (не upsert) для WbCardWarehouseOrders — единообразие с паттерном stocks скрипта"
metrics:
  duration: "~8 минут"
  completed_date: "2026-04-22"
  tasks: 2
  files: 2
---

# Phase 15 Plan 02: Интеграция fetchOrdersPerWarehouse в /api/wb-sync + расширение scripts/wb-sync-stocks.js

**Один абзац:** POST /api/wb-sync теперь делает ровно один запрос к WB Statistics Orders API через fetchOrdersPerWarehouse(nmIds, 7) — этот один вызов покрывает и card-level поля (avgSalesSpeed7d, ordersYesterday через .avg/.yesterday) и per-warehouse breakdown. После существующего stocks clean-replace блока добавлен новый блок для WbCardWarehouseOrders: lookup by name → auto-insert с needsClusterReview=true → upsert → deleteMany NOT IN. Response расширен warehouseOrdersUpdated. scripts/wb-sync-stocks.js получил полную секцию orders: curl /supplier/orders → isCancel фильтрация → group by (nmId, warehouseName) → per-nmId транзакция с clean-replace WbCardWarehouseOrders. Оба файла — tsc 0 ошибок, node --check OK.

## Артефакты изменены

| Файл | Что изменено |
|------|-------------|
| `app/api/wb-sync/route.ts` | Замена fetchAvgSalesSpeed7d → fetchOrdersPerWarehouse; обновлён mapping .avg7d → .avg; добавлен блок clean-replace WbCardWarehouseOrders; response +warehouseOrdersUpdated |
| `scripts/wb-sync-stocks.js` | Добавлена секция orders (~110 строк): curl + group + per-nmId транзакция + clean-replace; summary разделён [STOCKS] vs [ORDERS] |

## Response shape /api/wb-sync (для Plan 15-03)

```json
{
  "synced": 267,
  "total": 267,
  "pricesLoaded": 267,
  "discountsLoaded": 96,
  "warehouseStocksUpdated": 267,
  "warehouseOrdersUpdated": 245,
  "errors": []
}
```

Поле `warehouseOrdersUpdated` — количество WbCard для которых была создана/обновлена per-warehouse orders запись.

## Integration note для Plan 15-03

Данные в `WbCardWarehouseOrders` доступны через:

```typescript
const orders = await prisma.wbCard.findMany({
  include: {
    warehouseOrders: {
      include: { warehouse: true }
    }
  }
})
```

Relation `warehouseOrders` определена в WbCard → WbCardWarehouseOrders (Plan 15-01 schema).

Для per-cluster агрегации: группировать по `warehouse.cluster` → sum `ordersCount` → вычислять avg per cluster.

## Acceptance Criteria — Выполнено

| Критерий | Результат |
|----------|-----------|
| `fetchOrdersPerWarehouse` в route.ts | 3 вхождения (import type + import func + usage) |
| `fetchAvgSalesSpeed7d` в route.ts | 0 (удалён) |
| `tx.wbCardWarehouseOrders.upsert` | 1 вхождение |
| `tx.wbCardWarehouseOrders.deleteMany` | 2 вхождения (clean + empty case) |
| `warehouseOrdersUpdated` в route.ts | 4 вхождения (declare + log + response) |
| `needsClusterReview: true` в route.ts | 2 (stocks + orders) |
| `fetchStocksPerWarehouse` в route.ts | 3 (не удалён) |
| `wbCardWarehouseOrders` в script | 4 вхождения |
| `supplier/orders` в script | 1 |
| `isCancel` в script | 2 |
| `PERIOD_DAYS` в script | 4 |
| `wbCardWarehouseStock` в script | 4 (>= 3, старая секция не удалена) |
| `new PrismaClient` в script | 1 (единственный клиент) |
| `node --check scripts/wb-sync-stocks.js` | OK |
| `npx tsc --noEmit` | 0 ошибок |

## Отклонения от плана

Отклонений нет — план выполнен точно по спецификации.

## Known Stubs

Миграция `prisma/migrations/20260422_phase15_orders_per_warehouse/migration.sql` (из Plan 15-01) ещё не применена на VPS. Таблица `WbCardWarehouseOrders` будет создана при следующем `deploy.sh`. Это intentional — не блокирует цель плана.

## Self-Check: PASSED

- [x] `app/api/wb-sync/route.ts` содержит `fetchOrdersPerWarehouse` (3 вхождения)
- [x] `app/api/wb-sync/route.ts` НЕ содержит `fetchAvgSalesSpeed7d` (0 вхождений)
- [x] `app/api/wb-sync/route.ts` содержит `wbCardWarehouseOrders` (3 вхождения)
- [x] `app/api/wb-sync/route.ts` содержит `warehouseOrdersUpdated` (4 вхождения)
- [x] `scripts/wb-sync-stocks.js` содержит `wbCardWarehouseOrders` (4 вхождения)
- [x] `scripts/wb-sync-stocks.js` содержит `supplier/orders` (1 вхождение)
- [x] commit e469edd (задача 1) существует
- [x] commit 1eca1b7 (задача 2) существует
- [x] `npx tsc --noEmit` exit 0
- [x] `node --check scripts/wb-sync-stocks.js` exit 0
