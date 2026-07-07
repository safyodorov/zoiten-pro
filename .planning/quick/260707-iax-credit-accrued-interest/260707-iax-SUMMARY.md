---
phase: 260707-iax
plan: "01"
subsystem: credits
tags: [loan-math, credits, finance-balance, unit-test, tdd]

# Dependency graph
requires:
  - phase: 21-credits
    provides: computeLoanAggregates/computeSchedule/computeStatus (lib/loan-math.ts), loadCredits/loadCreditsDashboard (lib/credits-data.ts), Кредиты UI (CreditsTable/CreditsDashboard/LoanSummaryCards)
  - phase: 24-finance-balance
    provides: loadBalanceSheet (lib/balance-data.ts), BalanceLine drill-down invariant pattern, «Кредиты и займы» loans group
provides:
  - computeAccruedInterest — pure pro-rata начисленные проценты между платежами графика
  - CreditRow.accruedInterest + CreditsDashboard.totalAccruedInterest surfaced across /credits (table col, dashboard card, detail card)
  - /finance/balance «Кредиты и займы» group split into two sibling lines («Остаток тела» / «Начисленные проценты») with per-lender drill-down
affects: [21-credits, 24-finance-balance, 28-cashflow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "computeAccruedInterest mirrors computeLoanAggregates UTC-date convention (Date.UTC comparisons, sorted copy of payments)"
    - "Parallel per-lender drill-down tree built from the SAME lenderMap already used for principal (loans-balance), filtered by accrued>0"

key-files:
  created: []
  modified:
    - lib/loan-math.ts
    - tests/loan-math.test.ts
    - lib/credits-data.ts
    - components/credits/CreditsTable.tsx
    - components/credits/CreditsDashboard.tsx
    - components/credits/LoanSummaryCards.tsx
    - "app/(dashboard)/credits/[id]/page.tsx"
    - lib/balance-data.ts

key-decisions:
  - "Column label «Начислено, ₽» (not «%») — the value is a money amount, consistent with existing table convention that reserves % suffix for actual percentage columns"
  - "Distinct accumulator name loanAccruedTotal (not accruedTotal) to avoid collision with the pre-existing TAX-accrual variable in lib/balance-data.ts"
  - "loans-balance key kept stable on the principal line (now labelled «Остаток тела») so existing drill-down child keys and balance-sheet.test.ts assertions keep matching unchanged"

patterns-established:
  - "New balance-sheet group split (body vs accrued) built from one shared per-entity map — reusable pattern for any future accrual-style dual-line balance group"

requirements-completed: [QUICK-260707-iax]

# Metrics
duration: ~20min
completed: 2026-07-07
---

# Quick Task 260707-iax: Начисленные проценты по кредитам Summary

**Computed (no-DB, no-migration) accrued-unpaid-interest figure for loans, surfaced across the Кредиты section (table/dashboard/detail) and split into a dedicated liability line on /finance/balance with per-lender drill-down.**

## Performance

- **Duration:** ~20 min (incl. detached VPS deploy wait)
- **Started:** 2026-07-07T13:20:00+03:00 (approx.)
- **Completed:** 2026-07-07T13:32:00+03:00 (approx., post curl 200 check)
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- Pure `computeAccruedInterest(amount, payments, asOf, issueDate?)` in `lib/loan-math.ts` — TDD RED→GREEN, 8 new test cases covering mid-period pro-rata, issueDate fallback, degenerate periodDays=0, no-nextPayment, repaid loan, zero-interest, empty payments, exact-payment-date edge. All 27 pre-existing golden loan-math tests untouched and still green (35/35 total).
- Accrued interest surfaced in all three Кредиты surfaces: `/credits` table («Начислено, ₽» column right of «Текущий остаток»), `/credits` dashboard card («Начисленные проценты», next to «Общий объём задолженности»), `/credits/[id]` detail card (grid bumped 6→7 columns).
- `/finance/balance` «Кредиты и займы» liability group now renders TWO sibling lines — «Остаток тела» (unchanged `loans-balance` key/children) and new «Начисленные проценты» (`loans-accrued-interest`) with its own Кредитор→Кредит drill-down built from the same per-loan loop, filtered to `accrued > 0`. Group subtotal = `round2(loansTotal + loanAccruedTotal)`.
- Both gates green: `npx tsc --noEmit` clean; required golden suites (loan-math, pricing-math, plan-fact ×2 files, engine ×2 files, balance-sheet) 108/108 passing.
- Committed, pushed, deployed detached to prod; `https://zoiten.pro` → 200; systemd clean restart, no errors in journal.

## Task Commits

Each task was committed atomically:

1. **Task 1a (RED): failing test for computeAccruedInterest** - `4e419f2` (test)
2. **Task 1b (GREEN): implement computeAccruedInterest** - `8fd6519` (feat)
3. **Task 2: surface accrued interest across Кредиты section** - `54f8b87` (feat)
4. **Task 3: balance «Кредиты и займы» two-line split** - `f187a77` (feat)

No separate refactor commit needed (implementation was already clean on first pass).

_Pushed to origin/main and deployed to prod (see Deploy section below)._

## Files Created/Modified
- `lib/loan-math.ts` - new exported `computeAccruedInterest` pure fn (LOCKED pro-rata formula)
- `tests/loan-math.test.ts` - new `describe("computeAccruedInterest")` block, 8 cases; existing describes untouched
- `lib/credits-data.ts` - `CreditRow.accruedInterest`, `CreditsDashboard.totalAccruedInterest`, wired in `loadCredits`/`loadCreditsDashboard`
- `components/credits/CreditsTable.tsx` - «Начислено, ₽» column (header + cell) right of «Текущий остаток»
- `components/credits/CreditsDashboard.tsx` - «Начисленные проценты» summary card after «Общий объём задолженности»
- `components/credits/LoanSummaryCards.tsx` - `accruedInterest` prop + card after «Уплачено процентов»; grid `xl:grid-cols-6` → `xl:grid-cols-7`
- `app/(dashboard)/credits/[id]/page.tsx` - computes `accruedInterest` via `computeAccruedInterest`, passes to `LoanSummaryCards`
- `lib/balance-data.ts` - credit loop now also accumulates `loanAccruedTotal` + per-lender accrued nodes; `loansGroup.lines` = `[loansBalanceLine, accruedInterestLine]`

## Decisions Made
- Column/card wording: «Начислено, ₽» for money-valued cells (table + not literally "%"), vs «Начисленные проценты» for the clearly-money dashboard/detail cards — per plan-checker finding baked into the plan.
- Used `loanAccruedTotal` (not `accruedTotal`) in `lib/balance-data.ts` to avoid shadowing the pre-existing TAX-accrual variable at line ~866 of the same function scope.
- Kept `loans-balance` key stable on the (renamed) principal line so `tests/balance-sheet.test.ts` invariant/sort assertions for that key continue to pass unmodified.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing `exceljs` dependency into local `node_modules`**
- **Found during:** Task 2 verification (`npx tsc --noEmit`)
- **Issue:** `lib/stock-wb-export.ts` (unrelated pre-existing file, not touched by this quick task) failed to compile with `Cannot find module 'exceljs'`. The package was present in `package.json`/`package-lock.json` (added by an earlier, already-deployed commit `51d4249`) but not installed in the local working tree's `node_modules`, blocking the `tsc --noEmit` gate required by this plan.
- **Fix:** Ran `npm install` (no lockfile changes — purely synced `node_modules` to the existing `package-lock.json`, 77 packages added).
- **Files modified:** none tracked (node_modules only; `package.json`/`package-lock.json` unchanged, verified via `git status`).
- **Verification:** `npx tsc --noEmit` clean afterward; `git status --short` showed no diff to `package.json`/`package-lock.json`.
- **Committed in:** N/A (no tracked file changes to commit).

---

**Total deviations:** 1 auto-fixed (1 blocking — environment/dependency sync, not a code change).
**Impact on plan:** Necessary to satisfy the plan's own tsc gate; zero functional/code impact, no scope creep into `lib/stock-wb-export.ts` itself (left untouched, out of scope per SCOPE BOUNDARY).

## Issues Encountered
- `npm run test` (unscoped) reports 42 pre-existing failures across 11 unrelated test files (`appeal-actions`, `customer-actions`, `customer-sync-chat`, `merge-customers`, `messenger-ticket`, `response-templates`, `support-sync-chats`, `support-sync-returns`, `template-picker`, `wb-sync-route`, `wb-token-validate`) — all in the support/CRM/WB-sync domain, unrelated to loans/credits/balance. Verified pre-existing (not caused by this task) via `git stash` + re-run at the pre-Task-3 commit, which reproduced the identical 42 failures. Per plan's explicit gate scope ("loan-math incl. new computeAccruedInterest cases + pricing-math + plan-fact + engine golden tests") and the SCOPE BOUNDARY rule, these were logged here (not fixed) and not blocking — the required golden suites (`tests/loan-math.test.ts`, `tests/pricing-math.test.ts`, `tests/sales-plan-plan-fact.test.ts`, `tests/finance-cashflow-engine.test.ts`, `tests/sales-plan-engine.test.ts`, `tests/balance-sheet.test.ts`) are 108/108 green.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Feature fully deployed and live at https://zoiten.pro; no follow-up work required for this quick task.
- Pre-existing 42 test failures (see Issues Encountered) are unrelated to credits/balance and should be triaged separately if they block a future phase's "full suite green" gate.

---
*Phase: 260707-iax*
*Completed: 2026-07-07*

## Self-Check: PASSED

All 8 modified/created files verified present on disk; all 4 task commits (`4e419f2`, `8fd6519`, `54f8b87`, `f187a77`) verified present in git history.
