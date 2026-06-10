---
phase: 22-bank-accounts
plan: "01"
subsystem: database
tags: [prisma, schema, migration, bank, banking]
dependency_graph:
  requires: []
  provides: [Bank, BankAccount, Counterparty, BankTransaction, ImportBatch, TxDirection, TxCategory, ERP_SECTION.BANK, Company.inn/kpp/ogrn/shortName, Lender.bankId]
  affects: [prisma/schema.prisma, prisma/migrations/20260610_phase22_bank/migration.sql]
tech_stack:
  added: []
  patterns: [hand-written SQL migration, prisma validate before commit]
key_files:
  created:
    - prisma/migrations/20260610_phase22_bank/migration.sql
  modified:
    - prisma/schema.prisma
decisions:
  - "Decimal(18,2) for BankTransaction.amount (vs Decimal(14,2) for Loan) — bank transactions can exceed 9 trillion; matches CONTEXT.md spec"
  - "fingerprint @unique on BankTransaction — SHA-256 composite key ensures idempotent re-import of overlapping statement periods"
  - "Company.inn nullable @unique — ditto Counterparty.inn; both used as dedup keys during import"
  - "Lender.bankId nullable FK -> Bank with onDelete: SetNull — backward-compat extension, existing Lenders unchanged"
  - "BankTransaction.accountId onDelete: CASCADE (history deleted with account); counterpartyId/importBatchId onDelete: SET NULL (preserve orphan transactions)"
metrics:
  duration: "167s"
  completed: "2026-06-10T08:31:55Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase 22 Plan 01: Banking Domain Schema + Migration Summary

Prisma schema extended with full banking domain (5 new models + 2 enums + ERP_SECTION.BANK + Company/Lender extensions); hand-written SQL migration created following Phase 21 pattern for VPS deploy.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Extend schema.prisma with banking domain | cdaea85 | prisma/schema.prisma |
| 2 | Create raw SQL migration 20260610_phase22_bank | de0fff8 | prisma/migrations/20260610_phase22_bank/migration.sql |

## What Was Built

**New Prisma models:**
- `Bank` — bank directory by BIC (9-digit), key for dedup
- `BankAccount` — company account in bank (number @unique, companyId + bankId FKs with RESTRICT)
- `Counterparty` — counterparty directory dedup by INN (nullable @unique)
- `BankTransaction` — bank statement row with fingerprint @unique for idempotent import, Decimal(18,2) amount, @db.Date, 4 indexes, 3 FKs
- `ImportBatch` — import session metadata (fileName, sourceBank, rowsTotal/Imported/Skipped)

**New enums:**
- `TxDirection { DEBIT CREDIT }` — statement debit/credit direction
- `TxCategory { UNCATEGORIZED INTERNAL_TRANSFER BANK_FEE SUPPLIER_PAYMENT INCOME TAX LOAN OTHER }` — base categorization for future cash-flow report

**Extended existing models:**
- `ERP_SECTION` — added `BANK` as last value
- `Company` — added `inn String? @unique`, `kpp String?`, `ogrn String?`, `shortName String?`, `accounts BankAccount[]`
- `Lender` — added `bankId String?` + `bank Bank? @relation(onDelete: SetNull)`

**SQL migration** (`prisma/migrations/20260610_phase22_bank/migration.sql`):
- `ALTER TYPE "ERP_SECTION" ADD VALUE IF NOT EXISTS 'BANK'`
- `CREATE TYPE "TxDirection"` + `CREATE TYPE "TxCategory"`
- `ALTER TABLE "Company" ADD COLUMN` (4 columns) + `CREATE UNIQUE INDEX "Company_inn_key"`
- `CREATE TABLE "Bank"` + unique index on bic
- `ALTER TABLE "Lender" ADD COLUMN "bankId"` + FK constraint
- `CREATE TABLE "BankAccount"` + unique/indexes/2 FK constraints
- `CREATE TABLE "Counterparty"` + unique index on inn
- `CREATE TABLE "ImportBatch"`
- `CREATE TABLE "BankTransaction"` + fingerprint unique + 4 indexes + 3 FK constraints

## Decisions Made

1. `Decimal(18,2)` for `BankTransaction.amount` — bank transactions can exceed the Decimal(14,2) ceiling (9.99 trillion); Phase 21 uses Decimal(14,2) for loan amounts which is adequate for loans but not bank flow.
2. `fingerprint @unique` for dedup — SHA-256 composite over `accountNumber|date|direction|amount|docNumber|counterpartyInn|normalizedPurpose`; no positional index added (would break idempotency on reordered exports).
3. `BankAccount.companyId` ON DELETE RESTRICT (protect account history); `BankTransaction.accountId` ON DELETE CASCADE (transactions meaningless without account); counterpartyId/importBatchId ON DELETE SET NULL (preserve orphan transactions).
4. `Lender.bankId` nullable — backward-compatible extension; existing Lender rows unaffected until manually linked.

## Deviations from Plan

None — plan executed exactly as written. Schema matches CONTEXT.md §«Предлагаемая схема» verbatim. Migration follows Phase 21 pattern exactly.

## Known Stubs

None — this is a pure schema/migration plan. No UI components or data stubs.

## Verification

- `npx prisma validate` (with dummy DATABASE_URL) exits 0
- All 12 SQL migration checks passed via node verify script
- `npx prisma generate` succeeded — Prisma client types BankTransaction/Bank/BankAccount/Counterparty/ImportBatch available for Plans 22-03/22-04/22-05

## Self-Check: PASSED
