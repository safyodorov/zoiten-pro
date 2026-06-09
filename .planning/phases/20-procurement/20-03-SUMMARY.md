---
phase: 20-procurement
plan: 03
subsystem: procurement
tags: [tdd, pure-helper, payment-math, D-08]
requires: [20-00]
provides: [procurement-math]
affects: [20-06]
tech-stack:
  added: []
  patterns:
    - "Pure import-free helper module (mirrors lib/loan-math.ts / lib/pricing-math.ts)"
    - "Math.round(n*100)/100 rounding to avoid float drift"
key-files:
  created:
    - lib/procurement-math.ts
  modified: []
decisions:
  - "Function bodies copied verbatim from 20-RESEARCH.md Pattern 6; Russian JSDoc added matching loan-math.ts style"
metrics:
  duration: ~1 min
  tasks: 1
  files: 1
  completed: "2026-06-09"
---

# Phase 20 Plan 03: Procurement Payment Math Summary

Pure, import-free `lib/procurement-math.ts` implementing D-08 deposit/balance date math and percent↔amount recompute — single source of truth for `createPurchase` (server, 20-06) and the multi-payment modal (client, 20-06). Turns the Wave 0 golden test GREEN (8/8).

## What Was Built

`lib/procurement-math.ts` with 5 named exports, no imports (client+server safe):

- `computeDepositDueDate(createdAt)` → `createdAt + 3` calendar days (crosses month boundary correctly via `setDate`).
- `computeBalanceDueDate(depositDueDate, leadTimeDays)` → `depositDueDate + leadTimeDays`.
- `recomputeAmountFromPercent(totalAmount, percent)` → `Math.round(totalAmount * percent) / 100`.
- `recomputePercentFromAmount(totalAmount, amount)` → `0` if `totalAmount === 0`, else `Math.round((amount/totalAmount)*10000)/100`.
- `computePurchaseTotal(items)` → `Σ(quantity × unitPrice)`.

## TDD Cycle

- **RED:** test existed from plan 20-00 (Wave 0) — module absent, "Cannot find module @/lib/procurement-math".
- **GREEN:** implemented module verbatim from 20-RESEARCH.md Pattern 6 + Russian JSDoc → `npx vitest run tests/procurement-math.test.ts` → 8/8 passed.
- **REFACTOR:** none needed — module already clean and minimal.

## Verification

`npx vitest run tests/procurement-math.test.ts` → Test Files 1 passed, Tests 8 passed (234ms).

Acceptance criteria met:
- Module exists, exports all 5 functions.
- File contains NO `import` statement (pure module).
- Test exits 0 (all cases GREEN).

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- FOUND: lib/procurement-math.ts
- FOUND commit: 1421dad
