---
phase: 260707-iax
plan: "01"
type: execute
wave: 1
depends_on: []
requirements: [QUICK-260707-iax]
files_modified:
  - lib/loan-math.ts
  - tests/loan-math.test.ts
  - lib/credits-data.ts
  - components/credits/CreditsTable.tsx
  - components/credits/CreditsDashboard.tsx
  - components/credits/LoanSummaryCards.tsx
  - app/(dashboard)/credits/[id]/page.tsx
  - lib/balance-data.ts
autonomous: true

must_haves:
  truths:
    - "computeAccruedInterest returns ~half of nextPayment.interest mid-period, and 0 for repaid loan / past schedule / empty payments / zero-interest next payment"
    - "On /credits the table shows a «Начислено %» column immediately right of «Текущий остаток» with each loan's accrued interest"
    - "The /credits dashboard shows a «Начисленные проценты» card (Σ accrued over loans with currentBalance>0) next to «Общий объём задолженности»"
    - "On /credits/[id] the summary cards show «Начисленные проценты» next to «Уплачено процентов»"
    - "On /finance/balance the «Кредиты и займы» group renders TWO sibling lines: «Остаток тела» and «Начисленные проценты», with group subtotal = sum of both"
    - "The «Начисленные проценты» balance line has Кредитор→Кредит drill-down children whose leaf amounts sum to the line total (invariant)"
    - "npx tsc --noEmit is clean and npm run test (all golden suites) is green"
  artifacts:
    - path: "lib/loan-math.ts"
      provides: "Pure computeAccruedInterest(amount, payments, asOf, issueDate?) function"
      contains: "export function computeAccruedInterest"
    - path: "tests/loan-math.test.ts"
      provides: "computeAccruedInterest test suite; existing golden cases untouched"
      contains: "describe(\"computeAccruedInterest\""
    - path: "lib/credits-data.ts"
      provides: "CreditRow.accruedInterest + CreditsDashboard.totalAccruedInterest"
      contains: "accruedInterest"
    - path: "components/credits/CreditsTable.tsx"
      provides: "«Начислено %» column"
      contains: "Начислено"
    - path: "components/credits/CreditsDashboard.tsx"
      provides: "«Начисленные проценты» summary card"
      contains: "Начисленные проценты"
    - path: "components/credits/LoanSummaryCards.tsx"
      provides: "«Начисленные проценты» detail card + accruedInterest prop"
      contains: "accruedInterest"
    - path: "app/(dashboard)/credits/[id]/page.tsx"
      provides: "Computes computeAccruedInterest and passes to LoanSummaryCards"
      contains: "computeAccruedInterest"
    - path: "lib/balance-data.ts"
      provides: "Two-line «Кредиты и займы» group (body + accrued interest) with per-lender drill-down"
      contains: "computeAccruedInterest"
  key_links:
    - from: "lib/credits-data.ts (loadCredits / loadCreditsDashboard)"
      to: "lib/loan-math.ts computeAccruedInterest"
      via: "import + call with asOf=new Date(), issueDate=loan.issueDate"
      pattern: "computeAccruedInterest\\("
    - from: "components/credits/CreditsTable.tsx"
      to: "CreditRow.accruedInterest"
      via: "new <td> rendering row.accruedInterest"
      pattern: "row\\.accruedInterest"
    - from: "app/(dashboard)/credits/[id]/page.tsx"
      to: "components/credits/LoanSummaryCards.tsx accruedInterest prop"
      via: "compute in page, pass as prop"
      pattern: "accruedInterest="
    - from: "lib/balance-data.ts credit loop"
      to: "two BalanceLine siblings in loansGroup"
      via: "loanAccruedTotal accumulation + per-lender accrued nodes"
      pattern: "loanAccruedTotal"
---

<objective>
Add a COMPUTED «Начисленные проценты» (accrued unpaid interest) figure to loans, surfaced in the Кредиты section AND added to the management balance (/finance/balance) liabilities. Everything is computed at render time — no DB fields, no migration — consistent with how loan status / balance are already computed.

Purpose: give an accurate point-in-time liability picture (accrued-but-unpaid interest between scheduled payments) in both the Кредиты dashboard/table/detail and the management balance sheet.

Output: one new pure function + tests, plus display wiring across the credits section and the balance sheet.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@lib/loan-math.ts
@lib/credits-data.ts
@lib/balance-data.ts
@components/credits/CreditsTable.tsx
@components/credits/CreditsDashboard.tsx
@components/credits/LoanSummaryCards.tsx
@app/(dashboard)/credits/[id]/page.tsx
@tests/loan-math.test.ts

<interfaces>
<!-- Contracts the executor needs — use directly, no exploration required. -->

lib/loan-math.ts already exports:
```typescript
export interface PaymentInput { date: Date | string; principal: number; interest: number }
export function round2(n: number): number          // EXPORTED — reuse
// private helper (NOT exported, defined in this file — reuse inside the module):
function toDate(val: Date | string): Date
export function computeLoanAggregates(amount: number, payments: PaymentInput[], asOf?: Date): LoanAggregates
```
UTC-date convention already used in computeLoanAggregates (MIRROR IT):
```typescript
const dMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
```

lib/credits-data.ts:
```typescript
export interface CreditRow { /* ...existing... */ currentBalance: number; totalInterestPaid: number; status: LoanStatus }
export interface CreditsDashboard { totalDebt: number; weightedRatePct: number; currentYear: number; byYear: YearPayment[] }
// loadCredits: asOf = new Date(); loan.payments already ordered asc; loan.issueDate available
// loadCreditsDashboard: loop computes currentBalance via computeLoanAggregates(amount, payments, now); loan.issueDate available
```

lib/balance-data.ts (credit loop, lines ~447–515):
```typescript
// loansTotal accumulates agg.currentBalance per loan (M3 point-in-time filters already applied)
// lenderMap: Map<lenderId, { name; loans: Array<{ loanId; contractNumber; balance }> }>
// loansBalanceLine (key "loans-balance", label "Остаток по кредитам") + loansGroup ("Кредиты и займы")
// BalanceLine invariant (doc ~line 109): Σ leaf amountRub === parent amountRub at every level; children sorted by amountRub desc
// ⚠ NAME COLLISION: a variable `accruedTotal` ALREADY EXISTS at line ~866 for TAX accrual.
//   Use a DIFFERENT name (e.g. loanAccruedTotal) for loan accrued interest.
```
</interfaces>

### Calculation method (LOCKED — do not revisit)
Accrued interest for a loan as of date D (по графику / пропорция «с последнего платежа»):
1. currentBalance = amount − Σ principal(date ≤ D). If currentBalance ≤ 0 → return 0.
2. prevDate = latest payment.date ≤ D. If none → issueDate (if provided) → else earliest payment.date. If still none → return 0.
3. nextPayment = earliest payment with date > D. If none → return 0.
4. periodDays = days(prevDate → nextPayment.date). If ≤ 0 → return 0.
5. elapsedDays = clamp(days(prevDate → D), 0, periodDays).
6. accrued = round2(nextPayment.interest × elapsedDays / periodDays).
All day counts on UTC calendar dates via Date.UTC(y,m,d) (mirror computeLoanAggregates). Point-in-time = same asOf semantics as the whole balance.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure computeAccruedInterest + tests</name>
  <files>lib/loan-math.ts, tests/loan-math.test.ts</files>
  <behavior>
    New PURE fn `computeAccruedInterest(amount: number, payments: PaymentInput[], asOf: Date, issueDate?: Date | null): number`.
    Test cases (add under a new `describe("computeAccruedInterest")`, keep every existing golden case untouched):
    - Mid-period: payments where a prev payment is ~half a period before asOf and the next payment.interest=1000 → result ≈ 500 (assert with a period whose midpoint lands exactly on asOf so the value is deterministic, e.g. prev=2026-06-01, next=2026-07-01, asOf=2026-06-16 → 15/30 × 1000 = 500).
    - D before first payment, issueDate provided → pro-rate from issueDate to first payment.interest.
    - D before first payment, no issueDate → pro-rate from earliest payment.date (prevDate === nextPayment.date edge → periodDays 0 → return 0; construct case so this is well-defined and asserted).
    - D after last payment → 0 (no nextPayment).
    - Repaid loan (Σ principal(≤D) ≥ amount → currentBalance ≤ 0) → 0.
    - nextPayment.interest = 0 → 0.
    - Empty payments[] → 0.
    - D exactly on a payment date → that date becomes prevDate, elapsed into next period = 0 → 0.
  </behavior>
  <action>
    In lib/loan-math.ts add `export function computeAccruedInterest(...)` implementing the LOCKED formula (see &lt;context&gt;). Reuse the exported `round2` and the module-private `toDate` helper. Compute currentBalance as `amount − Σ principal for payments with UTC-date ≤ asOf` (same Date.UTC comparison as computeLoanAggregates); if ≤ 0 return 0. Resolve prevDate / nextPayment by scanning payments (do NOT assume sorted — sort a copy by UTC date, mirroring computeSchedule). periodDays/elapsedDays via `(Date.UTC(...) - Date.UTC(...)) / 86400000`. clamp elapsedDays to [0, periodDays]. Guard every zero/degenerate branch to return 0. DO NOT touch computeLoanAggregates / computeSchedule / computeStatus (golden-test protected).
    In tests/loan-math.test.ts import `computeAccruedInterest` and add the new describe block with the cases above. Keep existing describes (computeSchedule / computeLoanAggregates / computeStatus / bucketKey / bucketLabel) byte-for-byte unchanged.
  </action>
  <verify>
    <automated>npx vitest run loan-math</automated>
  </verify>
  <done>New computeAccruedInterest cases pass; all pre-existing loan-math golden tests still green.</done>
</task>

<task type="auto">
  <name>Task 2: Surface accrued interest across the Кредиты section</name>
  <files>lib/credits-data.ts, components/credits/CreditsTable.tsx, components/credits/CreditsDashboard.tsx, components/credits/LoanSummaryCards.tsx, app/(dashboard)/credits/[id]/page.tsx</files>
  <action>
    (a) lib/credits-data.ts — import `computeAccruedInterest`. Add `accruedInterest: number` to `CreditRow`; in loadCredits set `accruedInterest: computeAccruedInterest(amount, payments, asOf, loan.issueDate ?? null)` (asOf is the existing `new Date()`). Add `totalAccruedInterest: number` to `CreditsDashboard`; in loadCreditsDashboard add a `let totalAccruedInterest = 0` accumulator and, INSIDE the existing `if (currentBalance > 0) { ... }` block, add `totalAccruedInterest += computeAccruedInterest(amount, payments, now, loan.issueDate ?? null)`. Return `totalAccruedInterest: round2(totalAccruedInterest)`.
    (b) components/credits/CreditsTable.tsx — add a new column «Начислено %» (a `<th>` with the same sticky/right-align classes as «Текущий остаток», placed immediately AFTER it in `<thead>`) and a matching `<TableCell className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{formatMoney(row.accruedInterest)}</TableCell>` immediately after the «Текущий остаток» cell. Column count stays consistent for both header and body.
    (c) components/credits/CreditsDashboard.tsx — add a summary card «Начисленные проценты» rendering `formatRub(data.totalAccruedInterest)` immediately after the «Общий объём задолженности» card, using the identical compact plaque markup (rounded-md border bg-card px-2.5 py-1.5). Subtitle e.g. «неоплаченные, по графику». Existing null-guard `if (data.totalDebt <= 0 && data.byYear.length === 0) return null` stays.
    (d) components/credits/LoanSummaryCards.tsx — add `accruedInterest: number` to `Props`, destructure it, and add a new card «Начисленные проценты» (same `rounded-md border bg-card p-3` markup, `formatRub(accruedInterest)`) immediately AFTER the «Уплачено процентов» card. The grid currently caps at `xl:grid-cols-6` with 6 cards → bump to `xl:grid-cols-7` (or allow wrap) so all 7 cards lay out cleanly.
    (e) app/(dashboard)/credits/[id]/page.tsx — import `computeAccruedInterest`, compute `const accruedInterest = computeAccruedInterest(amount, payments, new Date(), loan.issueDate ?? null)` (reuse existing `amount` / `payments`), and pass `accruedInterest={accruedInterest}` to `<LoanSummaryCards .../>`.
    Все денежные значения форматируются существующими formatMoney/formatRub хелперами (целые ₽, tabular-nums) — как соседние ячейки/карточки.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>tsc clean; CreditRow/CreditsDashboard carry accrued fields; table column, dashboard card, and detail card all render row/data accrued values; [id] page passes the accruedInterest prop.</done>
</task>

<task type="auto">
  <name>Task 3: Balance «Кредиты и займы» two-line split + gates + deploy</name>
  <files>lib/balance-data.ts</files>
  <action>
    In lib/balance-data.ts:
    (a) Import `computeAccruedInterest` alongside the existing `computeLoanAggregates` from "@/lib/loan-math".
    (b) In the credit loop (~453–479): add `let loanAccruedTotal = 0` (declared just before the loop, next to `loansTotal`) — DO NOT reuse the name `accruedTotal` (already used for TAX accrual at line ~866). Per loan compute `const accrued = computeAccruedInterest(amount, payments, asOf, loan.issueDate ?? null)`, do `loanAccruedTotal += accrued`, and extend each `lenderEntry.loans.push({...})` object with an `accrued` field (add `accrued` to the lenderMap loans array type as well).
    (c) After the existing per-lender PRINCIPAL `lenderNodes` build, add a parallel per-lender ACCRUED node build from the SAME `lenderMap`: for each lender, filter its loans to `accrued > 0`, map to leaf `{ key: "loans-accrued-interest/lender:{id}/loan:{loanId}", label: contractNumber ?? loanId, amountRub: round2(l.accrued) }`, sort desc, skip lenders whose filtered loans are empty; lender node `amountRub = round2(Σ leaf)`. Sort lender nodes desc. (Filtering zeros preserves the invariant because they contribute exactly 0.)
    (d) Rebuild the group as TWO sibling BalanceLines:
        - «Остаток тела» = the EXISTING `loansBalanceLine` (keep key "loans-balance" so its principal children keys still match) but relabel `label: "Остаток тела"`, `amountRub: round2(loansTotal)`, children = existing principal lenderNodes.
        - «Начисленные проценты» = new line `{ key: "loans-accrued-interest", label: "Начисленные проценты", amountRub: round2(loanAccruedTotal), children: accruedLenderNodes (only if non-empty) }`.
        `loansGroup.lines = [loansBalanceLine, accruedInterestLine]`, `loansGroup.subtotalRub = round2(loansTotal + loanAccruedTotal)`.
        Liability totalRub and capital recompute automatically from group subtotals — no other edits.
    Preserve the CRITICAL invariant at every level: Σ leaf amountRub (nodes without children) === parent amountRub; children sorted by amountRub desc.

    GATES (run after the code is in place; both MUST pass before deploy):
      1. `npx tsc --noEmit` — clean.
      2. `npm run test` — full suite green (loan-math incl. new computeAccruedInterest cases + pricing-math + plan-fact + engine golden tests).

    DEPLOY (delegated by user — run only after both gates pass):
      1. Preflight free space: `ssh root@85.198.97.89 "df -h /"` → ensure ≥5GB free on /.
      2. Commit + push: `git add -A && git commit -m "feat(260707-iax): начисленные проценты по кредитам (расчёт + баланс + раздел Кредиты)" && git push origin main`.
         (commit trailer: Co-Authored-By: Claude Opus 4.8 (1M context) &lt;noreply@anthropic.com&gt;)
      3. Detached deploy (NEVER foreground — SSH drop mid-build wipes prod build):
         `ssh root@85.198.97.89 "cd /opt/zoiten-pro && nohup bash deploy.sh > /var/log/zoiten-deploy.log 2>&1 &"`
      4. Watch the log until `==> Done`: poll `ssh root@85.198.97.89 "tail -n 40 /var/log/zoiten-deploy.log"`.
      5. Smoke: `curl -s -o /dev/null -w "%{http_code}" https://zoiten.pro` → expect 200.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm run test</automated>
  </verify>
  <done>Balance «Кредиты и займы» group has «Остаток тела» + «Начисленные проценты» sibling lines with per-lender drill-down summing to each line total; group subtotal = round2(loansTotal + loanAccruedTotal); no `accruedTotal` name collision; tsc clean; full test suite green; committed + pushed; detached deploy reached `==> Done` and https://zoiten.pro returns 200.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` — no type errors across all 8 touched files.
- `npm run test` — every golden suite green (loan-math with new computeAccruedInterest describe, pricing-math, plan-fact, engine).
- Manual sanity (post-deploy): /credits table shows «Начислено %» col; /credits dashboard shows «Начисленные проценты»; /credits/[id] shows the new card; /finance/balance «Кредиты и займы» shows two lines whose drill-down leaves sum to their line totals.
- BalanceLine invariant holds: at each level Σ leaf amountRub === parent amountRub; children sorted desc.
</verification>

<success_criteria>
- computeAccruedInterest is a pure, exported, UTC-date function returning the LOCKED pro-rata value and 0 for every degenerate case.
- Accrued interest visible in all three credits surfaces (table column, dashboard card, detail card) and as a dedicated balance liability line with Кредитор→Кредит drill-down.
- No DB migration, no schema change; computeLoanAggregates/computeSchedule/computeStatus and existing golden tests untouched.
- Both gates pass; change committed, pushed, deployed detached; https://zoiten.pro → 200.
</success_criteria>

<output>
After completion, create `.planning/quick/260707-iax-credit-accrued-interest/260707-iax-SUMMARY.md`.
</output>
