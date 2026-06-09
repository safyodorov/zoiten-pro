---
phase: 20-procurement
plan: 01
subsystem: database
tags: [prisma, postgres, migration, procurement, decimal, enums, partial-unique]

# Dependency graph
requires:
  - phase: 20-00
    provides: RED stubs + isPrimary pure helper (lib/supplier-primary) + fetchCbrRates test scaffold
provides:
  - 10 Prisma models (Supplier, SupplierContact, SupplierProductLink, Negotiation, NegotiationProduct, NegotiationParticipant, Purchase, PurchaseItem, PurchasePayment, CurrencyRate)
  - 6 new enums (PurchaseStatus, PaymentStatus, PaymentType, DeliveryType, ContactMethod, SupplierContactType)
  - manual migration SQL (CREATE TYPE + CREATE TABLE + partial unique + compound unique)
  - regenerated Prisma client exposing all 10 delegates
affects: [20-02, 20-03, 20-04, 20-05, 20-06, 20-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Manual migration SQL (no local PG) — author migration.sql by hand, apply on VPS via prisma migrate deploy"
    - "Partial unique index WHERE col IS NOT NULL for nullable-FK uniqueness"
    - "Decimal precision: money (14,2), unit price (14,4), percent (5,2), FX rate (14,6)"

key-files:
  created:
    - prisma/migrations/20260609_phase20_procurement/migration.sql
  modified:
    - prisma/schema.prisma

key-decisions:
  - "Added 6th enum PaymentType (DEPOSIT|BALANCE) — plan called it out as a correction over reusing SupplierContactType for PurchasePayment.type"
  - "ERP_SECTION untouched — PROCUREMENT already present, no ALTER TYPE (Pitfall 1)"
  - "isPrimary / exactly-one-participant / OTHER-custom uniqueness enforced in server actions, NOT DB constraints"
  - "Purchase.supplierId FK ON DELETE RESTRICT + PurchaseItem.productId RESTRICT — protect financial history"

patterns-established:
  - "Partial unique SupplierProductLink(supplierId, productId) WHERE productId IS NOT NULL"
  - "Decimal(14,6) for CBR FX rate-to-rub precision"

requirements-completed: [D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08, D-09, D-17, D-20]

# Metrics
duration: 4min
completed: 2026-06-09
---

# Phase 20 Plan 01: Procurement Data Model Summary

**10 Prisma models + 6 enums + hand-authored migration SQL (partial unique on SupplierProductLink, compound unique on CurrencyRate) — the schema foundation every other Phase 20 wave depends on.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-09T14:07:00Z
- **Completed:** 2026-06-09T14:11:00Z
- **Tasks:** 2
- **Files modified:** 2 (1 modified, 1 created)

## Accomplishments
- Added all 10 procurement models to `prisma/schema.prisma` with correct Decimal precision (D-17) and FK ON DELETE actions; `npx prisma validate` passes.
- Added 6 new enums including the plan-mandated `PaymentType` (DEPOSIT|BALANCE) correction.
- Wired back-relations into existing `Employee` (supplierBuyers, negotiationParticipations) and `Product` (supplierProductLinks, negotiationProducts, purchaseItems) models without duplicating them.
- Authored manual migration SQL: 6 `CREATE TYPE`, 10 `CREATE TABLE`, the `SupplierProductLink` partial unique index `WHERE "productId" IS NOT NULL`, and `CurrencyRate` compound unique `(date, code)`. No `ALTER TYPE "ERP_SECTION"`.
- Regenerated Prisma client — verified `supplier`, `purchase`, `currencyRate`, `purchasePayment` delegates all exist.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 5 enums + 10 models to prisma/schema.prisma** - `8ada4a4` (feat)
2. **Task 2: Manual migration SQL + prisma generate** - `6d506ad` (feat)

_Note: Task 1 also added the 6th enum (PaymentType) per the plan's inline correction in the D-08 spec._

## Files Created/Modified
- `prisma/schema.prisma` - Added Phase 20 section: 6 enums + 10 models + back-relations on Employee/Product.
- `prisma/migrations/20260609_phase20_procurement/migration.sql` - Manual migration (enums, tables, FKs, partial unique, compound unique).

## Decisions Made
- 6th enum `PaymentType` created (not reusing `SupplierContactType`) — explicit plan correction in the D-08 task spec.
- DB-level constraints kept minimal: business-rule uniqueness (isPrimary per type, exactly-one participant, OTHER→custom) deferred to server actions per D-02/D-04, matching the project pattern.
- `Purchase.supplierId` and `PurchaseItem.productId` use ON DELETE RESTRICT to protect purchase/financial history; `SupplierProductLink.productId` uses SET NULL (soft product removal → fallback name).

## Deviations from Plan
None - plan executed exactly as written. (The 6th enum `PaymentType` was prescribed by the plan itself in the D-08 task body, not an unplanned deviation.)

## Issues Encountered
- `npx prisma validate` / `generate` require `DATABASE_URL`; the environment has no local PostgreSQL. Resolved by passing a throwaway `DATABASE_URL` inline for the validation/generate commands only — this exercises schema structure validation without needing a live DB. No schema change required.

## Known Stubs
None - this plan only adds schema + migration SQL; no UI or data-rendering code exists to stub.

## User Setup Required
None - migration applies on VPS via `prisma migrate deploy` during Plan 20-07 deploy. No external service config in this plan.

## Next Phase Readiness
- Schema + client ready for server actions (20-02..20-06) and CBR cron (20-04).
- Migration SQL ready for `prisma migrate deploy` (20-07).
- Existing `ProductIncoming` / `/purchase-plan` MVP untouched as required.

## Self-Check: PASSED

- FOUND: prisma/schema.prisma
- FOUND: prisma/migrations/20260609_phase20_procurement/migration.sql
- FOUND: .planning/phases/20-procurement/20-01-SUMMARY.md
- FOUND commit: 8ada4a4 (Task 1)
- FOUND commit: 6d506ad (Task 2)

---
*Phase: 20-procurement*
*Completed: 2026-06-09*
