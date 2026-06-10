---
phase: 23-cash-payments
plan: "01"
subsystem: database
tags: [prisma, schema, migration, cash, seed]
dependency_graph:
  requires: []
  provides: [CashEntry, CashCategory, CashDirection, ERP_SECTION.CASH, Employee.cashEntries]
  affects: [prisma/schema.prisma, prisma-client, downstream-plans-23-02..23-04]
tech_stack:
  added: [CashDirection enum, CashCategory model, CashEntry model]
  patterns: [hand-written SQL migration, ON CONFLICT DO NOTHING seed, @db.Decimal(14,2), @db.Date, fingerprint @unique dedup]
key_files:
  created:
    - prisma/migrations/20260610_phase23_cash/migration.sql
  modified:
    - prisma/schema.prisma
decisions:
  - "Decimal(14,2) для amount (паттерн Phase 21 Credits), не 18,2 как Phase 22 Bank — рубли, 14 знаков достаточно"
  - "fingerprint String? @unique (nullable) — ручные записи source=manual не нуждаются в дедупе; импортированные получают SHA-256"
  - "gen_random_uuid()::text для id в seed INSERT — pgcrypto доступен в проде (Phase 12 прецедент)"
  - "CashDirection как отдельный enum (не переиспользование TxDirection) — семантика кассы (INCOME/EXPENSE) отличается от банка (DEBIT/CREDIT)"
metrics:
  duration: "~5 minutes"
  completed: "2026-06-10"
  tasks: 2
  files: 2
---

# Phase 23 Plan 01: Prisma Schema + SQL Migration Summary

Prisma schema + hand-written SQL migration for the cash payments domain: models CashEntry/CashCategory, enum CashDirection(INCOME/EXPENSE), ERP_SECTION.CASH, Employee.cashEntries back-relation, and idempotent seed of 24 CashCategory rows.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Prisma schema — CashDirection + CashCategory + CashEntry + ERP_SECTION.CASH + Employee.cashEntries | f3553ad | prisma/schema.prisma |
| 2 | SQL миграция 20260610_phase23_cash (CREATE TABLE + FK + 24-category seed) | 044dfac | prisma/migrations/20260610_phase23_cash/migration.sql |

## What Was Built

### schema.prisma changes

**enum ERP_SECTION** — added `CASH` after `BANK`.

**enum CashDirection** — new: `INCOME` (приход) / `EXPENSE` (расход).

**model CashCategory** — справочник категорий: `id(cuid) / name(@unique) / sortOrder / entries CashEntry[] / createdAt / updatedAt`.

**model CashEntry** — операция кассы:
- `date @db.Date` — дата операции
- `direction CashDirection` — приход / расход
- `amount @db.Decimal(14,2)` — сумма в рублях
- `department String?` — подразделение
- `categoryId / category CashCategory?` — FK onDelete SetNull
- `purpose @db.Text` — назначение (исходный текст)
- `responsibleEmployeeId / responsibleEmployee Employee?` — FK onDelete SetNull
- `responsibleNameRaw String?` — исходная фамилия из файла
- `comment @db.Text?` — ручной комментарий
- `source String @default("manual")` — provenance: 'budget-yulya' | 'budget-pavel' | 'manual'
- `fingerprint String? @unique` — дедуп импорта (SHA-256)
- 4 indexes: date, categoryId, responsibleEmployeeId, direction

**Employee** — добавлена back-relation `cashEntries CashEntry[]` (Phase 23 comment).

### migration.sql

- `ALTER TYPE "ERP_SECTION" ADD VALUE IF NOT EXISTS 'CASH'`
- `CREATE TYPE "CashDirection" AS ENUM ('INCOME', 'EXPENSE')`
- `CREATE TABLE "CashCategory"` + unique index на name
- `CREATE TABLE "CashEntry"` + unique index fingerprint + 4 regular indexes
- 2 FK: `CashEntry_categoryId_fkey` (SET NULL) + `CashEntry_responsibleEmployeeId_fkey` (SET NULL)
- `INSERT 24 CashCategory rows` (gen_random_uuid()::text, sortOrder 1..24) `ON CONFLICT ("name") DO NOTHING`

All 24 category names match the keyword taxonomy in 23-CONTEXT.md (critical for categorize.ts mapping in plan 23-03).

## Verification

- `npx prisma generate` — PASSED (Prisma Client v6.19.3 generated without errors)
- Node.js script check of migration.sql — all 11 acceptance criteria PASSED

## Deviations from Plan

None — plan executed exactly as written.

The only minor adjustment: used `gen_random_uuid()::text` (explicit cast to TEXT) instead of plain `gen_random_uuid()` for the INSERT `id` column, since the table's id column is `TEXT NOT NULL`. This is functionally equivalent and ensures type safety at the SQL level.

## Known Stubs

None — this plan is schema-only; no UI or stubs created.

## Self-Check: PASSED

- `prisma/schema.prisma` — exists and validated by prisma generate
- `prisma/migrations/20260610_phase23_cash/migration.sql` — exists, all 11 checks passed
- Task 1 commit f3553ad — confirmed in git log
- Task 2 commit 044dfac — confirmed in git log
