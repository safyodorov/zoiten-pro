---
phase: quick-260720-oh2-bpla-virtual-warehouses
verified: 2026-07-20T18:40:00+03:00
status: human_needed
score: 6/6 truths verified in code (2 items need post-deploy human confirmation)
human_verification:
  - test: "Задеплоить (push origin/main → deploy.sh) и вручную запустить `npx tsx scripts/seed-bpla-warehouses.ts` на проде, затем открыть /finance/balance"
    expected: "Красная строка «Сгоревший товар (потенциальная компенсация WB)» в группе «Запасы», сумма ≈ 9,2 млн ₽, отдельно от «Склады WB» и «WB в пути от клиента»"
    why_human: "Требует применённой миграции + запущенного сида на реальной БД прода (локально DATABASE_URL недоступен); сумма зависит от Product.costPrice конкретных 67+35 SKU"
  - test: "Открыть /stock/wb после сида, найти карточку с сгоревшим остатком (напр. один из 67 nmId Электростали)"
    expected: "В sticky-колонке артикула виден бейдж «🔥 БПЛА: N» под nmId; карточка НЕ показывает эти N шт в кластерных колонках/Д/Об; повторный /api/wb-sync или крон не удаляет виртуальные строки (SELECT COUNT(*) FROM WbCardWarehouseStock WHERE warehouseId IN (99001,99002) не меняется)"
    why_human: "Визуальная проверка бейджа + проверка выживаемости после реального sync-прогона на проде. Также стоит подтвердить с пользователем, что бейдж «🔥 БПЛА: N» в колонке артикула удовлетворяет формулировке CONTEXT.md «показывать отдельной группой (блок «БПЛА»)» — реализация выбрала минимальный inline-бейдж вместо отдельного табличного блока/колонки (задокументированное discretion-решение в PLAN Task 2 action §5 и SUMMARY, но это не буквально «группа»)."
---

# Quick Task 260720-oh2: Виртуальные склады БПЛА Verification Report

**Task Goal:** Виртуальные склады «Электросталь БПЛА» и «Котовск БПЛА»: фиксация сгоревших остатков из снапшота 17.07, защита строк от clean-replace обоих sync-роутов, вычет сгоревшего qty из inWayFromClient в обеих точках денормализации, исключение из плана продаж / дефицита / оборачиваемости / size-popup, видимость отдельной группой «БПЛА» на /stock/wb, красная строка «Сгоревший товар (потенциальная компенсация WB)» по себестоимости в /finance/balance, без двойного счёта.

**Verified:** 2026-07-20
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Виртуальные строки переживают clean-replace в обоих роутах | ✓ VERIFIED | `app/api/wb-sync/route.ts:462-469`, `app/api/cron/wb-cards-refresh/route.ts:191-198` — `toDeleteIds` filter adds `&& !virtualIds.has(r.warehouseId)`; `virtualIds` loaded via `loadVirtualWarehouseIds(prisma)` before transaction in both routes |
| 2 | WbCard.stockQty не включает сгоревшие остатки | ✓ VERIFIED | `totalStock = warehouseItems.reduce(...)` computed only from API response (`stocksPerWarehouse`), never from DB rows — virtual rows never enter `warehouseItems`. Identical in both routes. |
| 3 | inWayFromClient = max(0, API − сгоревшее) в обеих точках | ✓ VERIFIED | `inWayFromClient: applyBurnedInWay(totalInWayFrom, burnedByNmId.get(nmId) ?? 0)` present in both routes (wb-sync:497, cron:223); `applyBurnedInWay` pure function `Math.max(0, apiInWayFrom - burnedQty)` in `lib/wb-virtual-warehouse.ts:29-31`, unit-tested (3 cases pass) |
| 4 | Красная строка «Сгоревший товар» в /finance/balance ≈9.2М₽, без двойного счёта | ✓ VERIFIED (code) / ? human (prod value) | `lib/finance-snapshot.ts` emits `WB_BURNED` location via `computeStockSnapshotRows(products, wbCardsByNmId, burnedQtyByNmId)`; `lib/balance-data.ts:864-879` pushes destructive red line `stock-wb-burned` into `inventoryGroup`, separate from `WB_IN_WAY_FROM_CLIENT`; double-count avoided because `inWayFromClient` already excludes burned qty at sync time (comment at balance-data.ts:867-868 confirms this reasoning). Actual ≈9.2M₽ figure requires live DB (seed not yet run — pending manual step) |
| 5 | /stock/wb — БПЛА группа, не влияет на дефицит/оборачиваемость | ✓ VERIFIED (exclusion) / ? human (visual "group" framing) | `lib/stock-wb-data.ts:237-238` splits `physicalWarehouses`/`virtualWarehouses` BEFORE all aggregation (clusters, totalStock, sizeBreakdown all use `physicalWarehouses` only); virtual qty surfaced via `card.bpla.{warehouses,totalStock}` (lines 360-380), rendered as inline badge "🔥 БПЛА: N" in `StockWbTable.tsx:577-586` — not a literal separate table block/column as CONTEXT.md decision phrased ("группой (блок «БПЛА»)"); functionally excluded from Д/Об either way |
| 6 | План продаж и /stock не показывают сгоревшие остатки | ✓ VERIFIED | `lib/sales-plan/data.ts:367` reads only `card.stockQty`; `lib/stock-data.ts` doesn't reference `warehouses` relation at all — both unaffected by virtual rows by construction |

**Score:** 6/6 truths hold at the code level; 2 require post-deploy human confirmation (prod ≈9.2M value, visual badge acceptance).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prisma/schema.prisma` | `WbWarehouse.isVirtual Boolean @default(false)` | ✓ VERIFIED | Line 1051, plus `FinanceStockLocation.WB_BURNED` enum value (line 1988) |
| `prisma/migrations/20260720_bpla_virtual_warehouses/migration.sql` | Additive migration | ✓ VERIFIED | 2 statements: `ALTER TABLE ... ADD COLUMN "isVirtual"` + `ALTER TYPE ... ADD VALUE 'WB_BURNED'` |
| `lib/wb-virtual-warehouse.ts` | `loadVirtualWarehouseIds, loadBurnedQtyByNmId, applyBurnedInWay` (min 25 lines) | ✓ VERIFIED | 57 lines, all 3 functions + `BPLA_WAREHOUSES`/`BPLA_SHORT_CLUSTER` constants present, DI `Db = PrismaClient \| Prisma.TransactionClient` pattern |
| `scripts/seed-bpla-warehouses.ts` | Idempotent seed from burned-stock-2026-07-17.json (min 30 lines) | ✓ VERIFIED | 148 lines; upsert warehouses by id, upsert stock rows by compound unique (REPLACE semantics), nmId-not-found → warn+skip (not throw) |
| `app/api/wb-sync/route.ts` | Protection + inWayFromClient deduction | ✓ VERIFIED | Both wired at lines 380-381 (loaders), 462-469 (filter), 497 (deduction) |
| `app/api/cron/wb-cards-refresh/route.ts` | Protection + inWayFromClient deduction | ✓ VERIFIED | Both wired at lines 130-131 (loaders), 191-198 (filter), 223 (deduction) |
| `lib/balance-data.ts` | Red line `WB_BURNED` | ✓ VERIFIED | `markDestructiveTree`, `BalanceLine.destructive`, `stock-wb-burned` line pushed into inventoryGroup |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| wb-sync + cron routes | lib/wb-virtual-warehouse.ts | `virtualIds.has(...)` filter + `applyBurnedInWay` in denormalization | ✓ WIRED | Confirmed identical pattern in both routes, imports present at top of both files |
| lib/finance-snapshot.ts | lib/balance-data.ts | `WB_BURNED` location in FinanceStockSnapshot → red balance line | ✓ WIRED | `computeStockSnapshotRows` emits `WB_BURNED` rows → persisted via `runFinanceSnapshot` → `balance-data.ts` reads `FinanceStockSnapshot` rows by location and builds `stock-wb-burned` line |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `card.bpla` (StockWbTable badge) | `bplaWarehouseSlots`/`bplaTotalStock` | `virtualWarehouses` from `card.warehouses` filtered by `ws.warehouse?.isVirtual` (live Prisma query, `include: { warehouse: true }`) | Yes, once seed run | ⚠ STATIC until seed executed on prod (currently 0 virtual rows in prod DB per SUMMARY note — clean-replace already wiped them 20.07 13:43, seed restores) |
| Balance `stock-wb-burned` line | `stockByLocation.get("WB_BURNED")` | `FinanceStockSnapshot` rows with `location="WB_BURNED"`, populated daily by `runFinanceSnapshot` via `loadBurnedQtyByNmId` | Yes, once seed run + next snapshot cycle | ⚠ STATIC until seed + snapshot run |

Both data-flow paths are correctly wired in code; they will show real numbers once the documented manual seed step executes on production and a snapshot cycle runs. This is expected and explicitly documented in SUMMARY as a required post-deploy step — not a code defect.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| applyBurnedInWay pure function | `npx vitest run tests/wb-virtual-warehouse.test.ts` | 8 tests, all pass (incl. 3 applyBurnedInWay cases, loader mocks, delete-filter) | ✓ PASS |
| WB_BURNED emission in snapshot | `npx vitest run tests/finance-snapshot.test.ts` | All pass, +2 new WB_BURNED cases (emitted/not-emitted), golden test unbroken | ✓ PASS |
| Type safety | `npx tsc --noEmit` | No errors | ✓ PASS |
| Full test suite regression | `npx vitest run` | 1161 passed, 41 failed — all 41 failures in unrelated modules (support tickets, customer merge, wb-cooldown bucket count, wb-token-validate) untouched by this task's commits (confirmed via `git log` on those test files — last touched by unrelated Phase 19/24 commits) | ✓ PASS (no regression from this task) |
| Live DB check (migration applied, seed run, actual balance value) | N/A — no local DATABASE_URL | Not run | ? SKIP — requires deployed prod environment |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| QUICK-260720-oh2 | 260720-oh2-PLAN.md | Виртуальные склады БПЛА — фиксация сгоревших остатков, защита, вычет inWayFromClient, красная строка баланса | ✓ SATISFIED | All 6 must_haves truths verified in code; 2 need post-deploy confirmation (see human_verification) |

### Anti-Patterns Found

None. No TODO/FIXME/placeholder markers in modified files. No stub returns, no empty handlers, no hardcoded-empty data flowing to render without a real data source behind it.

### Human Verification Required

### 1. Post-deploy: red balance line renders with correct value

**Test:** Push to origin/main, run deploy.sh, apply migration, manually run `npx tsx scripts/seed-bpla-warehouses.ts` on prod, wait for/trigger a finance snapshot, open `/finance/balance`.
**Expected:** Red line "Сгоревший товар (потенциальная компенсация WB)" ≈ 9.2 млн ₽, in "Запасы" group, separate from "Склады WB" and "WB в пути от клиента", no double-count.
**Why human:** Requires live production database with migration applied and seed data loaded; can't be validated in this environment (no DATABASE_URL, code not yet deployed — 4 commits ahead of origin/main).

### 2. Post-deploy: /stock/wb badge visibility and sync survival

**Test:** After seed run, open `/stock/wb`, locate a card among the 67+35 burned SKUs, confirm the "🔥 БПЛА: N" badge appears under the nmId and that the card's cluster columns / Д / Об figures do not include the burned qty. Then trigger a real `/api/wb-sync` or wait for the cron and re-check `WbCardWarehouseStock` row count for warehouseId IN (99001,99002) is unchanged.
**Expected:** Badge visible, cluster/deficit/turnover unaffected, virtual rows survive a real sync cycle.
**Why human:** Visual UI check + requires a live sync run against WB API. Additionally worth confirming with the user whether the inline badge (chosen as a scoped-down implementation of the CONTEXT.md decision "показывать отдельной группой (блок «БПЛА»)") satisfies intent, since it renders as a small badge in the article column rather than a distinct table section/block. This is a plan-time discretionary downscope documented in PLAN Task 2 §5 and SUMMARY — flagging for user sign-off rather than treating as a code gap, since exclusion from Д/Об/plan (the functionally critical part) is fully verified.

### Gaps Summary

No code-level gaps found. All 6 must_haves truths, all artifacts, and both key links are implemented, wired, and covered by passing automated tests (`npx vitest run tests/wb-virtual-warehouse.test.ts tests/finance-snapshot.test.ts` green, `npx tsc --noEmit` clean, no regressions in the broader suite attributable to this task).

The task is not yet deployed (working tree is 4 commits ahead of `origin/main`) and the seed script has not yet been run on production — both are explicitly documented as required manual post-deploy steps in SUMMARY.md, consistent with project convention (deploy.sh does not auto-run one-off data scripts). Two items are flagged for human verification after deploy: (1) the actual ≈9.2M₽ balance figure and (2) whether the minimal inline badge satisfies the user's original "отдельной группой (блок «БПЛА»)" framing from CONTEXT.md, versus a more prominent table block. Neither blocks the correctness of the underlying exclusion logic, which is verified.

---

*Verified: 2026-07-20*
*Verifier: Claude (gsd-verifier)*
