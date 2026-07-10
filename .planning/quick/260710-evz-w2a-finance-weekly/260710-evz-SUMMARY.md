---
phase: quick-260710-evz
plan: W2a
subsystem: finance-weekly
tags: [finance, weekly-report, wb, rollup, rbac]
requires:
  - lib/finance-weekly/engine.ts (computeWeeklyFinReport)
  - lib/finance-weekly/types.ts (WeeklyArticleInput, UniversePools, ...)
  - lib/pricing-math.ts (calculatePricingStandard)
  - lib/credits-schedule-data.ts (loadSummarySchedule)
provides:
  - /finance/weekly live rollup page (Universe → Brand → Article, dual ИУ/Оферта)
  - lib/finance-weekly/data.ts (loadWeeklyFinReportInputs, ManualPools)
  - app/actions/finance-weekly.ts (saveWeeklyPools)
affects:
  - components/finance/FinanceTabs.tsx (new «Понедельный» tab)
  - components/layout/section-titles.ts (header title)
tech-stack:
  added: []
  patterns:
    - sticky data-table (solid bg, no shadcn Table header)
    - AppSetting KV manual pools (financeWeekly.pools.<weekISO>)
    - ISO-week resolve via ?week + UTC Monday normalization
key-files:
  created:
    - lib/finance-weekly/data.ts
    - app/actions/finance-weekly.ts
    - components/finance/WeeklyFinReportTable.tsx
    - components/finance/WeeklyFinReportControls.tsx
    - app/(dashboard)/finance/weekly/page.tsx
  modified:
    - components/finance/FinanceTabs.tsx
    - components/layout/section-titles.ts
decisions:
  - N_std modeled via calculatePricingStandard.logisticsEffAmount (coalesced ?? 0)
  - Credit interest base = applBase (WB-in-scope approximation of Excel AE338)
  - Manual pools = placeholder until W3 bank classifier
metrics:
  duration: ~6 min
  tasks: 3
  files: 7
  completed: 2026-07-10
---

# Phase quick-260710-evz Plan W2a: /finance/weekly Scaffold + Rollup Summary

Live понедельный WB фин-отчёт: `/finance/weekly` renders a Universe → Brand → Article
rollup (dual ИУ/Оферта scenarios) + cost waterfall for one ISO week, consuming the
pre-built pure engine `computeWeeklyFinReport`. Data is live (funnel orders/revenue,
advert spend, cost, WbCard commissions, Зойтен weekly credit interest, modeled N_std);
manual cost pools persist in AppSetting behind a FINANCE MANAGE editor.

## What was built

### Task 1 — Data assembly + persistence (`0d26c19`)
- **`lib/finance-weekly/data.ts`** — `loadWeeklyFinReportInputs(weekStart)` assembles
  `WeeklyArticleInput[]` + `UniversePools` for one ISO week:
  - Linked WB articles via `MarketplaceArticle` (slug `wb`) → `nmId → Product` map.
  - Weekly funnel aggregate (`WbCardFunnelDaily.groupBy` Σ ordersCount/ordersSumRub);
    `H = ordersCount`, `K = sumRub / H`. Rows with `H <= 0` skipped.
  - Weekly ad spend (`WbAdvertStatDaily.groupBy` Σ sum).
  - Commissions from `WbCard` (`commFbwIu ?? commFbsIu`, `commFbwStd ?? commFbsStd`).
  - Cost from `ProductCost.costPrice`.
  - Credit interest — Зойтен group from `loadSummarySchedule("week", …)`, Σ over columns;
    appliances only (§2.2). Credit-pool base = `applBase` (WB-in-scope approximation of
    Excel AE338, which also included Ozon — acceptable for W2a, noted inline).
  - N_std modeled via `calculatePricingStandard(...).logisticsEffAmount ?? 0` (optional
    output → coalesced) when `volumeLiters > 0`, mirroring `/prices/wb` stdParams; 0
    otherwise with a `TODO(W1)` for actual `delivery_rub`.
  - Pools §2.2: delivery shared (`baseRevenue = combinedBase`), credit appliances-only,
    overhead/acceptance/storage per universe. `ManualPools`, `DEFAULT_MANUAL_POOLS`,
    `financeWeeklyPoolsKey` exported.
- **`app/actions/finance-weekly.ts`** — `saveWeeklyPools(weekStartISO, pools)` guarded by
  `requireSection("FINANCE","MANAGE")`, ISO-shape validated, values sanitized to finite
  numbers, upserts `AppSetting financeWeekly.pools.<weekISO>` + `revalidatePath`.

### Task 2 — Rollup table + cost waterfall (`9cf3d10`)
- **`components/finance/WeeklyFinReportTable.tsx`** — client, presentational only.
  Universe → Brand → Article rows (appliances first, brands ru-alphabetical, articles by
  nmId) with columns Выручка / Прибыль ИУ / Re ИУ / Прибыль Оферта / Re Оферта, per-universe
  subtotals + grand total, and a «Водопад затрат» block showing both ИУ/Оферта cost buckets.
  Follows CLAUDE.md sticky pattern strictly: plain `<table border-separate>`, direct
  `<thead bg-background>`/`<tr>`/`<th sticky top-0 bg-background>`, solid `bg-background`/
  `bg-muted` on every sticky cell (no `/NN` alpha). Empty state «Нет данных за выбранную
  неделю». rePct rendered as fraction ×100 with `%`.

### Task 3 — RSC page + controls + registration (`ee4fd4c`)
- **`app/(dashboard)/finance/weekly/page.tsx`** — `force-dynamic`, `requireSection("FINANCE")`
  gate + `getSectionRole` for `canManage`. Resolves week from `?week` (validated → UTC ISO
  Monday) else current ISO week. `loadWeeklyFinReportInputs → computeWeeklyFinReport → render`.
- **`components/finance/WeeklyFinReportControls.tsx`** — client. Week picker (native
  `<input type="date">` + ‹ Пред. / След. › / Тек. неделя, all normalize to ISO Monday via
  UTC) → `router.push('/finance/weekly?week=…')`. MANAGE-only manual-pools editor (7 number
  inputs grouped Общее/Бытовая техника/Одежда) → `saveWeeklyPools` in `useTransition`, sonner
  toast + `router.refresh()`. Caption notes credit is auto (appliances only).
- **`components/finance/FinanceTabs.tsx`** — «Понедельный» tab → `/finance/weekly` (after ОДДС).
- **`components/layout/section-titles.ts`** — `/^\/finance\/weekly/` → «Финансы — Понедельный»,
  placed before `/finance-models`. `lib/sections.ts` already maps `/finance/` → FINANCE
  (trailing slash) — no change needed.

## Deviations from Plan

None — plan executed exactly as written. Plan-checker advisories applied:
1. `logisticsEffAmount` (optional output) coalesced with `?? 0`.
2. Inline comment on credit base = applBase noting AE338 (Ozon) approximation.
3. `/finance/weekly` title placed before `/finance-models` (slash vs hyphen — no collision).

Additionally, `RATE_DEFAULTS` was typed with an explicit interface (dropped `as const`) to
avoid a TS2322 (`Type 'number' is not assignable to type 'never'`) on indexed write — a
mechanical typing fix, not a scope change.

## Verification

- `npx tsc --noEmit` — clean (run after each task).
- `npx vitest run tests/finance-weekly-engine.test.ts tests/pricing-math.test.ts` —
  2 files passed, 63 tests passed. Engine golden test + pricing untouched.
- Manual/route smoke deferred to orchestrator post-deploy (GET /finance/weekly → 200,
  «Понедельный» tab, rollup + waterfall; `?week=` recompute; MANAGE editor persist).

## Known Stubs

- **Manual cost pools** (`ManualPools`: delivery / overhead / acceptance / storage per
  universe) default to 0 and are hand-entered by a MANAGE user — intentional placeholder
  until **W3** wires the bank classifier auto-fill. Documented in file headers and the
  editor caption; the page still renders live for all other buckets.
- **N_std** modeled (not actual delivery_rub) with `TODO(W1)` — intentional per plan scope
  (W1 replaces with `WbRealizationWeekly`).

## Self-Check: PASSED

- All 7 files present on disk.
- All 3 task commits present (`0d26c19`, `9cf3d10`, `ee4fd4c`).
