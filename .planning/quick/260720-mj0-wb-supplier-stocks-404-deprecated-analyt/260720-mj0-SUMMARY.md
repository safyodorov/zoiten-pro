---
phase: quick-260720-mj0
plan: 01
subsystem: api
tags: [wildberries, wb-api, stocks, analytics-api, statistics-api, vitest]

# Dependency graph
requires:
  - phase: 14-stock
    provides: fetchStocksPerWarehouse(nmIds) contract, WbCardWarehouseStock denormalization
provides:
  - fetchStocksPerWarehouse на Analytics warehouse_remains (task-based create→poll→download)
  - Удалён мёртвый fetchStocks() + STATISTICS_API_STOCKS
  - /api/wb-sync stockQty выводится из per-warehouse ответа (без второго Analytics-запроса)
affects: [14-stock, cron wb-cards-refresh, prices-wb]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "WB Analytics task-based flow: CREATE → POLL(sleep 5s×40) → DOWNLOAD, тот же паттерн что fetchBuyoutPercent"
    - "Edge case: строка API только с синтетическими in-way складами → виртуальный item (quantity=0), чтобы данные не терялись при денормализации"

key-files:
  created: []
  modified:
    - lib/wb-api.ts
    - app/api/wb-sync/route.ts
    - tests/wb-stocks-per-warehouse.test.ts
    - tests/wb-sync-route.test.ts
    - tests/wb-fetch-rate-limit.test.ts

key-decisions:
  - "Мёртвый Statistics API GET /api/v1/supplier/stocks (404 PLUG-404-20260720) заменён на Analytics API warehouse_remains — единственный живой источник per-warehouse остатков"
  - "Публичная сигнатура fetchStocksPerWarehouse(nmIds) => Promise<Map<nmId, WarehouseStockItem[]>> сохранена без изменений — оба потребителя (/api/wb-sync, крон wb-cards-refresh) работают без правок логики записи"
  - "Второй вызов fetchStocks в /api/wb-sync убран целиком — stockQty теперь агрегат из уже загруженного stocksPerWarehouse (rate limit Analytics ~1 req/мин не позволяет два обращения за один sync)"
  - "Edge case строки без физических складов (только in-way): создан виртуальный item 'В пути (без физ. склада)' с quantity=0 — иначе данные in-way терялись бы полностью для товаров целиком в пути"

patterns-established:
  - "Task-based Analytics endpoint без экспортируемого helper'а — copy-paste паттерна fetchBuyoutPercent (create/poll/download через отдельные wbFetch/fetch вызовы)"

requirements-completed: [STOCK-07, STOCK-FUT-09]

# Metrics
duration: ~35min
completed: 2026-07-20
---

# Phase quick-260720-mj0: Миграция остатков WB на Analytics warehouse_remains Summary

**fetchStocksPerWarehouse переписан с отключённого Statistics API (404) на Analytics warehouse_remains (task-based create→poll→download); мёртвый fetchStocks() и его единственный продакшн-вызов в /api/wb-sync удалены — stockQty теперь агрегат из per-warehouse ответа без второго API-запроса.**

## Performance

- **Duration:** ~35 мин
- **Started:** 2026-07-20T12:58:00Z
- **Completed:** 2026-07-20T13:33:50Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Синхронизация остатков WB восстановлена: `fetchStocksPerWarehouse` больше не ходит в мёртвый `statistics-api.wildberries.ru/api/v1/supplier/stocks` (404 `PLUG-404-20260720`), а использует живой `seller-analytics-api.wildberries.ru/api/v1/warehouse_remains`
- Мёртвый `fetchStocks()` (просроченный sunset 2026-06-23) и константа `STATISTICS_API_STOCKS` удалены из кодовой базы
- `/api/wb-sync` больше не делает второй запрос к Analytics ради агрегата — `stockMap`/`stocksOk` выводятся из уже загруженного `stocksPerWarehouse`
- Публичный контракт (`WarehouseStockItem`, сигнатура `fetchStocksPerWarehouse`) не изменён — крон `wb-cards-refresh` и `/api/wb-sync` продолжают работать без правок логики записи в БД
- Edge case из констрейнтов покрыт тестом: строка ответа только с in-way остатками (без физического склада) больше не теряет данные — создаётся виртуальный item, который корректно суммируется в денормализацию `WbCard.inWayToClient/inWayFromClient`

## Task Commits

Each task was committed atomically:

1. **Task 1: Переписать fetchStocksPerWarehouse на warehouse_remains + удалить fetchStocks** - `de5cb2a` (feat)
2. **Task 2: Переключить /api/wb-sync с fetchStocks на агрегат из per-warehouse** - `f4f2273` (feat)
3. **Task 3: Адаптировать тесты под task-based flow и удаление fetchStocks** - `7f59df9` (test)

**Plan metadata:** _(этот SUMMARY + STATE.md — коммит выполнит оркестратор)_

## Files Created/Modified
- `lib/wb-api.ts` - `fetchStocksPerWarehouse` переписан на 3-шаговый Analytics flow (CREATE/POLL/DOWNLOAD); `fetchStocks()` и `STATISTICS_API_STOCKS` удалены
- `app/api/wb-sync/route.ts` - убран импорт и вызов `fetchStocks`; `stockMap`/`stocksOk` вычисляются из `stocksPerWarehouse` после блока 6a
- `tests/wb-stocks-per-warehouse.test.ts` - полностью переписан под новый формат строк (`warehouses[]`), добавлены тесты таймаута поллинга и edge case in-way-only
- `tests/wb-sync-route.test.ts` - `fetchStocks` убран из мока, дефолтный `STOCKS_PW_SUCCESS` заменил `STOCKS_PW_EMPTY`; добавлены моки `prisma.wbCard.count/updateMany/deleteMany` (Rule 1 fix)
- `tests/wb-fetch-rate-limit.test.ts` - proxy-функция для тестирования `wbFetch` переведена с `fetchStocks` на `fetchOrdersPerWarehouse` (bucket `statistics-orders`)

## Decisions Made
- Виртуальный item для edge case "только in-way, нет физ. складов" — решение принято автора плана-констрейнта; реализовано как `warehouseName: "В пути (без физ. склада)"`, `quantity: 0`, что создаёт единственный дополнительный `WbWarehouse` auto-insert (уже существующий паттерн STOCK-10) вместо потери данных
- `recordFailure` endpoint-лейбл для per-warehouse блока переименован с `"Statistics API (per-warehouse stocks)"` на `"Analytics API (warehouse remains)"` — точнее отражает реальный источник данных, поле `fields` расширено на `stockQty` (раньше отдельная ветка `stocksOk` покрывала это поле)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Добавлены недостающие моки prisma.wbCard.count/updateMany/deleteMany в tests/wb-sync-route.test.ts**
- **Found during:** Task 3 (адаптация wb-sync-route.test.ts)
- **Issue:** Soft-delete блок в `app/api/wb-sync/route.ts` (после основного upsert-цикла) безусловно вызывает `prisma.wbCard.count/updateMany/deleteMany`. Мок `prisma` в тестовом файле их не содержал → route падал с 500 в рантайме. Сценарии 1-6 этого не ловили (проверяли только `mockWbCardUpsert.mock.calls`, которые записываются ДО падения), но сценарии 7-9 (Сц.7 несколько API throws, Сц.8 WbRateLimitError, Сц.9 generic Error) явно проверяли `response.status === 200` и падали. Баг существовал ДО начала этой задачи (воспроизведён на исходном файле через `git stash`), но обнаружен только при адаптации Task 3 под новый flow.
- **Fix:** Добавлены `mockWbCardCount`/`mockWbCardUpdateMany`/`mockWbCardDeleteMany` (все no-op/count=0), подключены в `vi.mock("@/lib/prisma", ...)`.
- **Files modified:** tests/wb-sync-route.test.ts
- **Verification:** `npx vitest run tests/wb-sync-route.test.ts` — 9/9 зелёные (было 6/9 до фикса)
- **Committed in:** 7f59df9 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 pre-existing test-mock bug, обнаружен в файле, который и так адаптировался по плану)
**Impact on plan:** Фикс необходим для зелёного `npm run test` по гейтам задачи; не расширяет продакшн-скоуп (только тестовые моки). No scope creep.

## Issues Encountered
- Полный прогон `npm run test` показал 41 упавший тест в 11 файлах, не связанных с этой задачей (support-sync-chats/returns моки, wb-cooldown bucket count off-by-one из-за отдельно добавленного bucket `finance-reports`, wb-token-validate error message). Сверено через `git stash` — идентичный набор падал ДО начала работ (кроме 3 файлов, которые эта задача чинит). Задокументировано в `.planning/quick/260720-mj0-.../deferred-items.md`, НЕ исправлялось (вне скоупа задачи, Rule "SCOPE BOUNDARY").

## User Setup Required
None - изменения только в коде и тестах, деплой выполнит оркестратор.

## Next Phase Readiness
- `/api/wb-sync` и крон `wb-cards-refresh` готовы к деплою — остатки/in-way снова будут наполняться при следующем прогоне
- Рекомендация после деплоя: вручную запустить «Синхронизировать с WB» и проверить, что `stockQty`/`inWayToClient`/`inWayFromClient` обновились (в частности убедиться, что сгоревший склад Электросталь 5142 шт из problem statement больше не отображается как актуальный остаток)
- 11 pre-existing файлов с падающими тестами (см. deferred-items.md) остаются — отдельная задача вне этого скоупа

---
*Phase: quick-260720-mj0*
*Completed: 2026-07-20*

## Self-Check: PASSED

- FOUND: lib/wb-api.ts
- FOUND: app/api/wb-sync/route.ts
- FOUND: tests/wb-stocks-per-warehouse.test.ts
- FOUND: tests/wb-sync-route.test.ts
- FOUND: tests/wb-fetch-rate-limit.test.ts
- FOUND: .planning/quick/260720-mj0-wb-supplier-stocks-404-deprecated-analyt/260720-mj0-SUMMARY.md
- FOUND commit: de5cb2a (Task 1)
- FOUND commit: f4f2273 (Task 2)
- FOUND commit: 7f59df9 (Task 3)
