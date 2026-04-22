---
phase: 14-stock
plan: 03
subsystem: wb-sync-per-warehouse
tags: [wb-api, statistics-api, per-warehouse, prisma, vitest, deviation]
dependency_graph:
  requires:
    - "14-01 (WbWarehouse + WbCardWarehouseStock schema)"
    - "14-02 (WbWarehouse seed — 75 известных складов с warehouseId и кластерами)"
  provides:
    - lib/wb-api.ts fetchStocksPerWarehouse + WarehouseStockItem interface
    - app/api/wb-sync/route.ts per-warehouse clean-replace transaction
    - tests/wb-stocks-per-warehouse.test.ts 9 GREEN
  affects:
    - "POST /api/wb-sync — добавлен этап per-warehouse stocks после основного sync"
    - "WbCard.stockQty — обновляется через SUM(quantity) из per-warehouse данных"
    - "Plan 14-05 — кнопка «Обновить из WB» вызывает этот endpoint"
    - "Plan 14-06 — /stock/wb таблица с кластерами читает WbCardWarehouseStock"
tech_stack:
  added: []
  patterns:
    - "Statistics API вместо Analytics API (DEVIATION — base token 403)"
    - "stableWarehouseIdFromName(): djb2 hash → Int диапазон 10M+ (нет числового ID в Statistics API)"
    - "Degraded mode: try/catch обёртка вокруг fetchStocksPerWarehouse"
    - "clean-replace в $transaction: upsert + deleteMany NOT IN (per wbCardId)"
    - "Denorm WbCard.stockQty = SUM(quantity) для backward compat /prices/wb"
    - "Auto-insert неизвестных складов с needsClusterReview=true"
key_files:
  created:
    - tests/wb-stocks-per-warehouse.test.ts
  modified:
    - lib/wb-api.ts
    - app/api/wb-sync/route.ts
decisions:
  - "Statistics API вместо Analytics API: base token даёт 403 на /api/analytics/v1/stocks-report/wb-warehouses"
  - "stableWarehouseIdFromName(djb2): Statistics API не содержит числового warehouseId — генерируем stable hash в диапазоне 10M+ (не конфликтует с реальными WB ID < 1M)"
  - "Деградированный режим: per-warehouse sync обёрнут в try/catch — основная синхронизация не падает при ошибке Statistics API"
  - "Старый fetchStocks() сохранён с @deprecated маркером — sunset 2026-06-23 (Plan STOCK-FUT-09)"
metrics:
  duration: "~15 минут"
  completed_date: "2026-04-22"
  tasks_completed: 2
  files_created: 1
  files_modified: 2
---

# Phase 14 Plan 03: WB Sync Per-Warehouse Stocks — Summary

**One-liner:** fetchStocksPerWarehouse через Statistics API с djb2 stable-ID, clean-replace транзакция per wbCardId, auto-insert неизвестных складов, 9 GREEN тестов.

---

## МАЖОРНАЯ ДЕВИАЦИЯ: Statistics API вместо Analytics API

**Обнаружена:** До начала выполнения (из user-предоставленных curl результатов на VPS 2026-04-22).

**Исходный план:** POST `https://seller-analytics-api.wildberries.ru/api/analytics/v1/stocks-report/wb-warehouses` (новый endpoint, запущен WB 2026-03-23). Требует Personal/Service token.

**Проблема:** Текущий `WB_API_TOKEN` — base-токен. Возвращает HTTP 403 "base token is not allowed" на Analytics endpoint.

**Решение:** Использовать существующий Statistics API endpoint:
```
GET https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=<1 day ago>
```

Этот endpoint уже используется в `fetchStocks()` (агрегированная версия). Curl на VPS верифицировал что ответ содержит **per-warehouse** поля: `warehouseName`, `nmId`, `quantity`, `inWayToClient`, `inWayFromClient`.

**Дополнительная проблема:** Statistics API не возвращает числовой `warehouseId` (только `warehouseName`), тогда как схема `WbCardWarehouseStock.warehouseId: Int` и FK на `WbWarehouse.id: Int`. 

**Решение:** `stableWarehouseIdFromName(name)` — djb2 хэш → Int в диапазоне `10_000_001..18_446_744`. Реальные WB warehouseId < 1M (примеры: 507, 686, 117501) — диапазоны не пересекаются.

---

## Выполненные задачи

### Task 1: fetchStocksPerWarehouse в lib/wb-api.ts + 9 тестов

**Commit:** `2156bd1`

**lib/wb-api.ts:**

Добавлена функция `fetchStocksPerWarehouse(nmIds: number[]): Promise<Map<number, WarehouseStockItem[]>>`:
- Один GET-запрос к Statistics API (`dateFrom = вчера`)
- Фильтрация по переданным nmIds на клиенте (API возвращает все nmId продавца)
- Группировка по nmId в Map
- Robust: пустой массив nmIds → ранний выход без HTTP

Добавлен интерфейс `WarehouseStockItem`:
```typescript
export interface WarehouseStockItem {
  warehouseName: string   // напр. "Невинномысск"
  quantity: number        // доступное кол-во
  inWayToClient: number   // в пути к клиенту
  inWayFromClient: number // возвраты в пути
}
```

Добавлен `@deprecated` маркер на `fetchStocks()`:
```typescript
/**
 * @deprecated Использовать fetchStocksPerWarehouse() — возвращает агрегированные
 * данные без разбивки по складам. Физически не удаляется до sunset 2026-06-23.
 */
```

**tests/wb-stocks-per-warehouse.test.ts — 9 тестов GREEN:**

| Тест | Проверяет |
|------|-----------|
| пустой массив → пустой Map | ранний выход без HTTP |
| happy path 200 | группировка по warehouseName |
| несколько nmIds | ровно 1 HTTP запрос |
| фильтрация по nmIds | чужие nmId не включаются |
| пустой ответ `[]` | нет throw, пустой Map |
| HTTP 401 | throws с "401" |
| HTTP 403 | throws с "403" |
| правильный URL | statistics-api.wildberries.ru |
| WarehouseStockItem поля | quantity, inWayToClient, inWayFromClient |

---

### Task 2: /api/wb-sync — per-warehouse clean-replace + auto-insert

**Commit:** `d06a703`

**app/api/wb-sync/route.ts:**

Добавлена helper функция `stableWarehouseIdFromName(name: string): number`:
- djb2 хэш → unsigned 32-bit → `10_000_001 + (hash % 8_446_744)`
- Стабильный по имени склада (детерминированный)
- Диапазон 10M+ не пересекается с реальными WB warehouseId

Добавлен import `fetchStocksPerWarehouse, type WarehouseStockItem`.

**Новый блок после `fetchBuyoutPercent` (деградированный режим):**
```typescript
let stocksPerWarehouse = new Map<number, WarehouseStockItem[]>()
try {
  stocksPerWarehouse = await fetchStocksPerWarehouse(nmIds)
} catch (e) {
  console.warn("[wb-sync] fetchStocksPerWarehouse failed, skipping...", e)
}
```

**Clean-replace транзакция после основного цикла upsert карточек:**
1. `tx.wbCard.findUnique` — найти wbCardId по nmId
2. Per-item: `stableWarehouseIdFromName(item.warehouseName)` → warehouseId
3. `tx.wbWarehouse.findUnique` → если нет: `tx.wbWarehouse.create` с `needsClusterReview: true`
4. `tx.wbCardWarehouseStock.upsert` по `wbCardId_warehouseId`
5. `tx.wbCardWarehouseStock.deleteMany` WHERE wbCardId=X AND warehouseId NOT IN incoming
6. `tx.wbCard.update` stockQty = SUM(quantity)

Timeout транзакции: 60s. Ошибка транзакции → `errors.push()` → sync продолжается.

**Response расширен:** `warehouseStocksUpdated: stocksPerWarehouse.size`

**Старый блок `fetchStocks()` сохранён** для backward compat (wbCard.stockQty через агрегацию — теперь перезаписывается per-warehouse SUM, но fetchStocks остаётся до sunset).

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - МАЖОРНАЯ ДЕВИАЦИЯ] Statistics API вместо Analytics API**

- **Found during:** Начало выполнения (user-предоставленная информация)
- **Issue:** Analytics API (`/api/analytics/v1/stocks-report/wb-warehouses`) — HTTP 403 с base token
- **Fix:** Использован Statistics API (`/api/v1/supplier/stocks`) — уже верифицирован на VPS, возвращает per-warehouse данные
- **Impact:** Функция работает без изменений токена; архитектура адаптирована
- **Commits:** 2156bd1, d06a703

**2. [Rule 2 - Auto-fix] stableWarehouseIdFromName — отсутствующий числовой warehouseId**

- **Found during:** Task 2, анализ схемы
- **Issue:** Statistics API не содержит числового `warehouseId`, но `WbCardWarehouseStock.warehouseId: Int` FK на `WbWarehouse.id: Int` — нужен Int ID
- **Fix:** djb2 hash от `warehouseName` → stable Int в диапазоне 10M+ (не конфликтует с реальными WB ID < 1M)
- **Files modified:** app/api/wb-sync/route.ts
- **Commit:** d06a703

---

## Integration Notes для Plan 14-05

Кнопка «Обновить из WB» в `app/(dashboard)/stock/wb/` должна:
1. Вызвать `POST /api/wb-sync` (существующий endpoint, расширен в этом плане)
2. Response теперь содержит `warehouseStocksUpdated: N` — можно показать пользователю
3. После успеха: `router.refresh()` обновит таблицу с per-warehouse данными

---

## Integration Notes для Plan 14-06

`/stock/wb` страница читает `WbCardWarehouseStock` с join на `WbWarehouse.shortCluster`:
- Группировка по `shortCluster` (7 кластеров + "Прочие")
- Склады с `needsClusterReview=true` — auto-inserted через /api/wb-sync, требуют ручной кластеризации
- `WbCard.stockQty` — денормализованная сумма, обновляется при каждом sync

---

## Known Stubs

Нет. Данная функциональность полностью реализована (degraded mode обеспечивает graceful failure).

---

## Self-Check: PASSED

| Проверка | Результат |
|---------|-----------|
| lib/wb-api.ts содержит fetchStocksPerWarehouse | FOUND |
| lib/wb-api.ts содержит WarehouseStockItem interface | FOUND |
| lib/wb-api.ts содержит @deprecated на fetchStocks | FOUND |
| tests/wb-stocks-per-warehouse.test.ts | FOUND |
| app/api/wb-sync/route.ts содержит fetchStocksPerWarehouse | FOUND |
| app/api/wb-sync/route.ts содержит wbCardWarehouseStock.deleteMany | FOUND |
| app/api/wb-sync/route.ts содержит needsClusterReview: true | FOUND |
| npx tsc --noEmit → 0 ошибок | PASSED |
| npm run test → 9 tests GREEN | PASSED |
| Commit 2156bd1 (Task 1) | FOUND |
| Commit d06a703 (Task 2) | FOUND |
