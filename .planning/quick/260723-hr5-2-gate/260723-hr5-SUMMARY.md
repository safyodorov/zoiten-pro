---
phase: quick-260723-hr5-2-gate
plan: 01
subsystem: database, infra
tags: [prisma, wb-sync, stock, finance-balance, virtual-warehouse, cron]

# Dependency graph
requires:
  - phase: quick-260720-oh2-bpla-virtual-warehouses
    provides: "WbWarehouse.isVirtual флаг, lib/wb-virtual-warehouse.ts (applyBurnedInWay/loadVirtualWarehouseIds/loadBurnedQtyByNmId), защита от clean-replace в /api/wb-sync + /api/cron/wb-cards-refresh, красная строка WB_BURNED в /finance/balance, бейдж БПЛА в /stock/wb, идемпотентный сид scripts/seed-bpla-warehouses.ts"
provides:
  - "BPLA_WAREHOUSES расширен до 4 записей (wave/realWarehouseId) — волна 1 (Электросталь/Котовск) + волна 2 (Невинномысск/Краснодар)"
  - "decideBplaSeedAction — pure gate-функция (seed/gate-blocked/already-seeded), покрыта 4 юнит-тестами"
  - "burned-stock-wave2-2026-07-23.json — единый data-файл волны 2 (per-size остатки, 1283+485=1768 шт)"
  - "scripts/seed-bpla-warehouses.ts переработан: волна 1 без изменений по логике (только фильтр wave===1), волна 2 — gate-механизм безопасный для ежедневного крона"
affects: [finance-balance, stock-wb, wb-sync]

tech-stack:
  added: []
  patterns:
    - "Gate-функция (pure, DI-friendly): решение seed/gate-blocked/already-seeded вычисляется из двух чисел (virtualHasRows, realWarehouseQty) без побочных эффектов — тестируется без мока Prisma; сайд-эффекты (aggregate/count/upsert) остаются в вызывающем скрипте"

key-files:
  created:
    - .planning/quick/260723-hr5-2-gate/burned-stock-wave2-2026-07-23.json
  modified:
    - lib/wb-virtual-warehouse.ts
    - scripts/seed-bpla-warehouses.ts
    - tests/wb-virtual-warehouse.test.ts

key-decisions:
  - "Gate по сумме реального склада (aggregate _sum.quantity, quantity>0), а не по факту наличия строк — WB может оставить строку с quantity=0, это тоже 'обнулено'"
  - "already-seeded проверяется ПЕРВЫМ (раньше gate) — инвариант «засеять ровно один раз»: даже если WB снова временно повезёт товар на реальный склад-прообраз после того как виртуальный уже засеян, повторный запуск не пересеивает и не создаёт двойной счёт"
  - "Волна 1 логически не тронута — просто сузили итерацию до wave===1, чтобы новый общий цикл BPLA_WAREHOUSES не создавал 99003/99004 этим блоком"
  - "Полный npm run test на этой машине падает по OOM (система под сильным давлением памяти — commit charge ~98%, ~150-1100 МБ свободно, флуктуирует); гейт пройден через 19 последовательных чанков по 6 файлов (--maxWorkers=2) — суммарный результат идентичен baseline (41 failed / 11 files, тот же список файлов, что в deferred-items.md quick-260720-mj0), новых падений нет"

patterns-established: []

requirements-completed: [QUICK-260723-hr5]

duration: ~25min
completed: 2026-07-23
---

# Quick Task 260723-hr5-2-gate: БПЛА-склады волна 2 (Невинномысск/Краснодар) — gate-сид Summary

**decideBplaSeedAction (pure gate-функция) + переработанный scripts/seed-bpla-warehouses.ts безопасно фиксируют 1768 шт сгоревших 22.07.2026 остатков (Невинномысск 1283 / Краснодар 485) на виртуальных складах 99003/99004 ТОЛЬКО после того, как WB обнулит реальные склады-прообразы (90024 / 304), и делают это ровно один раз — скрипт готов к ежедневному крон-запуску.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-23T12:47:00+03:00 (по git log первого коммита данных)
- **Completed:** 2026-07-23T13:10:00+03:00
- **Tasks:** 2
- **Files modified:** 4 (1 создан, 3 изменено)

## Accomplishments

- `lib/wb-virtual-warehouse.ts`: `BPLA_WAREHOUSES` расширен до 4 записей с полями `wave`/`realWarehouseId`; добавлена `decideBplaSeedAction` — pure-функция, решающая seed/gate-blocked/already-seeded per склад.
- Единый data-файл волны 2 `burned-stock-wave2-2026-07-23.json` собран из двух прод-снапшотов (Невинномысск 128 строк/1283 шт, Краснодар 134 строки/485 шт), per-size `techSize` сохранён как есть (в отличие от волны 1, где `techSize=""`).
- `tests/wb-virtual-warehouse.test.ts`: +4 теста `decideBplaSeedAction` (все 4 кейса из плана), итого 12/12 зелёных в файле.
- `scripts/seed-bpla-warehouses.ts` переработан: блок волны 1 сужен до `BPLA_WAREHOUSES.filter(w => w.wave === 1)` (логика не менялась), добавлен новый блок волны 2 с gate-механизмом — читает `realWarehouseQty` через `aggregate._sum.quantity` (`quantity: {gt: 0}`) на реальном складе-прообразе, решает действие через `decideBplaSeedAction`, логирует `GATE: ... ещё не обнулён WB (qty=N)` / `... уже засеян ... — skip` / сеет остатки per-size.
- Скрипт теперь безопасен для ежедневного крона: `already-seeded` проверяется раньше `gate-blocked`, поэтому повторные запуски после успешного сида — гарантированный no-op, даже если WB снова временно повезёт товар на реальный склад.

## Task Commits

Each task was committed atomically:

1. **Task 1: Расширить BPLA_WAREHOUSES + pure gate-функция + единый data-файл волны 2 + тесты** - `8e18743` (feat)
2. **Task 2: Переработать seed-bpla-warehouses.ts — gate-сид волны 2 поверх идемпотентного сида волны 1** - `0099baf` (feat)

**Plan metadata:** (этот коммит — SUMMARY + STATE.md, см. ниже)

## Files Created/Modified

- `lib/wb-virtual-warehouse.ts` — `BPLA_WAREHOUSES` (4 записи, `wave`/`realWarehouseId`), `BplaSeedAction` тип, `decideBplaSeedAction` pure-функция
- `.planning/quick/260723-hr5-2-gate/burned-stock-wave2-2026-07-23.json` — единый data-файл волны 2 (nevinnomyssk + krasnodar, per-size items)
- `tests/wb-virtual-warehouse.test.ts` — +4 теста `decideBplaSeedAction` (12/12 в файле)
- `scripts/seed-bpla-warehouses.ts` — волна 1 (фильтр wave===1, логика прежняя) + волна 2 (gate-механизм, per-size upsert)

## Decisions Made

- Gate по `aggregate._sum.quantity` с фильтром `quantity: {gt: 0}` (не по факту существования строк) — WB иногда оставляет строку с `quantity=0` вместо удаления, это тоже должно считаться «обнулено».
- Порядок проверки в `decideBplaSeedAction`: `already-seeded` ПЕРВЫМ, `gate-blocked` вторым — гарантирует «засеять ровно один раз» даже при временном возврате товара на реальный склад после сида.
- Волна 1 не тронута по существу — только сужен фильтр итерации, чтобы новый общий проход `BPLA_WAREHOUSES` не пытался создать склады волны 2 этим блоком.
- Полный `npm run test` на этой машине не проходит одной командой из-за severe OOM окружения (Windows, ~150-1100 МБ свободной памяти, commit charge ~98% из-за параллельно открытых Chrome/VSCode/Claude Code процессов) — гейт выполнен через 19 последовательных чанков по 6 тест-файлов (`--maxWorkers=2`), результат идентичен baseline: **41 failed / 11 файлов** (`appeal-actions`, `customer-actions`, `customer-sync-chat`, `merge-customers`, `messenger-ticket`, `response-templates`, `template-picker`, `support-sync-chats`, `support-sync-returns`, `wb-cooldown`, `wb-token-validate` — тот же список, что зафиксирован в `.planning/quick/260720-mj0-wb-supplier-stocks-404-deprecated-analyt/deferred-items.md`). Новых падений нет.

## Deviations from Plan

None — план исполнен точно как написан. `npx tsc --noEmit` и `npx vitest run tests/wb-virtual-warehouse.test.ts` прошли как есть (после нескольких retry из-за системной нехватки памяти на машине — не связано с кодом задачи); полный `npm run test` пришлось прогонять чанками по той же причине, но итоговый результат подтверждён идентичным baseline.

## Issues Encountered

- **Severe OOM на dev-машине во время верификации.** `npx tsc --noEmit` и `npm run test` (полная команда) несколько раз падали с `FATAL ERROR: ... JavaScript heap out of memory` / `Committing semi space failed` — не из-за кода задачи, а из-за системной нехватки памяти (commit charge ~98%, свободно 150 МБ-1.1 ГБ, сильно флуктуирует). `tsc --noEmit` в итоге прошёл чисто после нескольких retry. Полный тест-сьют прогнан 19 последовательными чанками по 6 файлов (`--maxWorkers=2`, retry до 4 попыток на чанк — реально потребовалась только 1 попытка на каждый), результат агрегирован и сверен с baseline построчно — точное совпадение (41/11, тот же список файлов). Разовая попытка `--no-file-parallelism --maxWorkers=1` дала ложно завышенное число падений (77/15) из-за потери файловой изоляции между тестами (утечка `process.env` между файлами при последовательном запуске в одном воркере) — этот результат отброшен как некорректный для сравнения с baseline.

## User Setup Required

None — no external service configuration required.

**Ручные шаги ПОСЛЕ мержа (оркестратор делает push+deploy, но НЕ выполняет следующее — из `<output>` плана):**

### 1. Установить крон на VPS (ежедневно 04:00 МСК)

Безопасен для ежедневного запуска благодаря gate + already-seeded механизму — сеет данные ровно один раз, дальше no-op:

```bash
ssh root@85.198.97.89
crontab -e
# добавить строку:
0 4 * * * cd /opt/zoiten-pro && set -a; . /etc/zoiten.pro.env; set +a; npx tsx scripts/seed-bpla-warehouses.ts >> /var/log/bpla-seed.log 2>&1
```

(МСК = серверное время, отдельного TZ-указания не требуется.)

### 2. Первый ручной прогон для проверки gate (WB ещё не обнулил на 23.07)

```bash
ssh root@85.198.97.89
cd /opt/zoiten-pro && set -a; . /etc/zoiten.pro.env; set +a
npx tsx scripts/seed-bpla-warehouses.ts
```

Ожидаемый вывод на 23.07: волна 1 — no-op (уже засеяна); волна 2 — оба склада в статусе `gate-blocked`:
```
GATE: Невинномысск БПЛА ещё не обнулён WB (qty=1283) — сид отложен
GATE: Краснодар БПЛА ещё не обнулён WB (qty=485) — сид отложен
```

### 3. После обнуления WB (ожидается через ~1.5-2 дня по опыту волны 1/Электростали)

Крон сам засеет 99003/99004 на ближайшем тике 04:00 МСК. Проверить эффект:
- `/finance/balance` — красная строка «Сгоревший товар (потенциальная компенсация WB)» вырастет на сумму по себестоимости волны 2.
- `/stock/wb` — бейджи «🔥 БПЛА: N» появятся на затронутых nmId (Невинномысск/Краснодар).
- SQL-проверка:
  ```sql
  SELECT COUNT(*) FROM "WbCardWarehouseStock" WHERE "warehouseId" IN (99003,99004);
  ```
  Ожидается > 0 (до этого — 0).

### Сценарий «закрытия» виртуального склада волны 2 (компенсация пришла / WB вернул товар)

По аналогии с волной 1 (см. `.planning/quick/260720-oh2-bpla-virtual-warehouses/260720-oh2-SUMMARY.md`, раздел «Сценарий закрытия виртуального склада») — этот шаг оставлен РУЧНЫМ SQL-процессом. Когда придёт ясность по конкретному nmId/складу:

**Вариант А — WB прислал денежную компенсацию (товар списан окончательно):**
```sql
-- Например, Невинномысск БПЛА полностью закрыт компенсацией
DELETE FROM "WbCardWarehouseStock" WHERE "warehouseId" = 99003;
-- Опционально: деактивировать сам склад (не обязательно — isVirtual уже исключает его отовсюду)
UPDATE "WbWarehouse" SET "isActive" = false WHERE id = 99003;
```
Красная строка в балансе исчезнет автоматически при следующем ежедневном снапшоте (`runFinanceSnapshot`/`FinanceStockSnapshot`), т.к. `loadBurnedQtyByNmId` вернёт пустой результат для этого склада. Саму компенсацию нужно отразить отдельной строкой дохода/актива (banking/manual adjustment) — этот скрипт этого не делает.

**Вариант Б — WB вернул часть товара физически на другой (рабочий) склад:**
```sql
-- Удалить qty на виртуальном складе только для конкретного nmId, что реально вернулся —
-- иначе задвоение с новой физической строкой, которую создаст обычный /api/wb-sync.
DELETE FROM "WbCardWarehouseStock"
WHERE "warehouseId" IN (99003, 99004)
  AND "wbCardId" = (SELECT id FROM "WbCard" WHERE "nmId" = <конкретный_nmId>);
```

**Вариант В — частичная компенсация (часть суммы/qty):**
```sql
UPDATE "WbCardWarehouseStock"
SET quantity = <новое_qty>
WHERE "warehouseId" = 99003 AND "wbCardId" = (SELECT id FROM "WbCard" WHERE "nmId" = <nmId>);
```

**⚠ Важное отличие волны 2 от волны 1 в этом сценарии:** если после закрытия виртуального склада (варианты А/Б выше) WB СНОВА временно повезёт товар на тот же реальный склад-прообраз (90024/304) до появления нового пожара — `decideBplaSeedAction` вернёт `"seed"` (виртуальные строки удалены → `virtualHasRows=false`, а `realWarehouseQty` в моменте может быть 0, если WB ещё не довёз новую партию). Это ожидаемо и безопасно: очередной крон-тик либо не сеет (реальный склад снова не пуст → `gate-blocked`), либо — если реальный склад по какой-то причине пуст в момент проверки — повторно засеет **из того же старого файла волны 2** (`burned-stock-wave2-2026-07-23.json`), что было бы НЕВЕРНО после закрытия склада. Поэтому после закрытия склада вариантом А/Б **обязательно удалить или переименовать соответствующую группу в data-файле** (`nevinnomyssk`/`krasnodar`) либо остановить крон для этого конкретного склада — иначе возможен ложный повторный сид тех же сгоревших данных. Во всех случаях `inWayFromClient` пересчитается автоматически при следующем `/api/wb-sync`/крон-запуске через `applyBurnedInWay` — отдельный ручной пересчёт не требуется.

## Next Phase Readiness

- Код готов к деплою и ручной установке крона (шаги 1-3 выше).
- Данные волны 1 не тронуты, инфраструктура (isVirtual, красная строка баланса, бейдж БПЛА в /stock/wb) не менялась — подхватит новые склады автоматически.
- Блокер: WB ещё не обнулил реальные склады-прообразы на момент завершения задачи (23.07) — ожидается gate-blocked до появления нулевых остатков на 90024/304, крон сам досеет при первом успешном обнулении.
- Нет технических блокеров для деплоя.

---
*Phase: quick-260723-hr5-2-gate*
*Completed: 2026-07-23*

## Self-Check: PASSED

All created/modified files verified present on disk (`lib/wb-virtual-warehouse.ts`, `burned-stock-wave2-2026-07-23.json`, `scripts/seed-bpla-warehouses.ts`, `tests/wb-virtual-warehouse.test.ts`); both task commits (`8e18743`, `0099baf`) verified present in git log.
