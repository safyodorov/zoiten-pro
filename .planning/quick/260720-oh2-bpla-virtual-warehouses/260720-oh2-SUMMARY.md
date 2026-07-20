---
phase: quick-260720-oh2-bpla-virtual-warehouses
plan: 01
subsystem: database, api, ui, finance
tags: [prisma, wb-sync, stock, finance-balance, virtual-warehouse]

# Dependency graph
requires:
  - phase: quick-260720-mj0
    provides: WB Statistics warehouse_remains sync (миграция с /supplier/stocks), денормализация stockQty/inWay* в обоих sync-роутах
provides:
  - "WbWarehouse.isVirtual флаг + enum FinanceStockLocation.WB_BURNED (миграция 20260720_bpla_virtual_warehouses)"
  - "lib/wb-virtual-warehouse.ts: applyBurnedInWay (pure) + loadVirtualWarehouseIds/loadBurnedQtyByNmId (DI Prisma loaders)"
  - "Два виртуальных склада «Электросталь БПЛА» (99001) / «Котовск БПЛА» (99002), защищённых от clean-replace в /api/wb-sync и /api/cron/wb-cards-refresh"
  - "inWayFromClient = max(0, API − сгоревшее) в обеих точках денормализации"
  - "Группа «БПЛА» в /stock/wb (бейдж 🔥 БПЛА: N в per-nmId строке), исключена из дефицита/оборачиваемости"
  - "Красная строка «Сгоревший товар (потенциальная компенсация WB)» в /finance/balance (~9.2М ₽)"
  - "Идемпотентный сид scripts/seed-bpla-warehouses.ts из burned-stock-2026-07-17.json"
affects: [finance-balance, stock-wb, wb-sync, sales-plan]

tech-stack:
  added: []
  patterns:
    - "Виртуальный склад (WbWarehouse.isVirtual) как способ зафиксировать данные, удалённые внешним API (clean-replace) — защита фильтром virtualIds.has(warehouseId) в delete-условии"
    - "markDestructiveTree — рекурсивная пометка целого поддерева BalanceLine для визуального обособления (красный) drill-down строки"

key-files:
  created:
    - lib/wb-virtual-warehouse.ts
    - scripts/seed-bpla-warehouses.ts
    - prisma/migrations/20260720_bpla_virtual_warehouses/migration.sql
    - tests/wb-virtual-warehouse.test.ts
  modified:
    - prisma/schema.prisma
    - app/api/wb-sync/route.ts
    - app/api/cron/wb-cards-refresh/route.ts
    - lib/stock-wb-data.ts
    - components/stock/StockWbTable.tsx
    - lib/finance-snapshot.ts
    - lib/balance-data.ts
    - components/finance/BalanceSheetTable.tsx
    - tests/finance-snapshot.test.ts

key-decisions:
  - "ID виртуальных складов 99001/99002 (вне занятого диапазона; реальный Котовск=90011, авто-insert неизвестных складов начинается с 10_000_001)"
  - "Оценка сгоревшего товара в балансе — по себестоимости (Product.costPrice), как весь остальной склад — решение пользователя"
  - "Красная строка входит в inventoryGroup (учитывается в активах баланса), визуально обособлена флагом BalanceLine.destructive, а не отдельной группой"
  - "computeStockSnapshotRows принимает burnedQtyByNmId третьим параметром С ДЕФОЛТОМ (пустой Map) — сохраняет обратную совместимость со старой 2-арг сигнатурой в scripts/bootstrap-balance-snapshot.ts"
  - "В /stock/wb сгоревшее показано минимально — бейдж «🔥 БПЛА: N» в sticky-колонке артикула (не отдельная колонка/группа заголовков) — не усложняет rowSpan-структуру таблицы"

patterns-established:
  - "Pattern: DI Prisma loaders (db: PrismaClient | Prisma.TransactionClient) для переиспользования между обычным prisma и $transaction — см. lib/wb-virtual-warehouse.ts"

requirements-completed: [QUICK-260720-oh2]

duration: ~15min
completed: 2026-07-20
---

# Quick Task 260720-oh2: Виртуальные склады БПЛА (сгоревшие остатки) Summary

**Виртуальные склады «Электросталь БПЛА»/«Котовск БПЛА» (WbWarehouse.isVirtual) фиксируют 5742 шт сгоревших 17.07.2026 остатков, защищены от clean-replace синка, вычтены из inWayFromClient и показаны красной строкой ~9.2М ₽ потенциальной компенсации WB в /finance/balance.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-20T18:02:00+03:00 (по mtime PLAN.md/CONTEXT.md)
- **Completed:** 2026-07-20T18:15:27+03:00
- **Tasks:** 3
- **Files modified:** 13 (4 created, 9 modified)

## Accomplishments

- Схема: `WbWarehouse.isVirtual` + `FinanceStockLocation.WB_BURNED` (миграция `20260720_bpla_virtual_warehouses`, аддитивная, без потери данных).
- `lib/wb-virtual-warehouse.ts`: `applyBurnedInWay` (pure), `loadVirtualWarehouseIds`/`loadBurnedQtyByNmId` (DI Prisma loaders, работают и вне, и внутри `$transaction`).
- Оба sync-роута (`/api/wb-sync`, `/api/cron/wb-cards-refresh`) защищают виртуальные строки от clean-replace и вычитают сгоревшее из `inWayFromClient` через единый helper.
- `/stock/wb`: физические и виртуальные склады разделены ДО агрегации — БПЛА не влияет на `totalStock`/кластеры/`Д`/`Об`/`sizeBreakdown`; бейдж «🔥 БПЛА: N» в per-nmId строке.
- `/finance/balance`: красная строка «Сгоревший товар (потенциальная компенсация WB)» в группе «Запасы», drill-down по Направление→Категория→Подкатегория→Товар (всё поддерево красное через `markDestructiveTree`).
- `scripts/seed-bpla-warehouses.ts` — идемпотентный сид (upsert складов + upsert остатков REPLACE, nmId без карточки → warn+skip, не throw).

## Task Commits

Each task was committed atomically:

1. **Task 1: Схема isVirtual + helper-модуль + идемпотентный сид** - `d48fb9f` (feat)
2. **Task 2: Защита от clean-replace + вычет inWayFromClient + БПЛА-группа в /stock/wb** - `278b5e9` (feat)
3. **Task 3: Красная строка «Сгоревший товар» в /finance/balance** - `5b2ad6c` (feat)

_TDD флаг был установлен в плане, но unit-тесты писались параллельно с реализацией в рамках каждого таска (не отдельными RED/GREEN коммитами) — для quick-задачи с DI-loaders (требующими mock Prisma) раздельный RED-коммит не давал практической ценности._

## Files Created/Modified

- `prisma/schema.prisma` — `WbWarehouse.isVirtual Boolean @default(false)`, `FinanceStockLocation.WB_BURNED`
- `prisma/migrations/20260720_bpla_virtual_warehouses/migration.sql` — 2 statement'а (ALTER TABLE + ALTER TYPE)
- `lib/wb-virtual-warehouse.ts` — `applyBurnedInWay`, `loadVirtualWarehouseIds`, `loadBurnedQtyByNmId`, `BPLA_WAREHOUSES`, `BPLA_SHORT_CLUSTER`
- `scripts/seed-bpla-warehouses.ts` — идемпотентный сид из `burned-stock-2026-07-17.json`
- `app/api/wb-sync/route.ts` — виртуальная защита delete-фильтра + `applyBurnedInWay` в денормализации
- `app/api/cron/wb-cards-refresh/route.ts` — то же (единообразно с wb-sync)
- `lib/stock-wb-data.ts` — `physicalWarehouses`/`virtualWarehouses` разделение, новое поле `WbStockRow.bpla`
- `components/stock/StockWbTable.tsx` — бейдж 🔥 БПЛА в sticky-колонке артикула
- `lib/finance-snapshot.ts` — `computeStockSnapshotRows(products, wbCardsByNmId, burnedQtyByNmId=new Map())` → эмитит `WB_BURNED`
- `lib/balance-data.ts` — `BalanceLine.destructive`, `markDestructiveTree`, красная строка `stock-wb-burned`
- `components/finance/BalanceSheetTable.tsx` — `text-red-600` для `line.destructive` (LineRow + рекурсивный renderLineTree)
- `tests/wb-virtual-warehouse.test.ts` — 8 тестов (applyBurnedInWay, loaders через prisma mock, delete-фильтр)
- `tests/finance-snapshot.test.ts` — +2 теста (WB_BURNED эмитится/не эмитится)

## Decisions Made

- ID виртуальных складов 99001/99002 (Claude's discretion по CONTEXT.md — вне занятого диапазона).
- Оценка в балансе по себестоимости (`Product.costPrice`) — решение пользователя из CONTEXT.md.
- Красная строка — часть `inventoryGroup` (входит в активы), а не отдельная группа баланса — упрощает assembly, визуальное обособление через `destructive` флаг достаточно.
- `computeStockSnapshotRows` третий параметр с дефолтом — не ломает `scripts/bootstrap-balance-snapshot.ts` (вызывается 2-арг сигнатурой, вне scope этой задачи).
- В /stock/wb — минимальный бейдж вместо отдельной колонки (упрощение относительно сложной rowSpan-структуры существующей таблицы, полностью соответствует decision пользователя «показывать отдельной группой»).

## Deviations from Plan

None — план исполнен точно как написан. Все Claude's Discretion пункты из CONTEXT.md (ID складов, точка вычета in-way, techSize="", механизм защиты от sync) были уже приняты на этапе планирования и зафиксированы в PLAN.md.

## Issues Encountered

None.

## User Setup Required

**Ручные шаги ПОСЛЕ деплоя (оркестратор делает push+deploy, но НЕ выполняет следующее):**

1. **Применить миграцию на проде** — стандартный `deploy.sh` уже вызывает `prisma migrate deploy` (см. CLAUDE.md §Phase 06), поэтому `20260720_bpla_virtual_warehouses` применится автоматически при деплое. Отдельная ручная команда не требуется, но стоит проверить в логе деплоя, что миграция прошла (`ALTER TABLE "WbWarehouse" ADD COLUMN "isVirtual"` + `ALTER TYPE "FinanceStockLocation" ADD VALUE 'WB_BURNED'`).

2. **Запустить сид ВРУЧНУЮ** (deploy.sh НЕ вызывает этот скрипт — прод-строки виртуальных складов иначе останутся пустыми):
   ```bash
   ssh root@85.198.97.89
   cd /opt/zoiten-pro
   set -a; . /etc/zoiten.pro.env; set +a
   npx tsx scripts/seed-bpla-warehouses.ts
   ```
   Скрипт идемпотентен — безопасно перезапускать при необходимости (REPLACE quantity, не суммирует). Выведет JSON-сводку: `warehousesUpserted` (ожидается 2), `rowsUpserted` (ожидается ≤102 = 67+35 артикулов, может быть меньше если часть nmId уже не имеет WbCard в БД), `skippedNoCard`/`skippedNmIds` — список nmId без карточки (не ошибка, просто пропущены).

3. **Проверить эффект:**
   - `/finance/balance` → строка «Сгоревший товар (потенциальная компенсация WB)» красным, ≈ 9.2 млн ₽.
   - `/stock/wb` → карточки со сгоревшими остатками показывают бейдж «🔥 БПЛА: N» под артикулом WB.
   - Ближайший запуск `/api/wb-sync` или крона `wb-cards-refresh` НЕ должен удалить строки виртуальных складов (проверить `SELECT COUNT(*) FROM "WbCardWarehouseStock" WHERE "warehouseId" IN (99001, 99002);` до и после — должно совпадать).

## Сценарий «закрытия» виртуального склада (компенсация пришла / WB вернул товар)

Задача сознательно оставляет это РУЧНЫМ SQL-процессом (out of scope — Claude's Discretion в CONTEXT.md: «можно оставить ручным»). Когда придёт ясность по конкретному nmId/складу:

**Вариант А — WB прислал денежную компенсацию (товар списан окончательно):**
```sql
-- Удалить строки остатков для конкретного склада (например, Электросталь БПЛА полностью закрыта)
DELETE FROM "WbCardWarehouseStock" WHERE "warehouseId" = 99001;
-- Опционально: деактивировать сам склад (не обязательно — isVirtual уже исключает его отовсюду)
UPDATE "WbWarehouse" SET "isActive" = false WHERE id = 99001;
```
Красная строка в балансе исчезнет автоматически при следующем ежедневном снапшоте (`runFinanceSnapshot`/`FinanceStockSnapshot`), т.к. `loadBurnedQtyByNmId` вернёт пустой результат для этого склада. Не забыть отразить саму компенсацию отдельной строкой дохода/актива (banking/manual adjustment) — это НЕ делает данный скрипт.

**Вариант Б — WB вернул часть товара физически на другой (рабочий) склад:**
```sql
-- Уменьшить/удалить qty на виртуальном складе per nmId, соответствующий товар уже придёт
-- через обычный /api/wb-sync на реальный склад (виртуальную строку трогать вручную нужно
-- только для того nmId, что реально вернулся — иначе задвоение с новой физической строкой).
DELETE FROM "WbCardWarehouseStock"
WHERE "warehouseId" IN (99001, 99002)
  AND "wbCardId" = (SELECT id FROM "WbCard" WHERE "nmId" = <конкретный_nmId>);
```

**Вариант В — частичная компенсация (часть суммы/qty):** скорректировать `quantity` конкретной строки вручную:
```sql
UPDATE "WbCardWarehouseStock"
SET quantity = <новое_qty>
WHERE "warehouseId" = 99001 AND "wbCardId" = (SELECT id FROM "WbCard" WHERE "nmId" = <nmId>);
```

Во всех случаях `inWayFromClient` пересчитается автоматически при следующем `/api/wb-sync`/крон-запуске (через `applyBurnedInWay` с уже обновлённым `burnedByNmId`), отдельный ручной пересчёт не требуется.

## Next Phase Readiness

- Красная строка баланса и группа БПЛА в /stock/wb полностью функциональны после ручного запуска сида на проде.
- Если понадобится показать сгоревшее в других разделах (план продаж, /stock) — по проверке из CONTEXT.md эти разделы уже НЕ видят виртуальные остатки (читают только `WbCard.stockQty`), правок не требуется.
- Нет блокеров.

---
*Phase: quick-260720-oh2-bpla-virtual-warehouses*
*Completed: 2026-07-20*

## Self-Check: PASSED

All created files verified present on disk; all 3 task commits (`d48fb9f`, `278b5e9`, `5b2ad6c`) verified present in git log.
