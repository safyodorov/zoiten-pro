---
phase: 20-procurement
plan: 06
subsystem: procurement
tags: [purchases, payments, deposit, balance, cbr-rates, prisma, decimal, nextjs, rsc]

# Dependency graph
requires:
  - phase: 20-01
    provides: Purchase/PurchaseItem/PurchasePayment schema + enums (PurchaseStatus/PaymentStatus/PaymentType)
  - phase: 20-03
    provides: lib/procurement-math.ts (computeDepositDueDate/computeBalanceDueDate/recomputeAmountFromPercent/recomputePercentFromAmount/computePurchaseTotal)
  - phase: 20-04
    provides: lib/cbr-rates.ts getLatestRate for RUB conversion display
  - phase: 20-05
    provides: supplier action conventions (RBAC gating, Decimal handling, SupplierProductLink data)
provides:
  - Purchases subsection server actions (createPurchase auto deposit+balance, updatePurchase, savePurchasePayments, markPaymentPaid, deletePurchase)
  - Purchases list page with Статус/Период/Поставщик/Закупщик filters + status/overdue color coding
  - Purchase detail page with items table + multi-payment editor (live percent↔amount recompute, add Депозит N / Баланс N)
affects: [20-07 (UAT), procurement, plan-закупок]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "createPurchase auto-generates exactly one DEPOSIT(ordinal 1) + one BALANCE(ordinal 1) via procurement-math in a single $transaction"
    - "procurement-math is single source of payment math: same recompute functions used server (createPurchase/savePurchasePayments) and client (PurchasePaymentsCard live recompute)"
    - "OVERDUE computed live at read time (dueDate < now && !paidDate && status!==PAID), never cached in DB"
    - "PLANNED-only hard delete guard in deletePurchase (D-21)"

key-files:
  created:
    - app/actions/purchases.ts
    - app/(dashboard)/procurement/purchases/page.tsx
    - app/(dashboard)/procurement/purchases/[id]/page.tsx
    - components/procurement/PurchaseFilters.tsx
    - components/procurement/PurchasesTable.tsx
    - components/procurement/PurchaseModal.tsx
    - components/procurement/PurchasePaymentsCard.tsx
    - components/procurement/PurchaseDetailActions.tsx
  modified: []

key-decisions:
  - "PurchaseModal owns shared types (SupplierOption/ProductOption/ProductLinkMap/PurchaseForModal) imported by page.tsx + table + detail actions — single type source"
  - "productLinkMap (supplierId → productId → {unitPrice,currency,deposit/balancePct,leadTimeDays}) computed in RSC and passed to client modal for unitPrice prefill + payment-param resolution"
  - "PurchaseDetailActions extracted as small client wrapper so detail page stays RSC (edit modal + PLANNED-only delete)"
  - "savePurchasePayments recomputes amount from percent against current total only when amount omitted; explicit amount wins"
  - "createPurchase redirects to detail page on success so user immediately sees auto-generated deposit+balance"

patterns-established:
  - "Multi-payment editor: vertical card list grouped DEPOSIT then BALANCE by ordinal, live percent↔amount via procurement-math, add-deposit/add-balance buttons compute next ordinal client-side"
  - "Per-supplier SupplierProductLink prefill: select товар → setValue unitPrice (editable), without mutating Supplier (D-08)"

requirements-completed: [D-05, D-06, D-07, D-08, D-10, D-11, D-12, D-13, D-16, D-17, D-18, D-19, D-21]

# Metrics
duration: 6min
completed: 2026-06-09
---

# Phase 20 Plan 06: Закупки (Purchases) Summary

**Purchases subsection: createPurchase auto-generates deposit+balance via procurement-math, list page with status/period/supplier/buyer filters + live OVERDUE coding, and a detail page with a multi-payment editor doing instant percent↔amount recompute and add Депозит N / Баланс N — closing the procurement cycle.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-09T14:31:54Z
- **Completed:** 2026-06-09T14:38:07Z
- **Tasks:** 3
- **Files modified:** 8 created

## Accomplishments
- `createPurchase` builds Purchase + items + exactly one DEPOSIT(ordinal 1) + one BALANCE(ordinal 1) in one `$transaction`, dates/amounts from `lib/procurement-math`, params resolved from the selected items' `SupplierProductLink` (fallback 30/70/45).
- Multi-payment CRUD: `savePurchasePayments` (upsert + deleteMany notIn, percent→amount reconcile), `markPaymentPaid` (manual PAID), `deletePurchase` (PLANNED-only hard delete, D-21). No Supplier mutation anywhere.
- Purchases list: RSC, createdAt DESC, Статус/Период/Поставщик/Закупщик filters (URL-driven), sticky raw-HTML table with status badges (PLANNED grey / ACTIVE blue / COMPLETED emerald) + live OVERDUE red badge + nearest unpaid dueDate.
- Detail page: items table with итог + RUB equivalent via `getLatestRate`, `PurchaseModal` edit (single supplier + currency=CNY + items unitPrice prefill), `PurchasePaymentsCard` with live percent↔amount recompute and add-deposit/add-balance buttons.

## Task Commits

1. **Task 1: app/actions/purchases.ts** - `efefa9e` (feat)
2. **Task 2: list page + filters + table + create modal** - `f5b9cc5` (feat)
3. **Task 3: detail page + multi-payment editor** - `be1bd26` (feat)

_Note: PurchaseModal was committed with Task 2 because PurchasesTable imports it (keeps the commit self-consistent); it serves both Task 2 (create) and Task 3 (edit)._

## Files Created/Modified
- `app/actions/purchases.ts` - createPurchase/updatePurchase/savePurchasePayments/markPaymentPaid/deletePurchase
- `app/(dashboard)/procurement/purchases/page.tsx` - RSC list, filters, live OVERDUE, modal data wiring
- `app/(dashboard)/procurement/purchases/[id]/page.tsx` - RSC detail, items table + total + RUB, multi-payment editor mount
- `components/procurement/PurchaseFilters.tsx` - status/period/supplier/buyer URL-driven filters (D-13)
- `components/procurement/PurchasesTable.tsx` - sticky raw-HTML table, status/overdue color coding
- `components/procurement/PurchaseModal.tsx` - create/edit dialog, single supplier+currency, items useFieldArray, unitPrice prefill; owns shared types
- `components/procurement/PurchasePaymentsCard.tsx` - multi-payment editor, live percent↔amount via procurement-math, add Депозит/Баланс, mark paid
- `components/procurement/PurchaseDetailActions.tsx` - client header actions (edit + PLANNED-only delete)

## Decisions Made
- Shared types live in `PurchaseModal.tsx` and are imported by the page, table, and detail actions — avoids a separate types module and keeps RSC↔client boundaries clean.
- `productLinkMap` is computed server-side (Decimal→number) and passed to the client modal so unitPrice prefill and deposit/balance/leadTime resolution happen without extra client round-trips.
- On create, the modal redirects to the detail page so the user immediately sees the auto-generated deposit+balance schedule.
- `markPaymentPaid` on an unsaved (new) payment row applies the PAID status locally with a toast hint, persisting on the next "Сохранить платежи".

## Deviations from Plan

None - plan executed exactly as written. The `/procurement/purchases` nav entry already existed (added in 20-05), so no nav wiring was needed.

## Issues Encountered
None. Full-project `npx tsc --noEmit` is clean; `tests/procurement-math.test.ts` GREEN (8/8) confirming the shared math helper consumed by createPurchase still passes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Purchases subsection complete; ready for 20-07 UAT (create purchase → 1 deposit +3d + 1 balance +leadTime; edit deposit percent → amount updates; supplier link unchanged; ACTIVE purchase delete blocked).
- D-10 (План закупок MVP) remains for a later plan — independent of this work.

## Self-Check: PASSED

All 8 created files present on disk; all 3 task commits (efefa9e, f5b9cc5, be1bd26) present in git history.

---
*Phase: 20-procurement*
*Completed: 2026-06-09*
