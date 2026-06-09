---
phase: 20-procurement
plan: 00
subsystem: testing
tags: [vitest, tdd, procurement, cbr-rates, supplier, decimal]

# Dependency graph
requires:
  - phase: 07-prices-wb
    provides: vitest 4.x config + @ alias + golden-test pattern reused for these stubs
provides:
  - "tests/procurement-math.test.ts — RED golden test pinning D-08 deposit/balance date + percent<->amount formulas"
  - "tests/cbr-rates.test.ts — RED test pinning D-09 CBR parse (ratePerUnit=Value/Nominal), fetch error, getLatestRate fallback"
  - "tests/supplier-actions.test.ts — RED test pinning D-02 one-isPrimary-per-(supplierId,type) via pure resolvePrimaryWrites helper"
affects: [20-03 procurement-math, 20-04 cbr-rates, 20-05 supplier-actions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-helper extraction so vitest can test server-action logic without loading next-auth chain (resolvePrimaryWrites)"
    - "vi.stubGlobal(fetch) for CBR HTTP mock; vunstubAllGlobals in afterEach"

key-files:
  created:
    - tests/procurement-math.test.ts
    - tests/cbr-rates.test.ts
    - tests/supplier-actions.test.ts
  modified: []

key-decisions:
  - "D-02 isPrimary enforcement pinned against PURE helper @/lib/supplier-primary (resolvePrimaryWrites) — server action pulls next-auth which vitest cannot load"
  - "fetchCbrRates mocked via vi.stubGlobal('fetch') — CBR uses plain fetch (no TLS fingerprint workaround, unlike WB v4)"

patterns-established:
  - "Wave 0 RED stubs import from the exact future module path (@/lib/...) so each downstream task's <verify> turns them GREEN"

requirements-completed: [D-02, D-08, D-09]

# Metrics
duration: 4min
completed: 2026-06-09
---

# Phase 20 Plan 00: Wave 0 RED Test Stubs Summary

**Three failing vitest suites pinning Phase 20 contracts before implementation: D-08 procurement date/percent/amount math, D-09 CBR rate parsing + fallback, and D-02 single-isPrimary-per-(supplier,type) enforcement.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-09T17:02:00Z
- **Completed:** 2026-06-09T17:05:00Z
- **Tasks:** 3
- **Files modified:** 3 created (+1 deferred-items log)

## Accomplishments
- `tests/procurement-math.test.ts` encodes D-08 golden cases: deposit = createdAt + 3 days (incl. month boundary), balance = depositDue + leadTimeDays, percent<->amount round-trip with total=0 guard, computePurchaseTotal.
- `tests/cbr-rates.test.ts` encodes D-09: ratePerUnit = Value/Nominal (CNY Nominal=10 → 0.81), fetchCbrRates parse via mocked fetch + "CBR fetch failed" on !ok, getLatestRate fallback to latest stored row or null via mock prisma.
- `tests/supplier-actions.test.ts` encodes D-02 against pure `resolvePrimaryWrites` helper: ≤1 isPrimary per (supplierId, type), last-wins, cross-type independence, none-flagged → zero.
- All three confirmed RED for the right reason: "Cannot find module" (target module not yet created).

## Task Commits

Each task committed atomically (TDD RED only — no GREEN this wave):

1. **Task 1: procurement-math RED test (D-08)** - `de39e31` (test)
2. **Task 2: cbr-rates RED test (D-09)** - `dca9ad2` (test)
3. **Task 3: supplier-actions isPrimary RED test (D-02)** - `2f92a2d` (test)

## Files Created/Modified
- `tests/procurement-math.test.ts` - D-08 date/percent/amount golden expectations for future `lib/procurement-math.ts`
- `tests/cbr-rates.test.ts` - D-09 CBR parse/fallback expectations for future `lib/cbr-rates.ts`
- `tests/supplier-actions.test.ts` - D-02 isPrimary contract for future `lib/supplier-primary.ts`
- `.planning/phases/20-procurement/deferred-items.md` - logged 11 pre-existing unrelated failing suites (not fixed, out of scope)

## Decisions Made
- D-02 pinned via pure helper `resolvePrimaryWrites` (not the server action) — `app/actions/suppliers.ts` will pull the next-auth chain that vitest cannot load. 20-05 must extract enforcement into `lib/supplier-primary.ts`.
- CBR fetch mocked with `vi.stubGlobal("fetch")` + `vi.unstubAllGlobals()` in afterEach — matches RESEARCH note that CBR works with plain Node fetch.

## Deviations from Plan
None - plan executed exactly as written. All three test files created with the exact import paths and golden cases specified.

## Issues Encountered
- Full-suite run (`npx vitest run`) showed 14 failed suites. 3 are the intentional Wave 0 RED stubs; the other **11 are pre-existing failures unrelated to procurement** (support/customer/stock/wb-sync modules). Verified via `git show --stat` that my 3 commits added only the 3 new test files — they did not break anything. Logged the 11 to `deferred-items.md` per SCOPE BOUNDARY; NOT fixed (out of scope for Phase 20).

## Known Stubs
None — these are intentional RED test stubs (the Wave 0 deliverable), not production stubs. They turn GREEN in waves 20-03/20-04/20-05.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Wave 0 contracts pinned. Downstream tasks reference these files in their `<verify>`:
  - 20-03 creates `lib/procurement-math.ts` → greens procurement-math.test.ts
  - 20-04 creates `lib/cbr-rates.ts` → greens cbr-rates.test.ts
  - 20-05 creates `lib/supplier-primary.ts` (+ wires it into suppliers server action) → greens supplier-actions.test.ts
- Concern: 11 pre-existing failing suites should be investigated in a separate maintenance task; they may share a common prisma-mock/hoisting root cause but are unrelated to procurement.

## Self-Check: PASSED

---
*Phase: 20-procurement*
*Completed: 2026-06-09*
