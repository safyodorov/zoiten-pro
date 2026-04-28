---
phase: 16
slug: wb-stock-sizes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-22
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
| **Quick run command** | `npm run test -- --run tests/wb-stocks-per-warehouse-size.test.ts` |
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

(Populated during planning — placeholders below match draft 6-plan structure from RESEARCH.md)

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-W0-01 | Wave0 | 0 | DIAG | script | `node scripts/wb-stocks-diagnose.js` | ❌ W0 | ⬜ pending |
| 16-01-01 | 01 | 1 | STOCK-30 | unit | `npm run test -- wb-stocks-per-warehouse-size` | ❌ W0 | ⬜ pending |
| 16-02-01 | 02 | 2 | STOCK-31, 32 | unit | `npm run test -- wb-sync-stocks` | ❌ W0 | ⬜ pending |
| 16-02-02 | 02 | 2 | STOCK-31, 32 | integration | `node scripts/wb-stocks-diagnose.js` (diff=0) | ❌ W0 | ⬜ pending |
| 16-03-01 | 03 | 2 | STOCK-33 | unit | `npm run test -- stock-wb-data-sizebreakdown` | ❌ W0 | ⬜ pending |
| 16-04-01 | 04 | 3 | STOCK-34 | unit | `npm run test -- stock-wb-actions` | ❌ W0 | ⬜ pending |
| 16-05-01 | 05 | 3 | STOCK-35, 36 | manual UAT | визуальная проверка размерных строк | n/a | ⬜ pending |
| 16-06-01 | 06 | 4 | STOCK-37 | manual UAT | контрольные nmId 859398279 и 901585883 | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/wb-stocks-diagnose.js` — CSV дамп (nmId, warehouse, techSize, qty_api, qty_db, diff) **ДО** изменений → baseline ~80% складов с diff ≠ 0
- [ ] `tests/wb-stocks-per-warehouse-size.test.ts` — фикстура с techSize, проверка fetchStocksPerWarehouse возвращает (nmId, warehouseName, techSize, quantity, barcode)
- [ ] `tests/wb-sync-stocks.test.ts` — баг-репродукция: 2 запуска подряд → quantity не должно удваиваться (после фикса)
- [ ] `tests/stock-wb-data-sizebreakdown.test.ts` — sizeBreakdown появляется в ClusterAggregate.warehouses[i]
- [ ] `tests/stock-wb-actions.test.ts` — `saveStockWbShowSizes(true/false)` записывает в User.stockWbShowSizes

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

1. Backup текущего `WbCardWarehouseStock` (export CSV)
2. Truncate `WbCardWarehouseStock`
3. Запустить `node scripts/wb-sync-stocks.js` (новая версия)
4. Сравнить sum(quantity) per (wbCardId, warehouseId) ↔ WB API snapshot — diff должен быть = 0
5. Спот-чек контрольных nmId 859398279, 901585883:
   - Все 8 размеров присутствуют per склад
   - Сумма размеров per склад = старое БД-значение из API (≥61 для Котовск брюк)
   - WbCard.stockQty = sum(WbCardWarehouseStock.quantity) для этого nmId
6. UI smoke test: открыть `/stock/wb`, нажать «По размерам», убедиться что строки раскрываются с корректными числами

---

## Success Criteria

- [ ] Wave 0 diagnostic скрипт показывает diff ≠ 0 ДО фиксов (baseline)
- [ ] Все unit тесты зелёные после соответствующих планов
- [ ] Wave 0 diagnostic после Plan 16-06 показывает diff = 0 для всех (nmId, warehouse) пар
- [ ] Manual UAT на /stock/wb (контрольные nmId) — размерные строки видны и корректны
- [ ] Кнопка «По размерам» persist per-user (после reload состояние сохраняется)
- [ ] Все размерные строки соблюдают «Без СЦ» и per-user скрытие складов
