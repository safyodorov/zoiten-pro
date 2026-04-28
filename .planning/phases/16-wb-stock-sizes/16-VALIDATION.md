---
phase: 16
slug: wb-stock-sizes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-22
updated: 2026-04-28
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Filled from RESEARCH.md §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (existing project test runner) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test -- --run tests/wb-stocks-per-warehouse.test.ts` |
| **Full suite command** | `npm run test -- --run` |
| **Estimated runtime** | ~5-10 секунд (existing) + новые ~3-5 секунд |

---

## Sampling Rate

- **After every task commit:** Run quick test for the modified slice
- **After every plan wave:** Run full vitest suite
- **Before `/gsd:verify-work`:** Full suite green + manual UAT с контрольными nmId
- **Max feedback latency:** ~10 секунд

---

## Per-Task Verification Map

(Populated during planning — отражает фактический набор тестов из планов 16-W0..06)

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-W0-01 | Wave0 | 0 | STOCK-30 | script | `node --check scripts/wb-stocks-diagnose.js` | ❌ create (Plan 16-W0) | ⬜ pending |
| 16-01-01 | 01 | 1 | STOCK-31 | static (regex) | `node -e "...regex check schema.prisma..."` | ✅ existing (extend `prisma/schema.prisma`) | ⬜ pending |
| 16-01-02 | 01 | 1 | STOCK-31 | static (regex) | `node -e "...regex check migration.sql..."` | ❌ create (Plan 16-01) | ⬜ pending |
| 16-02-01 | 02 | 2 | STOCK-32 | unit (vitest) | `npm run test -- tests/wb-stocks-per-warehouse.test.ts tests/wb-orders-per-warehouse.test.ts` | ✅ existing (extend) | ⬜ pending |
| 16-02-02 | 02 | 2 | STOCK-33 | static (regex) | `node -e "...regex check scripts/wb-sync-stocks.js..."` | ✅ existing (modify) | ⬜ pending |
| 16-02-03 | 02 | 2 | STOCK-33 | static (regex) | `node -e "...regex check app/api/wb-sync/route.ts..."` | ✅ existing (modify) | ⬜ pending |
| 16-03-01 | 03 | 2 | STOCK-34 | unit (vitest) | `npm run test -- tests/stock-wb-size-sort.test.ts` | ❌ create (Plan 16-03) | ⬜ pending |
| 16-03-02 | 03 | 2 | STOCK-34 | unit (vitest) | `npm run test -- tests/stock-wb-data-sizebreakdown.test.ts` | ❌ create (Plan 16-03) | ⬜ pending |
| 16-04-01 | 04 | 3 | STOCK-35 | unit (vitest) | `npm run test -- tests/stock-wb-actions.test.ts` | ❌ create (Plan 16-04) | ⬜ pending |
| 16-04-02 | 04 | 3 | STOCK-35 | static (regex) | `node -e "...regex check app/(dashboard)/stock/wb/page.tsx..."` | ✅ existing (modify) | ⬜ pending |
| 16-05-01 | 05 | 3 | STOCK-36 | static (regex) | `node -e "...regex check components/stock/StockWbTable.tsx..."` | ✅ existing (modify) | ⬜ pending |
| 16-05-02 | 05 | 3 | STOCK-36 | static + tsc | `npx tsc --noEmit` (full project type-check) | ✅ existing (modify) | ⬜ pending |
| 16-06-01 | 06 | 4 | STOCK-37 | manual UAT | визуальная проверка контрольных nmId 859398279, 901585883 | ❌ create (Plan 16-06) — `16-HUMAN-UAT.md` | ⬜ pending |
| 16-06-02 | 06 | 4 | STOCK-37 | integration (manual on VPS) | `node scripts/wb-stocks-diagnose.js` показывает diff=0 | ✅ existing (после Plan 16-W0) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*File Exists: ✅ existing — файл есть, план только модифицирует. ❌ create — план создаёт новый файл.*

---

## Wave 0 Requirements

- [ ] `scripts/wb-stocks-diagnose.js` — CSV дамп (nmId, warehouseName, apiTotal, dbTotal, diff, ratio) **ДО** изменений → baseline (pre-fix). Создаётся в Plan 16-W0.
- [ ] Существующий `tests/wb-stocks-per-warehouse.test.ts` (8 130 байт, 4 it блока) — **расширяется** в Plan 16-02 Task 1 новыми кейсами по `techSize` / `barcode` / multi-size per warehouse.
- [ ] Существующий `tests/wb-orders-per-warehouse.test.ts` (5 059 байт, 7 it блоков) — **расширяется** в Plan 16-02 Task 1 новыми кейсами по `perWarehouseSize` (включая skip-condition при пустом perWh).
- [ ] **Новый** `tests/stock-wb-size-sort.test.ts` — pure unit для `sortSizes` helper. Создаётся в Plan 16-03 Task 1.
- [ ] **Новый** `tests/stock-wb-data-sizebreakdown.test.ts` — pure unit для `buildSizeBreakdown`. Создаётся в Plan 16-03 Task 2.
- [ ] **Новый** `tests/stock-wb-actions.test.ts` — server action `saveStockWbShowSizes` с auth/Prisma mock. Создаётся в Plan 16-04 Task 1.

---

## Validation Architecture (from RESEARCH.md §1139-1195)

7 test gaps выявлены в существующем покрытии:

1. **Sync bug forensics** — нет диагностического скрипта; добавить `scripts/wb-stocks-diagnose.js` (Wave 0).
2. **fetchStocksPerWarehouse возвращает techSize** — есть только базовая фикстура без множественных размеров; расширить.
3. **wb-sync-stocks accumulation** — нет теста проверяющего повторный запуск sync; добавить.
4. **wb-sync route 6×upsert overwrite** — нет теста; добавить.
5. **stock-wb-data sizeBreakdown** — новая структура, нужен unit тест.
6. **server action saveStockWbShowSizes** — паттерн идентичен 260422-oy5, копировать тест.
7. **UI: visual UAT** — без тестов, только manual UAT в Plan 16-06.

---

## Re-sync UAT Steps

После применения миграции на VPS:

1. Backup текущего `WbCardWarehouseStock` (export CSV) — опционально, миграция стирает данные через `DELETE WHERE techSize = ''`.
2. Запустить `bash deploy.sh` на VPS — применит миграцию `20260423_phase16_size_breakdown` через `prisma migrate deploy`.
3. Запустить `node scripts/wb-sync-stocks.js` (новая версия с per-size REPLACE upsert).
4. Сравнить sum(quantity) per (wbCardId, warehouseId) ↔ WB API snapshot — diff должен быть = 0.
5. Спот-чек контрольных nmId 859398279, 901585883:
   - Все 8 размеров присутствуют per склад
   - Сумма размеров per склад = старое БД-значение из API (≥61 для Котовск брюк)
   - WbCard.stockQty = sum(WbCardWarehouseStock.quantity) для этого nmId
6. UI smoke test: открыть `/stock/wb`, нажать «По размерам», убедиться что строки раскрываются с корректными числами.

---

## Success Criteria

- [ ] Wave 0 diagnostic скрипт создан и проходит `node --check`
- [ ] Все unit тесты зелёные после соответствующих планов
- [ ] Wave 0 diagnostic после Plan 16-06 показывает diff = 0 для всех (nmId, warehouse) пар на VPS
- [ ] Manual UAT на /stock/wb (контрольные nmId) — размерные строки видны и корректны
- [ ] Кнопка «По размерам» persist per-user (после reload состояние сохраняется)
- [ ] Все размерные строки соблюдают «Без СЦ» и per-user скрытие складов
