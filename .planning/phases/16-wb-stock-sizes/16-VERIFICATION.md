---
phase: 16-wb-stock-sizes
verified: 2026-04-28T11:58:21Z
status: human_needed
score: 6/6 must-haves verified (automated); UAT-9 deferred to user (visual UI verification)
human_verification:
  - test: "9-point visual UAT по 16-HUMAN-UAT.md"
    expected: "Все 9 пунктов чеклиста PASS (UI открывается, кнопка persist, контрольные nmId с размерными строками, sticky cells при expand-all, etc.)"
    why_human: "Визуальная проверка UI — sticky-table layout, фон bg-muted/30, ↳ префикс, отсутствие hydration mismatch, persist при F5 — не верифицируется программно"
---

# Phase 16: Размерная разбивка остатков WB + sync bug fix — Verification Report

**Phase Goal:** Менеджер видит остатки WB не только per (nmId, склад/кластер), но и в разрезе techSize. Кнопкой «По размерам» под каждой карточкой раскрываются строки per размер с той же структурой колонок (О/З/Об/Д per cluster + per warehouse при expanded). Параллельно расследуется и устраняется расхождение между WB API и БД (sum размеров API ≠ stockQty в БД).

**Verified:** 2026-04-28T11:58:21Z
**Status:** human_needed (все автоматические проверки PASS, осталась визуальная UI UAT пользователем)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                          | Status     | Evidence                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Schema поддерживает per-size остатки (`WbCardWarehouseStock.techSize`, compound unique)        | ✓ VERIFIED | schema.prisma:817 `techSize String @default("")`, line 821 `@@unique([wbCardId, warehouseId, techSize])`. Старый unique без techSize удалён.                  |
| 2   | Per-user toggle сохраняется в БД (`User.stockWbShowSizes`)                                     | ✓ VERIFIED | schema.prisma:68 `stockWbShowSizes Boolean @default(false)`. Migration SQL добавляет колонку в production.                                                     |
| 3   | Sync bug устранён в обоих entry points (REPLACE upsert + 2-step clean-replace per techSize)   | ✓ VERIFIED | scripts/wb-sync-stocks.js:110/116/123/132 + app/api/wb-sync/route.ts:204/241/258/268 — оба используют compound key. Нет `existing.quantity + qty`.            |
| 4   | Data layer возвращает sizeBreakdown с per-cluster/per-warehouse структурой                     | ✓ VERIFIED | lib/stock-wb-data.ts:60 `sizeBreakdown: WbStockSizeRow[]`, line 351 `buildSizeBreakdown`, line 283 вызов в getStockWbData. lib/wb-clusters.ts:57 `sortSizes`. |
| 5   | UI рендерит размерные строки + кнопку «По размерам» с optimistic + persist                     | ✓ VERIFIED | StockWbTable.tsx:42 props extension, :103-114 toggle handler, :193 кнопка, :649 рендер `card.sizeBreakdown.map`, :655 `↳ {sizeRow.techSize}`.                  |
| 6   | Diagnostic скрипт показывает diff=0 после re-sync на VPS (контрольные nmId + 87 активных)      | ✓ VERIFIED | wb-stocks-diff-2026-04-28.csv — header-only (нет diffs). 16-06-SUMMARY.md: 2237 (nmId, warehouseName) пар, 87 nmId, all matched.                                |

**Score:** 6/6 truths verified (automated); 9-point visual UAT — отложена в `16-HUMAN-UAT.md` для пользователя.

### Required Artifacts (Levels 1-3 + Level 4 data-flow)

| Artifact                                                                       | Expected                                          | Exists | Substantive | Wired | Data Flows | Status     |
| ------------------------------------------------------------------------------ | ------------------------------------------------- | ------ | ----------- | ----- | ---------- | ---------- |
| `prisma/schema.prisma` (techSize + stockWbShowSizes)                           | Schema с per-size unique + per-user toggle        | ✓      | ✓ (строки 817, 821, 68) | ✓ | n/a (DDL)  | ✓ VERIFIED |
| `prisma/migrations/20260423_phase16_size_breakdown/migration.sql`              | Manual SQL миграция (5 DDL операций)              | ✓ (27 lines) | ✓ (ADD COLUMN×2, DROP×2, CREATE INDEX, DELETE) | ✓ (применена на VPS 2026-04-28 11:48:23) | ✓ (DELETE legacy + re-sync 2312 rows) | ✓ VERIFIED |
| `scripts/wb-stocks-diagnose.js`                                                | Diagnostic CSV для контрольных nmId                | ✓ (129 lines) | ✓ (curl + Prisma + CSV write + diff math) | ✓ (запущен на VPS) | ✓ (CSV header-only diff=0) | ✓ VERIFIED |
| `lib/wb-api.ts` (techSize/barcode/perWarehouseSize)                            | WarehouseStockItem + OrdersWarehouseStats extensions | ✓ | ✓ (775,777,881 типы; 844,845 пропагация; 937 perWarehouseSizeMap) | ✓ (импортируется sync файлами) | ✓ (rows.techSize → items.push → upsert) | ✓ VERIFIED |
| `scripts/wb-sync-stocks.js` (REPLACE per-size upsert)                          | per-size upsert + 2-step clean-replace            | ✓ | ✓ (incomingKeys array, compound key, incomingSet filter) | ✓ (запущен на VPS — re-sync 2312 rows) | ✓ (per-size rows в БД для 110 nmId) | ✓ VERIFIED |
| `app/api/wb-sync/route.ts` (REPLACE per-size upsert)                           | Same per-size upsert через HTTP route             | ✓ | ✓ (line 241 compound key, line 268 incomingSet) | ✓ (вызывается «Обновить из WB» в UI) | ✓ (parallel route с scripts) | ✓ VERIFIED |
| `lib/wb-clusters.ts` (sortSizes + SIZE_ORDER)                                  | sortSizes helper                                  | ✓ | ✓ (line 57 export, line 31 SIZE_ORDER, regex+map+localeCompare) | ✓ (импортируется stock-wb-data) | ✓ (тесты GREEN — 10 cases) | ✓ VERIFIED |
| `lib/stock-wb-data.ts` (WbStockSizeRow + buildSizeBreakdown + sizeBreakdown)   | Per-size агрегация для UI                          | ✓ | ✓ (line 40 type, line 60 field, line 283 вызов в getStockWbData) | ✓ (потребляется StockWbTable) | ✓ (cardWarehouses → buildSizeBreakdown → sizeBreakdown в return) | ✓ VERIFIED |
| `app/actions/stock-wb.ts` (saveStockWbShowSizes)                               | Server action для toggle                           | ✓ | ✓ (line 70 export, line 79 ShowSizesSchema, requireSection STOCK, prisma.user.update, revalidatePath) | ✓ (импортируется StockWbTable) | ✓ (5 unit тестов GREEN) | ✓ VERIFIED |
| `app/(dashboard)/stock/wb/page.tsx` (read + prop drilling)                     | RSC чтение + initialShowSizes prop                | ✓ | ✓ (line 22, 26, 29, 52 — declaration + select extension + read + prop pass) | ✓ (передаёт в StockWbTable) | ✓ (User.stockWbShowSizes → initialShowSizes) | ✓ VERIFIED |
| `components/stock/StockWbTable.tsx` (UI кнопка + размерные строки)             | UI implementation полная                          | ✓ | ✓ (kнопка :193, обработчик :103-114, рендер :649, ↳ :655, bg-muted/30 :652, totalSizeRows :384, React.Fragment :547) | ✓ (потребляет card.sizeBreakdown, вызывает saveStockWbShowSizes) | ✓ (sizeBreakdown[].clusters → flatMap → cells) | ✓ VERIFIED |
| `.planning/phases/16-wb-stock-sizes/16-HUMAN-UAT.md`                           | 9-point UAT чеклист                               | ✓ (251 lines, 50 checkboxes) | ✓ (Pre-UAT + 9 пунктов + результаты + blockers + sign-off) | n/a (документ для человека) | n/a | ✓ VERIFIED |

### Key Link Verification (Wiring)

| From                                                | To                                                       | Via                                          | Status   | Details                                                                                                                          |
| --------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| schema.prisma                                       | migration.sql                                            | DDL соответствует Prisma schema             | ✓ WIRED  | techSize + compound unique + stockWbShowSizes — все три DDL операции отражены в обоих файлах                                     |
| WB Statistics API → lib/wb-api.ts                   | scripts/wb-sync-stocks.js + app/api/wb-sync/route.ts     | item.techSize пропагируется в upsert        | ✓ WIRED  | row.techSize ?? "" (lib/wb-api.ts:844) → item.techSize (sync files line 110/241) → compound key                                    |
| sync code                                           | diagnostic CSV                                           | Re-sync на VPS → diff=0                      | ✓ WIRED  | 16-06-SUMMARY: re-sync 2312 rows, diagnostic full-set 87 nmId, 2237 пар, all match                                                |
| lib/stock-wb-data.ts                                | components/stock/StockWbTable.tsx                        | RSC props → sizeBreakdown.map render        | ✓ WIRED  | line 60 `sizeBreakdown: WbStockSizeRow[]` → StockWbTable:649 `card.sizeBreakdown.map`                                              |
| lib/wb-clusters.ts sortSizes                        | lib/stock-wb-data.ts buildSizeBreakdown                  | import + использование внутри хелпера       | ✓ WIRED  | stock-wb-data.ts:9 import, помечено в коде sortedSizes использование (proven через тесты "sortSizes применён")                    |
| StockWbTable «По размерам» button                   | app/actions/stock-wb.ts saveStockWbShowSizes             | useTransition → server action               | ✓ WIRED  | StockWbTable.tsx:24 import, :110 await, optimistic :109, error console :112-113                                                   |
| app/(dashboard)/stock/wb/page.tsx                   | StockWbTable initialShowSizes prop                       | RSC передаёт session-derived флаг           | ✓ WIRED  | page.tsx:29 `initialShowSizes = user?.stockWbShowSizes ?? false`, :52 prop pass                                                   |
| User.stockWbShowSizes                               | per-user persist                                         | Prisma update + revalidatePath               | ✓ WIRED  | actions/stock-wb.ts:84-87 update + line 90 revalidate; page.tsx читает на следующем render                                       |

### Data-Flow Trace (Level 4)

| Artifact                              | Data Variable                  | Source                                            | Produces Real Data | Status     |
| ------------------------------------- | ------------------------------ | ------------------------------------------------- | ------------------ | ---------- |
| StockWbTable.tsx (sizeBreakdown render) | `card.sizeBreakdown[]`        | `getStockWbData()` → buildSizeBreakdown → sizeBreakdown[] | ✓ (110 nmId × per-size rows) | ✓ FLOWING  |
| StockWbTable.tsx (showSizes button)   | `showSizes` state              | `useState(initialShowSizes)` ← session.user.stockWbShowSizes | ✓ (Boolean из БД)             | ✓ FLOWING  |
| StockWbTable.tsx (sizeRow.clusters)   | `sizeRow.clusters[cluster]`   | buildSizeBreakdown groups warehouses → cluster aggregates | ✓ (totalStock per cluster)    | ✓ FLOWING  |
| StockWbTable.tsx (sizeRow.totalStock) | `sizeRow.totalStock`          | sum quantity по складам этого размера             | ✓ (integer per techSize)      | ✓ FLOWING  |
| sync files (upsert)                   | `item.techSize`                | WB Statistics API row.techSize → lib/wb-api.ts → items[] | ✓ (per-size rows из API)     | ✓ FLOWING  |

**Note (per-size orders):** В размерных строках `ordersPerDay/ordersCount/turnoverDays/deficit` всегда `null` → UI показывает `—`. Это locked design decision (CONTEXT.md §«Per-size З»): per-size orders агрегация не сохраняется в БД (только в Map в памяти от fetchOrdersPerWarehouse). НЕ дефект — отложено в STOCK-FUT.

### Behavioral Spot-Checks

| Behavior                                                   | Command                                                                                              | Result                                                       | Status |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------ |
| Phase 16 unit tests (47 cases across 5 files)              | `npm run test -- tests/stock-wb-size-sort.test.ts tests/stock-wb-data-sizebreakdown.test.ts tests/stock-wb-actions.test.ts tests/wb-stocks-per-warehouse.test.ts tests/wb-orders-per-warehouse.test.ts --run` | 5 files passed, 47 tests passed (448ms)                      | ✓ PASS |
| TypeScript compilation                                     | `npx tsc --noEmit`                                                                                   | exit 0 (нет ошибок типов)                                    | ✓ PASS |
| Diagnostic script syntax                                   | `node --check scripts/wb-stocks-diagnose.js`                                                         | exit 0                                                       | ✓ PASS |
| Sync script syntax                                         | `node --check scripts/wb-sync-stocks.js`                                                             | exit 0                                                       | ✓ PASS |
| Diagnostic CSV diff=0 (proxy)                              | header-only check `wb-stocks-diff-2026-04-28.csv`                                                    | 1 строка (только header), no diffs found                     | ✓ PASS |
| VPS deploy + re-sync (per executor 16-06)                  | bash deploy.sh + node scripts/wb-sync-stocks.js                                                      | migration applied 11:48:23 UTC, 2312 rows synced, 87 nmId active | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                                  | Status      | Evidence                                                                                                          |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| STOCK-30    | 16-W0       | Diagnostic скрипт baseline + verification после фикса                                                       | ✓ SATISFIED | `scripts/wb-stocks-diagnose.js` (129 строк); CSV header-only после re-sync доказал diff=0                          |
| STOCK-31    | 16-01       | Prisma миграция techSize + compound unique + User.stockWbShowSizes                                           | ✓ SATISFIED | schema.prisma:817/821/68 + migration.sql 27 строк применён в проде                                               |
| STOCK-32    | 16-02       | WarehouseStockItem.techSize/barcode + OrdersWarehouseStats.perWarehouseSize + тесты                          | ✓ SATISFIED | lib/wb-api.ts:775,777,881,937 + 7 новых test cases в wb-stocks/wb-orders test files (все GREEN)                   |
| STOCK-33    | 16-02       | Sync bug fix в обоих файлах (compound key REPLACE + 2-step clean-replace)                                    | ✓ SATISFIED | scripts/wb-sync-stocks.js + app/api/wb-sync/route.ts оба используют compound key. Diagnostic diff=0 на VPS.       |
| STOCK-34    | 16-03       | WbStockSizeRow + sizeBreakdown в WbStockRow + sortSizes в lib/wb-clusters.ts                                  | ✓ SATISFIED | lib/stock-wb-data.ts:40,60,283,351 + lib/wb-clusters.ts:31,57 + 19 тестов (10 sortSizes + 9 buildSizeBreakdown)    |
| STOCK-35    | 16-04       | Server action saveStockWbShowSizes + page.tsx читает stockWbShowSizes                                         | ✓ SATISFIED | app/actions/stock-wb.ts:58-92 + page.tsx:22,26,29,52 + 5 unit тестов в stock-wb-actions.test.ts (все GREEN)       |
| STOCK-36    | 16-05       | UI кнопка «По размерам» + рендер размерных строк                                                            | ✓ SATISFIED | StockWbTable.tsx:42,103-114,193,384,547,649 — все элементы на месте. Visual UAT отложена пользователю.            |
| STOCK-37    | 16-06       | Re-sync на VPS + diagnostic diff=0 + 9-point UAT                                                            | ⚠️ PARTIAL  | Re-sync + diagnostic diff=0 ✓ (16-06-SUMMARY); 16-HUMAN-UAT.md создан ✓; **9-point visual UAT отложена пользователю**. |

**Orphaned requirements:** Нет — все 8 IDs из ROADMAP.md (STOCK-30..37) покрыты планами.

### Anti-Patterns Found

| File                              | Line | Pattern                  | Severity | Impact                                              |
| --------------------------------- | ---- | ------------------------ | -------- | --------------------------------------------------- |
| (нет блокирующих)                 | —    | —                        | —        | —                                                   |

**Не найдено:**
- Нет TODO/FIXME/PLACEHOLDER маркеров в production коде Phase 16 (все TODO-маркеры в планах удалены — `Task 3 (B5)` маркер заменён в Plan 16-05)
- Нет `return null` / `return []` / `console.log only` стабов в новых компонентах
- `null` возвраты в `WbStockSizeRow.clusters[].ordersPerDay` — это locked design (per-size orders не хранятся в БД), а не stub; UI показывает `—` как honest "no data"
- В размерных строках placeholder `—` для Иваново/in-way — это semantic placeholder (per-size in-way не агрегируется в БД), не TODO

### Human Verification Required

#### 1. Visual UAT по 9 пунктам в 16-HUMAN-UAT.md

**Test:**
1. Открыть https://zoiten.pro/stock/wb — без 500/hydration mismatch (пункт 1)
2. Кнопка «По размерам» persist при F5 (пункт 2)
3. nmId 859398279 — sum размеров = stockQty карточки (пункт 3)
4. Котовск под 859398279 — 8 размерных строк {46/48/50/52/54/56/58/60} qty 8-10 (пункт 4)
5. «Без СЦ»/hidden warehouses не меняют per-cluster агрегаты (пункт 5)
6. Один-размерный товар (techSize="0") НЕ показывает размерных строк (пункт 6)
7. Sticky cells не пересекаются при expand-all + showSizes (пункт 7)
8. /inventory/wb → /stock/wb 308 redirect (пункт 8 — регресс Phase 14)
9. Diagnostic CSV diff=0 — уже PASS (пункт 9, выполнен автоматически)

**Expected:** Все 9 пунктов PASS, sign-off в 16-HUMAN-UAT.md.

**Why human:** Визуальные характеристики (sticky table layout, фон bg-muted/30, ↳ префикс, отсутствие визуальных артефактов при scroll, persist UX, F5 behavior) не верифицируются программно. Pre-UAT automation выполнила все CLI-этапы (deploy/migrate/re-sync/diagnostic), осталась только UI-проверка.

### Gaps Summary

**Не найдено блокирующих gaps.** Все автоматические проверки (truths, artifacts, key links, data-flow, behavioral spot-checks, requirements coverage) — PASS.

Phase 16 техничеsки готов. Pre-UAT automation (16-06 executor) полностью отработала:
- Миграция применена в проде (2026-04-28 11:48:23 UTC)
- Re-sync создал 2312 per-size rows для 110 nmId
- Diagnostic full-set (87 nmId, 2237 пар) → diff=0 — Phase 16 sync bug **эмпирически устранён в проде**
- Контрольный nmId 859398279 в Котовск показал 8 размерных строк (vs 1 строка qty=8 до фикса) — структурное доказательство size breakdown

**Осталась только визуальная 9-point UAT пользователем** через `.planning/phases/16-wb-stock-sizes/16-HUMAN-UAT.md`. После прохождения — sign-off + ROADMAP.md → Phase 16 Complete.

---

_Verified: 2026-04-28T11:58:21Z_
_Verifier: Claude (gsd-verifier)_
