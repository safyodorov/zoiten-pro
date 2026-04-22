---
phase: 15-per-cluster-orders
plan: "01"
subsystem: wb-orders
tags: [prisma, migration, wb-api, vitest, orders, per-warehouse]
dependency_graph:
  requires: [Phase 14 WbCardWarehouseStock, WbWarehouse модель, lib/wb-api.ts fetchAvgSalesSpeed7d паттерн]
  provides: [WbCardWarehouseOrders модель, fetchOrdersPerWarehouse функция, OrdersWarehouseStats интерфейс]
  affects: [prisma/schema.prisma, lib/wb-api.ts]
tech_stack:
  added: []
  patterns: [TDD red-green, Prisma ручная миграция, Statistics API per-warehouse groupBy, isCancel фильтрация]
key_files:
  created:
    - prisma/migrations/20260422_phase15_orders_per_warehouse/migration.sql
    - tests/wb-orders-per-warehouse.test.ts
  modified:
    - .planning/REQUIREMENTS.md
    - prisma/schema.prisma
    - lib/wb-api.ts
decisions:
  - "WbWarehouse.orders без onDelete Cascade (Restrict) — паттерн Phase 14 STOCK-01: auto-insert неизвестных складов через stableWarehouseIdFromName, не удалять"
  - "fetchAvgSalesSpeed7d сохранена без изменений — backward compat, новый код использует fetchOrdersPerWarehouse"
  - "avg в OrdersWarehouseStats = count / periodDays (не / 7 hardcoded) — поддерживает произвольный periodDays"
metrics:
  duration: "~5 минут"
  completed_date: "2026-04-22"
  tasks: 2
  files: 5
---

# Phase 15 Plan 01: Schema миграция WbCardWarehouseOrders + fetchOrdersPerWarehouse + тесты

**Один абзац:** Создана Prisma модель WbCardWarehouseOrders с unique(wbCardId, warehouseId) + onDelete Cascade от WbCard + SQL миграция готова к deploy.sh на VPS. Реализована fetchOrdersPerWarehouse(nmIds, periodDays=7) → Map<nmId, {avg, yesterday, perWarehouse: Map<string,number>, periodDays}> за один HTTP запрос к WB Statistics Orders API. Функция фильтрует isCancel=true, группирует по warehouseName, корректно обрабатывает 429 retry и пустой массив nmIds. REQUIREMENTS.md расширён секцией Orders Per-Warehouse (ORDERS-01/02/03). Все 7 vitest тестов GREEN, tsc --noEmit чистый.

## Артефакты созданы

| Файл | Что создано |
|------|-------------|
| `prisma/migrations/20260422_phase15_orders_per_warehouse/migration.sql` | CREATE TABLE WbCardWarehouseOrders + UNIQUE INDEX + FK CASCADE от WbCard |
| `tests/wb-orders-per-warehouse.test.ts` | 7 vitest тестов (пустой массив, happy path, isCancel фильтрация, нерелевантные nmId, periodDays=14, HTTP 500, пустой warehouseName) |

## Артефакты изменены

| Файл | Что добавлено |
|------|---------------|
| `.planning/REQUIREMENTS.md` | Секция `### Orders Per-Warehouse (Phase 15)` с ORDERS-01/02/03, строки Traceability, footer строка |
| `prisma/schema.prisma` | `model WbCardWarehouseOrders` + `WbCard.warehouseOrders[]` + `WbWarehouse.orders[]` |
| `lib/wb-api.ts` | `export interface OrdersWarehouseStats` + `export async function fetchOrdersPerWarehouse` (118 строк) |

## Interfaces опубликованы для Plan 15-02 и 15-03

### WbCardWarehouseOrders (Prisma)

```prisma
model WbCardWarehouseOrders {
  id          String      @id @default(cuid())
  wbCardId    String      // → WbCard.id onDelete: Cascade
  warehouseId Int         // → WbWarehouse.id onDelete: Restrict
  ordersCount Int         @default(0)
  periodDays  Int         @default(7)
  updatedAt   DateTime    @updatedAt
  @@unique([wbCardId, warehouseId])
}
```

### fetchOrdersPerWarehouse (TypeScript)

```typescript
export interface OrdersWarehouseStats {
  avg: number                        // ordersCount / periodDays (шт/день)
  yesterday: number                  // заказы за вчерашний день (MSK)
  perWarehouse: Map<string, number>  // warehouseName → count
  periodDays: number
}

export async function fetchOrdersPerWarehouse(
  nmIds: number[],
  periodDays: number = 7,
): Promise<Map<number, OrdersWarehouseStats>>
```

## Тесты — 7/7 GREEN

| # | Тест | Статус |
|---|------|--------|
| 1 | пустой массив nmIds → пустой Map без HTTP | GREEN |
| 2 | happy path — агрегация per warehouseName (2 nmId, 3 склада) | GREEN |
| 3 | isCancel=true исключаются из avg и perWarehouse | GREEN |
| 4 | нерелевантные nmId (999 не в запросе) отфильтрованы | GREEN |
| 5 | periodDays=14 → avg=count/14, URL содержит dateFrom | GREEN |
| 6 | HTTP 500 (non-429) → пустой Map, не throw | GREEN |
| 7 | пустой warehouseName не попадает в perWarehouse (avg считает) | GREEN |

## Отклонения от плана

Отклонений нет — план выполнен точно по спецификации.

## Known Stubs

Миграция `prisma/migrations/20260422_phase15_orders_per_warehouse/migration.sql` создана вручную и **не применена локально** (нет локальной PostgreSQL). Применится на VPS через `deploy.sh` (паттерн Phase 14). Это intentional stub — не блокирует цель плана (API функция работает, тесты GREEN).

## Self-Check: PASSED

- [x] `.planning/REQUIREMENTS.md` содержит ORDERS-01 (3 вхождения)
- [x] `prisma/schema.prisma` содержит `model WbCardWarehouseOrders` (1 вхождение)
- [x] `prisma/schema.prisma` содержит `warehouseOrders` в WbCard (1 вхождение)
- [x] `prisma/migrations/20260422_phase15_orders_per_warehouse/migration.sql` существует
- [x] `lib/wb-api.ts` содержит `export async function fetchOrdersPerWarehouse` (1 вхождение)
- [x] `lib/wb-api.ts` содержит `export interface OrdersWarehouseStats` (1 вхождение)
- [x] `tests/wb-orders-per-warehouse.test.ts` существует
- [x] 7 тестов GREEN: `npm test -- wb-orders-per-warehouse --run`
- [x] `npx tsc --noEmit` exit 0
- [x] `fetchAvgSalesSpeed7d` НЕ удалена
- [x] commit 42534c0 (задача 1) существует
- [x] commit e1a8b56 (задача 2) существует
