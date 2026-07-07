---
phase: 260707-iax
verified: 2026-07-07T10:39:48Z
status: passed
score: 7/7 must-haves verified
---

# Quick Task 260707-iax: Начисленные проценты по кредитам — Verification Report

**Task Goal:** Compute accrued unpaid interest per loan (pro-rate the next scheduled interest payment by elapsed days since the last payment), surface it in the Кредиты section (table column + dashboard card + loan-detail card), and add it as a SECOND BalanceLine «Начисленные проценты» under «Кредиты и займы» in /finance/balance. Everything computed at render — no DB migration.

**Verified:** 2026-07-07T10:39:48Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `computeAccruedInterest` returns ~half of nextPayment.interest mid-period, 0 for repaid/past-schedule/empty/zero-interest cases | ✓ VERIFIED | `lib/loan-math.ts:143-204` implements exact LOCKED formula (currentBalance≤0→0; prevDate=last payment≤asOf else issueDate else earliest payment; nextPayment=earliest>asOf else 0; periodDays≤0→0; elapsed clamped; `round2(interest×elapsed/period)`; UTC `Date.UTC` day-counting mirrors `computeLoanAggregates`). `npx vitest run loan-math` → 50/50 pass, including the new `describe("computeAccruedInterest")` with 7 documented edge cases (mid-period=500, issueDate-fallback=100, no-issueDate periodDays=0→0, no-nextPayment→0, repaid→0, zero-interest→0, empty→0, exact-payment-date→0). |
| 2 | `/credits` table shows «Начислено, ₽» column right of «Текущий остаток» with each loan's accrued interest | ✓ VERIFIED | `components/credits/CreditsTable.tsx:183-185` (header) and `:259-261` (cell, `formatMoney(row.accruedInterest)`), immediately after the «Текущий остоток» th/cell. Column count consistent in header and body. |
| 3 | `/credits` dashboard shows a «Начисленные проценты» card (Σ accrued over currentBalance>0 loans) next to «Общий объём задолженности» | ✓ VERIFIED | `components/credits/CreditsDashboard.tsx:30-39` card renders `formatRub(data.totalAccruedInterest)` immediately after the debt-total card. `lib/credits-data.ts:154,166-170` accumulates `totalAccruedInterest` only inside the existing `if (currentBalance > 0)` block. |
| 4 | `/credits/[id]` summary cards show «Начисленные проценты» next to «Уплачено процентов» | ✓ VERIFIED | `components/credits/LoanSummaryCards.tsx:90-99` card placed immediately after «Уплачено процентов» (card 3b), grid bumped `xl:grid-cols-6`→`xl:grid-cols-7`. Page computes and passes the prop: `app/(dashboard)/credits/[id]/page.tsx:50,124`. |
| 5 | `/finance/balance` «Кредиты и займы» group renders TWO sibling lines («Остаток тела» / «Начисленные проценты»), group subtotal = sum of both | ✓ VERIFIED | `lib/balance-data.ts:531-550`: `loansBalanceLine` (key `loans-balance`, relabeled «Остаток тела») + `accruedInterestLine` (key `loans-accrued-interest`, «Начисленные проценты»); `loansGroup.lines = [loansBalanceLine, accruedInterestLine]`; `subtotalRub = round2(loansTotal + loanAccruedTotal)`. `components/finance/BalanceSheetTable.tsx:74,311` iterates `group.lines.map(...)` generically (no hardcoded single-line assumption) — both lines will actually render. |
| 6 | «Начисленные проценты» balance line has Кредитор→Кредит drill-down whose leaf amounts sum to the line total (invariant) | ✓ VERIFIED | Code read (`lib/balance-data.ts:509-529`) + scratch reproduction test with 3 real non-zero-accrued loans across 2 lenders (see Data-Flow Trace below) confirms: loan leaves sum to lender node, lender nodes sum to line total, line total + body total = group subtotal, children sorted desc at every level. |
| 7 | `npx tsc --noEmit` clean and `npm run test` (golden suites) green | ✓ VERIFIED | `npx tsc --noEmit` → no output (clean). `npx vitest run loan-math pricing-math sales-plan-plan-fact finance-cashflow-engine sales-plan-engine balance-sheet` → **108/108 passed** (matches SUMMARY's claimed scope and count exactly). |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/loan-math.ts` | `computeAccruedInterest` pure fn, LOCKED formula | ✓ VERIFIED | Diff `4e419f2^..f187a77` is **purely additive** (61 new lines only) — `computeLoanAggregates`/`computeSchedule`/`computeStatus` byte-identical to before. |
| `tests/loan-math.test.ts` | New `describe("computeAccruedInterest")`, golden cases untouched | ✓ VERIFIED | Diff confirms purely additive; all pre-existing describes (`computeSchedule`, `computeLoanAggregates` incl. `asOf` nested describe, `computeStatus`, `bucketKey`, `bucketLabel`) byte-for-byte unchanged. |
| `lib/credits-data.ts` | `CreditRow.accruedInterest` + `CreditsDashboard.totalAccruedInterest` | ✓ VERIFIED | Both fields present and populated (`:29`, `:126`), computed via `computeAccruedInterest` import. |
| `components/credits/CreditsTable.tsx` | «Начислено, ₽» column | ✓ VERIFIED | Header + cell present, right of «Текущий остаток». |
| `components/credits/CreditsDashboard.tsx` | «Начисленные проценты» card | ✓ VERIFIED | Card present with correct data binding and null-guard preserved. |
| `components/credits/LoanSummaryCards.tsx` | `accruedInterest` prop + card | ✓ VERIFIED | Prop typed, destructured, rendered; grid columns bumped to 7. |
| `app/(dashboard)/credits/[id]/page.tsx` | Computes + passes `accruedInterest` | ✓ VERIFIED | `computeAccruedInterest(amount, payments, new Date(), loan.issueDate ?? null)` computed and passed as prop. |
| `lib/balance-data.ts` | Two-line «Кредиты и займы» group + per-lender drill-down | ✓ VERIFIED | `loanAccruedTotal` (distinct from pre-existing tax `accruedTotal` at line ~901), parallel `accruedLenderNodes` tree filtered `accrued>0`, group rebuilt with 2 sibling lines. |
| `prisma/schema.prisma` | No change (no migration) | ✓ VERIFIED | `git diff 4e419f2^ f187a77 -- prisma/schema.prisma` → empty. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `lib/credits-data.ts` (loadCredits/loadCreditsDashboard) | `lib/loan-math.ts computeAccruedInterest` | import + call with asOf/issueDate | ✓ WIRED | Both call sites present and correctly parameterized. |
| `components/credits/CreditsTable.tsx` | `CreditRow.accruedInterest` | `<td>{formatMoney(row.accruedInterest)}</td>` | ✓ WIRED | Confirmed at line 260. |
| `app/(dashboard)/credits/[id]/page.tsx` | `LoanSummaryCards accruedInterest` prop | compute in page, pass as prop | ✓ WIRED | Confirmed at lines 50, 124. |
| `lib/balance-data.ts` credit loop | two `BalanceLine` siblings in `loansGroup` | `loanAccruedTotal` accumulation + per-lender accrued nodes | ✓ WIRED | Confirmed; `BalanceSheetTable.tsx` renders `group.lines` generically so both lines actually surface in the UI (not hardcoded to a single line). |

### Data-Flow Trace (Level 4)

To exercise the drill-down invariant with real non-zero values (the shipped test fixture in `tests/balance-sheet.test.ts` happens to produce `accrued = 0` for every seeded loan — one has an empty `payments[]`, the other's only payment is already ≤ asOf with no future row, so `nextPayment === null` for both), a scratch reproduction was run (not committed, no repo files added/left behind): 3 loans across 2 lenders, each with a future scheduled payment causing non-zero mid-period pro-rata accrual.

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `loansGroup.lines[1]` (`loans-accrued-interest`) | `loanAccruedTotal` | per-loan `computeAccruedInterest` loop | Yes — scratch run: `accruedLine.amountRub = 952.9`, exactly `802.51 (Кредитор А: 451.61+350.9) + 150.39 (Кредитор Б: 150.39)` | ✓ FLOWING |
| `loansGroup.subtotalRub` | `loansTotal + loanAccruedTotal` | credit loop | Yes — scratch run: `178300 + 952.9 = 179252.9` matches exactly | ✓ FLOWING |

Invariant holds at every level with real non-zero data: loan leaves → lender node sum, lender nodes → line total, line total + body line = group subtotal. Lender/loan nodes sorted descending as required.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Loan-math golden + new suite | `npx vitest run loan-math` | 50/50 passed | ✓ PASS |
| Full documented gate scope | `npx vitest run loan-math pricing-math sales-plan-plan-fact finance-cashflow-engine sales-plan-engine balance-sheet` | 108/108 passed | ✓ PASS |
| Type check | `npx tsc --noEmit` | clean, no output | ✓ PASS |
| No schema drift | `git diff 4e419f2^ f187a77 -- prisma/schema.prisma` | empty diff | ✓ PASS |
| Non-zero accrued invariant (scratch, not committed) | temp vitest test w/ 3 loans / 2 lenders, real non-zero accrued values | leaf sums = parent totals at every level; subtotal = body + accrued | ✓ PASS |
| Prod deploy reachable | `curl -s -o /dev/null -w "%{http_code}" https://zoiten.pro` | 200 | ✓ PASS |
| Local main matches origin | `git status -sb` | `## main...origin/main` (no ahead/behind) | ✓ PASS |

### Requirements Coverage

Quick tasks are not tracked in `.planning/REQUIREMENTS.md` (no `QUICK-260707-iax` entries found there — expected, quick-task requirement IDs are self-declared in the plan frontmatter, not phase-level REQUIREMENTS). `requirements: [QUICK-260707-iax]` in the PLAN frontmatter is satisfied by all 7 truths above.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `components/finance/BalanceMethodologyDialog.tsx` | 121-124 | Glossary text for «Кредиты и займы» still says only "Остаток по кредитам ... (тело кредита − погашенная часть)" — does not mention the new «Начисленные проценты» line | ℹ️ Info | Cosmetic/documentation-only gap in an explanatory tooltip dialog; does not affect the balance computation, the rendered lines, or any must-have. Not part of the plan's declared artifact list. Recommend a small follow-up to mention the second line, but does not block this task's goal. |

No blocker or warning-level anti-patterns found in the 8 modified files. TODO/FIXME/placeholder scans on the diffs returned nothing; no stub returns, no hardcoded empty arrays feeding the new UI surfaces, no disconnected props.

### Human Verification Required

None required for automated-verifiable scope — all must-haves are pure computation + rendering, verified against actual formula/tests/wiring. Optional visual confirmation (not blocking):

### 1. Visual layout check on /credits and /credits/[id]

**Test:** Open https://zoiten.pro/credits and a loan detail page in a browser.
**Expected:** «Начислено, ₽» column fits in the table without overflow; the 7-card grid on the detail page wraps cleanly on narrower viewports (`xl:grid-cols-7`).
**Why human:** Visual layout/wrap behavior across breakpoints can't be verified via grep/tsc/vitest.

### 2. /finance/balance rendering with a loan that has genuinely non-zero accrued interest

**Test:** On prod, find or create a loan whose current date falls strictly between two scheduled payments, and confirm the «Начисленные проценты» line under «Кредиты и займы» shows a non-zero amount with a working drill-down (click to expand Кредитор→Кредит).
**Expected:** Non-zero amount, expandable tree, sums match.
**Why human:** Requires real production loan data to be in a "mid-period" state at verification time; the code-level invariant has already been proven correct in an isolated scratch simulation (see Data-Flow Trace) and the existing golden-suite fixture happens to have zero accrued interest for its seeded loans, so this cannot be double-checked live in prod purely from static analysis.

### Gaps Summary

None. All 7 must-have truths are verified against the actual current codebase (not just SUMMARY claims): the LOCKED `computeAccruedInterest` formula is implemented exactly as specified with UTC-day counting and every degenerate branch guarded to 0; `computeLoanAggregates`/`computeSchedule`/`computeStatus` are provably byte-identical (diff-verified); all 4 UI touchpoints render the value with correct wiring; the balance-sheet group correctly splits into two sibling lines with a distinct `loanAccruedTotal` accumulator (no collision with the pre-existing tax `accruedTotal`), and the leaf-sum-to-parent invariant was independently reproduced with real non-zero data (not just the zero-value shipped fixture) and holds at every level with correct descending sort. No DB/schema change. tsc clean, 108/108 documented golden tests green, prod deployed and returning 200, local main in sync with origin.

One informational (non-blocking) documentation gap noted: the balance methodology glossary tooltip text for «Кредиты и займы» hasn't been updated to mention the new accrued-interest line.

---

*Verified: 2026-07-07T10:39:48Z*
*Verifier: Claude (gsd-verifier)*
