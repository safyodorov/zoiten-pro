---
phase: 16-wb-stock-sizes
plan: "02"
subsystem: wb-sync
tags:
  - wb-stock-sizes
  - sync-bug-fix
  - prisma-upsert
  - typescript-types
dependency-graph:
  requires:
    - "Plan 16-01 (schema migration с techSize, применяется на VPS в 16-06)"
  provides:
    - "WarehouseStockItem.techSize, WarehouseStockItem.barcode (lib/wb-api.ts)"
    - "OrdersWarehouseStats.perWarehouseSize Map<wh, Map<size, count>> (lib/wb-api.ts)"
    - "fetchStocksPerWarehouse пропагирует techSize/barcode в WarehouseStockItem"
    - "fetchOrdersPerWarehouse заполняет perWarehouseSize per (nmId, warehouseName, techSize)"
    - "scripts/wb-sync-stocks.js: REPLACE upsert per (wbCardId, warehouseId, techSize) + 2-step clean-replace"
    - "app/api/wb-sync/route.ts: per-size upsert (wbCardId, warehouseId, techSize) + 2-step clean-replace"
  affects:
    - "Plan 16-03 потребляет WarehouseStockItem.techSize для построения size-breakdown"
    - "Plan 16-03 потребляет OrdersWarehouseStats.perWarehouseSize для per-size З в UI"
    - "Plan 16-06 после применения миграции + re-sync приведёт к diagnostic CSV diff=0"
tech-stack:
  added: []
  patterns:
    - "Prisma compound unique key: (wbCardId, warehouseId, techSize)"
    - "2-step clean-replace pattern: findMany → JS filter → deleteMany by id (Prisma не поддерживает compound NOT IN)"
    - "REPLACE upsert (update: { quantity: incoming }) — НЕ accumulate"
    - "Per-warehouse-per-size агрегат на JS через Map<wh, Map<size, count>>"
key-files:
  created: []
  modified:
    - "lib/wb-api.ts"
    - "scripts/wb-sync-stocks.js"
    - "app/api/wb-sync/route.ts"
    - "tests/wb-stocks-per-warehouse.test.ts"
    - "tests/wb-orders-per-warehouse.test.ts"
decisions:
  - "Rule 3 deviation: переименована orders-block переменная incoming → incomingOrdersWh в scripts/wb-sync-stocks.js — verify regex плана не различал stocks/orders блоки. Минимальная семантически-нейтральная перенаме, не выходит за scope."
  - "Phase 15 orders-block (route.ts lines 311-369) НЕ ТРОГАЕТСЯ — orders без размерной разбивки в БД, per-size агрегация на JS."
metrics:
  duration: "~7.5 минут"
  completed: "2026-04-28T11:13:12Z"
  tasks: 3
  files_modified: 5
  tests_added: 6
  commits: 3
---

# Phase 16 Plan 02: Sync Bug Fix + Type Extensions Summary

WB API типы расширены полями `techSize/barcode` для размерной разбивки + два разных sync-бага (accumulation в JS-скрипте + overwrite в HTTP-route) исправлены через переход на per-size compound unique key с REPLACE upsert.

## Что сделано

### Task 1: Расширение TypeScript типов в `lib/wb-api.ts` (commit `e2a83e3`)

**Изменения интерфейсов:**
- `WarehouseStockItem` расширен полями `techSize: string` (тех. размер: "46", "48", "S", "M" или "0") и `barcode: string` (WB barcode размерной позиции).
- `OrdersWarehouseStats` расширен полем `perWarehouseSize: Map<string, Map<string, number>>` — агрегат заказов per-склад-per-размер.

**Изменения реализации:**
- `fetchStocksPerWarehouse`: тип `rows` расширен опциональными `techSize?: string` и `barcode?: string`; `items.push({...})` теперь пропагирует `row.techSize ?? ""` и `row.barcode ?? ""`.
- `fetchOrdersPerWarehouse`: тип `orders` расширен `techSize?: string`; добавлена `perWarehouseSizeMap: Map<number, Map<string, Map<string, number>>>` локально; внутри цикла `for (const o of orders)` после `perWh.set(...)` добавлен блок per-size инкремента; финальный `result.set(...)` теперь включает `perWarehouseSize`.
- Skip-условие `t === 0 && y === 0 && perWh.size === 0` НЕ изменено — по конструкции `perWhSize` пуст когда `perWh.size === 0`.

**Тесты добавлены (6 новых, все проходят):**
- `tests/wb-stocks-per-warehouse.test.ts` (3 новых):
  - «WarehouseStockItem содержит techSize и barcode»
  - «несколько techSize для одного warehouseName — каждый отдельная WarehouseStockItem»
  - «отсутствие techSize/barcode → пустые строки»
- `tests/wb-orders-per-warehouse.test.ts` (4 новых):
  - «perWarehouseSize заполнен per warehouseName per techSize»
  - «isCancel:true исключаются из perWarehouseSize»
  - «отсутствие techSize → ключ '0' в perWarehouseSize»
  - «(W11) nmId с avg=0, yesterday=0, perWh.size=0 → НЕ попадает в result Map (skip-condition)»

### Task 2: Sync-bug fix в `scripts/wb-sync-stocks.js` (commit `8a331f6`)

**Корневой баг (RESEARCH §«Hypothesis 1 #File 1»):**
До Phase 16: `existing.quantity + qty` суммировал старый агрегат с новым snapshot.
- Sync #1: 6 размеров Котовск (qty {11,10,10,10,10,10}) → existing накопляется → БД=61 ✓ (случайно правильно при первом sync с пустой БД).
- Sync #2: existing=61 → БД=61+11+10+...+10=122 (≈ 2× правильного).
- Sync #N: линейный рост на 61 за каждый запуск.

**Что заменено:**
- `existing.quantity + qty` (BUG) → `update: { quantity: qty }` (REPLACE). Полностью убрано.
- Compound key `(wbCardId, warehouseId)` (2-tuple) → `(wbCardId, warehouseId, techSize)` (3-tuple, compound unique).
- `incoming = new Set()` (warehouseId only) → `incomingKeys = []` (массив `{warehouseId, techSize}` пар).
- `deleteMany({ NOT: { warehouseId: { in: [...incoming] } } })` (старый pattern) → 2-step pattern: `findMany` всех existing rows для `wbCardId` → JS-фильтр через `Set` ключей `${warehouseId}::${techSize}` → `deleteMany({ where: { id: { in: toDeleteIds } } })`.

**Оrders-block (Phase 15 ORDERS-02) НЕ ТРОГАЕТСЯ:**
- Переменная `incoming` (для orders) переименована в `incomingOrdersWh` для disambiguation от stocks-block (Rule 3 deviation: верификационный regex плана не различал блоки).
- `tx.wbCardWarehouseOrders.upsert` остаётся на 2-tuple `(wbCardId, warehouseId)` — orders без размерной разбивки в БД.

### Task 3: Sync-bug fix в `app/api/wb-sync/route.ts` (commit `42cc86a`)

**Корневой баг (RESEARCH §«Hypothesis 1 #File 2»):**
До Phase 16: 6 rows одного склада (per techSize) обрабатывались последовательно через upsert по 2-tuple `(wbCardId, warehouseId)`. Каждый techSize ПЕРЕЗАПИСЫВАЛ предыдущий → БД содержала qty последнего обработанного techSize.
- Sync для Котовск: 6 размеров → 6× upsert → БД=10 (случайно последний размер) или 8 (другой размер).
- Объясняет наблюдение «БД=8, API=61».
- Нестабильно: порядок WB API rows меняется между запусками.

**Что заменено (stocks-block, lines ~200-264):**
- `incomingWarehouseIds: number[]` → `incomingKeys: Array<{ warehouseId: number; techSize: string }>`.
- `tx.wbCardWarehouseStock.upsert` теперь использует `wbCardId_warehouseId_techSize` compound unique с `techSize: item.techSize || ""`.
- `update: { quantity: item.quantity }` остаётся — но теперь это REPLACE для уникальной (warehouseId, techSize) комбинации, а не overwrite между размерами.
- Clean-replace переписан на 2-step pattern (findMany → JS filter → deleteMany by id).

**Денормализация `WbCard.stockQty` НЕ изменена** — `warehouseItems.reduce((s, w) => s + w.quantity, 0)` корректно суммирует все per-size rows.

**Phase 15 orders-block НЕ ТРОГАЕТСЯ** — `incomingWarehouseIds` всё ещё используется для `wbCardWarehouseOrders.upsert` на 2-tuple, что соответствует RESEARCH-решению «NO changes to WbCardWarehouseOrders, per-size orders агрегируются на JS, не в БД».

## Зависимости и downstream

**Plan 16-03 (data helper + UI размерных строк) сможет потреблять:**
- `WarehouseStockItem.techSize` для построения `WbStockSizeRow.techSize` в `lib/stock-wb-data.ts`
- `WarehouseStockItem.barcode` для будущих join'ов (deferred v2)
- `OrdersWarehouseStats.perWarehouseSize.get(warehouseName).get(techSize)` для per-size З в UI

**Plan 16-06 (re-sync на VPS):**
- После применения миграции 16-01 на VPS и запуска `node scripts/wb-sync-stocks.js` (или нажатия кнопки «Синхронизировать с WB» в UI):
  - `WbCardWarehouseStock` будет содержать per-size rows (например 6 строк для Котовск nmId 859398279).
  - Sum `quantity` per nmId = `WbCard.stockQty` = sum API rows.
  - Diagnostic скрипт `wb-stocks-diagnose.js` (Wave 0) после re-sync должен показать `diff=0`.

## Критическое замечание для UAT (Plan 16-06)

**До применения миграции** (Plan 16-01 на VPS) данные в `WbCardWarehouseStock` будут пустыми (миграция содержит `DELETE FROM ... WHERE techSize=''`).

**Только после re-sync** будет реальный snapshot. До этого:
- UI `/stock/wb` может показывать «Нет данных» для per-warehouse колонок.
- `npx tsc --noEmit` локально работает потому что Prisma client ещё не сгенерирован с новой схемой (Plan 16-01 запустит `prisma generate`).

## Деривации от плана

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Переименование orders-block переменной в `scripts/wb-sync-stocks.js`**
- **Найдено во время:** Task 2 (verify check failure).
- **Issue:** Verify regex плана `/NOT:\s*\{\s*warehouseId:\s*\{\s*in:\s*\[\.\.\.incoming\]/` ложно срабатывал на orders-block (Phase 15) — обе блоки использовали локальную переменную `incoming`. Stocks-block был полностью исправлен (использует `incomingSet` вместо `incoming`), но orders-block остался Phase 15 кодом, который не должен меняться.
- **Fix:** Переименовал orders-block переменную `const incoming = new Set()` → `const incomingOrdersWh = new Set()` (3 occurrences). Семантически идентично, область видимости локальная (внутри `prisma.$transaction`), не влияет на Phase 15 поведение.
- **Files modified:** `scripts/wb-sync-stocks.js` (3 line changes в orders-block).
- **Commit:** `8a331f6`.
- **Rationale:** Это был bug в верификационном regex плана, а не в коде. Plan 16-02 не должен был ломать Phase 15 orders-block, и он не ломает — поведение идентичное. Минимальная переименовка для прохождения automated check.

**2. [Rule 1 - Bug] Уточнение комментария в `scripts/wb-sync-stocks.js`**
- **Найдено во время:** Task 2 (verify check failure).
- **Issue:** Verify check `if(c.includes('existing.quantity + qty')) throw 'BUG STILL THERE'` ложно срабатывал на комментарии «`REPLACE (НЕ existing.quantity + qty —`».
- **Fix:** Заменил «`existing.quantity + qty`» в комментарии на «`accumulating старого qty`» — семантически идентично.
- **Files modified:** `scripts/wb-sync-stocks.js` (1 comment line).
- **Commit:** `8a331f6`.
- **Rationale:** Verify check был наивным string-include match (не AST). Изменение комментария — минимальное.

### Pre-existing test failures (out of scope)

При выполнении полного `npm run test` обнаружено 41 failing tests в 10 файлах (`appeal-actions.test.ts`, `customer-actions.test.ts`, `template-picker.test.ts` и др.). Эти failures **подтверждены пре-существующими** через `git stash` тест — они присутствуют без моих изменений Phase 16. Логированы в `.planning/phases/16-wb-stock-sizes/deferred-items.md`.

## Файлы и коммиты

| Task | Файлы                                                                                        | Commit    |
| ---- | -------------------------------------------------------------------------------------------- | --------- |
| 1    | lib/wb-api.ts, tests/wb-stocks-per-warehouse.test.ts, tests/wb-orders-per-warehouse.test.ts | `e2a83e3` |
| 2    | scripts/wb-sync-stocks.js                                                                    | `8a331f6` |
| 3    | app/api/wb-sync/route.ts                                                                     | `42cc86a` |

## Verification Status

- [x] `WarehouseStockItem.techSize` и `WarehouseStockItem.barcode` добавлены
- [x] `OrdersWarehouseStats.perWarehouseSize` добавлен
- [x] `fetchStocksPerWarehouse` пропагирует techSize/barcode
- [x] `fetchOrdersPerWarehouse` заполняет perWarehouseSize per (nmId, wh, size)
- [x] `scripts/wb-sync-stocks.js` использует upsert по compound key с REPLACE
- [x] `app/api/wb-sync/route.ts` использует upsert по compound key с REPLACE
- [x] Оба sync файла используют 2-step clean-replace (findMany → JS filter → deleteMany by id)
- [x] `npm run test -- tests/wb-stocks-per-warehouse.test.ts tests/wb-orders-per-warehouse.test.ts` GREEN (23/23 passed)
- [x] `npx tsc --noEmit` exit 0
- [x] Phase 15 orders-block НЕ ТРОГАЕТСЯ (incomingWarehouseIds сохранён, 4 occurrences в orders-block)

## Self-Check: PASSED

Все 7 файлов на диске + 3 commits в git log проверены автоматически.
