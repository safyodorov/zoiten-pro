---
phase: 15-per-cluster-orders
plan: "03"
subsystem: stock-wb-ui
tags: [prisma-include, per-cluster, orders, aggregation, stock-wb-data, StockWbTable]
dependency_graph:
  requires: [Phase 15 Plan 01 — WbCardWarehouseOrders модель, Phase 14 lib/stock-wb-data.ts, Phase 14 StockWbTable.tsx]
  provides: [per-cluster ordersPerDay в ClusterAggregate, per-warehouse ordersPerDay в WarehouseSlot, collapsed З от кластерной скорости, expanded З per-warehouse]
  affects: [lib/stock-wb-data.ts, components/stock/StockWbTable.tsx]
tech_stack:
  added: []
  patterns: [Prisma include warehouseOrders, Map<warehouseId, orders> lookup, второй проход per-cluster ordersPerDay, expanded tooltip с остатком]
key_files:
  created: []
  modified:
    - lib/stock-wb-data.ts
    - components/stock/StockWbTable.tsx
decisions:
  - "Expanded per-warehouse: показывает ordersPerDay (не quantity) — v1 spec; quantity виден через title tooltip"
  - "WbCardWarehouseOrders пустая таблица → all ordersPerDay = null → UI показывает '—' — корректный fallback без данных"
  - "МП card-level колонка З сохраняет card.avgSalesSpeed7d: card-level fallback используется для общего nmId-view"
  - "allWarehouseIds = union(stocks, orders) — склад может быть только в orders и всё равно попадает в кластерные колонки"
metrics:
  duration: "~2.5 минуты"
  completed_date: "2026-04-22"
  tasks: 2
  files: 2
---

# Phase 15 Plan 03: stock-wb-data агрегация per-cluster orders + StockWbTable колонка З

**Один абзац:** Обновлены интерфейсы WarehouseSlot и ClusterAggregate полями ordersCount/ordersPerDay и totalOrdersCount/ordersPerDay соответственно; WbStockRow получил поле periodDays. Prisma include расширен `warehouseOrders: { include: { warehouse: true } }`. Агрегация строит Map<warehouseId, orders> параллельно с Map stocks, затем объединяет по union(warehouseIds), второй проход вычисляет per-cluster ordersPerDay = totalOrdersCount / cardPeriodDays. StockWbTable.tsx: collapsed view колонка З теперь показывает clusterData.ordersPerDay (не card.avgSalesSpeed7d), Об/Д пересчитываются от этой же скорости; expanded per-warehouse показывает slot.ordersPerDay с tooltip-ом containing остаток+ordersCount; МП card-level колонка З сохраняет fallback avgSalesSpeed7d.

## Артефакты изменены

| Файл | Что изменено |
|------|--------------|
| `lib/stock-wb-data.ts` | Интерфейсы WarehouseSlot/ClusterAggregate/WbStockRow расширены Phase 15 полями; Prisma include.warehouseOrders; Map-based orders lookup; union allWarehouseIds; второй проход ordersPerDay per-cluster |
| `components/stock/StockWbTable.tsx` | Collapsed: clusterOrdersPerDay = clusterData.ordersPerDay, calculateStockMetrics+deficitThreshold с clusterOrdersPerDay; Expanded: slot.ordersPerDay с title tooltip |

## Новые поля в интерфейсах

### WarehouseSlot (расширение)

```typescript
ordersCount: number           // 0 если нет записи в WbCardWarehouseOrders
ordersPerDay: number | null   // ordersCount / periodDays, null если нет записи
```

### ClusterAggregate (расширение)

```typescript
totalOrdersCount: number | null   // SUM ordersCount всех складов кластера; null если 0 записей
ordersPerDay: number | null       // totalOrdersCount / cardPeriodDays
```

### WbStockRow (расширение)

```typescript
periodDays: number | null         // periodDays из первой WbCardWarehouseOrders записи (обычно 7)
```

## UX изменения (что видит пользователь)

- **Collapsed cluster view**: колонка **З** теперь показывает реальную скорость заказов per-кластер (из WbCardWarehouseOrders), не единую card.avgSalesSpeed7d. **Об** и **Д** пересчитаны от этой же скорости — корректная картина по кластеру.
- **Expanded per-warehouse view**: ячейки показывают ordersPerDay per-склад (шт/день с дробями). При наведении (tooltip title) — остаток + количество заказов за period.
- **МП card-level columns**: без изменений — З по-прежнему card.avgSalesSpeed7d как fallback для общего nmId-view.
- **Пустые данные** (WbCardWarehouseOrders = 0 записей): все per-cluster/per-warehouse З = "—"; МП З показывает avgSalesSpeed7d если синхронизирован; Об/Д per-cluster = null → "—".

## Integration Notes

UI теперь потребляет данные из WbCardWarehouseOrders, наполняемые через Plan 15-02 (`scripts/wb-sync-stocks.js` → `fetchOrdersPerWarehouse` → upsert). UAT должен проводиться **после deploy + запуска wb-sync** на VPS.

**Последовательность для UAT:**
1. `bash deploy.sh` на VPS — мигрирует таблицу WbCardWarehouseOrders
2. `POST /api/wb-sync` (кнопка синхронизации на /cards/wb) — наполняет WbCardWarehouseOrders
3. Открыть `/stock/wb` — кластеры с реальными заказами покажут ненулевую З, пустые — "—"
4. Развернуть кластер → per-warehouse З = ordersPerDay, tooltip = остаток + ordersCount

## Известные ограничения

- Per-warehouse expanded view показывает **ТОЛЬКО ordersPerDay** (шт/день). Stock quantity per-склад виден в tooltip при hover, но не как отдельная ячейка. Это intentional v1 decision из UI-SPEC.
- WbCardWarehouseOrders сейчас пустая (0 записей) — все З показывают "—" до первого wb-sync после deploy.

## Отклонения от плана

Отклонений нет — план выполнен точно по спецификации.

## Self-Check: PASSED

- [x] `lib/stock-wb-data.ts` содержит `warehouseOrders` (5 вхождений)
- [x] `lib/stock-wb-data.ts` содержит `ordersCount` (≥ 4 вхождений: 10)
- [x] `lib/stock-wb-data.ts` содержит `ordersPerDay` (≥ 5 вхождений: 7)
- [x] `lib/stock-wb-data.ts` содержит `totalOrdersCount` (≥ 3 вхождений: 6)
- [x] `lib/stock-wb-data.ts` содержит `cardPeriodDays` (≥ 2 вхождений: 5)
- [x] `lib/stock-wb-data.ts` содержит `totalStock: number | null`
- [x] `components/stock/StockWbTable.tsx` содержит `clusterOrdersPerDay` (4 вхождения)
- [x] `components/stock/StockWbTable.tsx` содержит `ordersPerDay: clusterOrdersPerDay` в calculateStockMetrics
- [x] `components/stock/StockWbTable.tsx` содержит `slot?.ordersPerDay`
- [x] `components/stock/StockWbTable.tsx` содержит `card.avgSalesSpeed7d` ровно 3 раза (МП З + card-level calculateStockMetrics + deficitThreshold)
- [x] `npx tsc --noEmit` exit 0
- [x] stock тесты: 33/33 GREEN
- [x] wb-orders тесты: 7/7 GREEN
- [x] commit 2af59ea (задача 1) существует
- [x] commit 3c859c1 (задача 2) существует
