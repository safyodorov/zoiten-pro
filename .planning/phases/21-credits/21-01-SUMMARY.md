---
phase: 21-credits
plan: "01"
subsystem: database/schema
tags: [prisma, schema, migration, credits, loan]
dependency_graph:
  requires: []
  provides:
    - "Loan model in Prisma client"
    - "LoanPayment model in Prisma client"
    - "Lender model in Prisma client"
    - "ERP_SECTION.CREDITS enum value"
    - "Company.loans back-relation"
  affects:
    - "prisma/schema.prisma"
    - "Prisma generated client (after deploy)"
tech_stack:
  added: []
  patterns:
    - "Decimal(14,2) for money, Decimal(6,3) for interest rate"
    - "Soft delete via deletedAt DateTime?"
    - "onDelete: Restrict for Company/Lender FK; onDelete: Cascade for LoanPayment"
    - "Manual SQL migration (no local PG)"
key_files:
  created:
    - "prisma/migrations/20260609_phase21_credits/migration.sql"
  modified:
    - "prisma/schema.prisma"
decisions:
  - "U-03: справочник называется Lender (кредитор), не Bank — отражает что JetLend не банк"
  - "D-09: статус кредита не хранится в БД — computed из LoanPayment records на лету"
  - "D-19: Decimal(14,2) для денежных полей, Decimal(6,3) для годовой ставки (28.000%)"
  - "IF NOT EXISTS в ALTER TYPE — идемпотентность при повторном apply"
metrics:
  duration: "99s"
  completed: "2026-06-09T09:43:26Z"
  tasks_completed: 2
  files_changed: 2
---

# Phase 21 Plan 01: Prisma Schema — Loan/LoanPayment/Lender + CREDITS Summary

**One-liner:** Prisma schema + manual SQL migration: модели Loan/LoanPayment/Lender (справочник кредиторов) + CREDITS в ERP_SECTION для Phase 21 кредиты.

## What Was Built

Foundation БД для раздела `/credits`:

1. **`ERP_SECTION.CREDITS`** — новое значение enum, разблокирует `requireSection("CREDITS")` во всех последующих планах.

2. **`Lender`** (справочник кредиторов, U-03) — паттерн Brand/Category с sortOrder. Значения при seed: «Сбербанк», «JetLend». Назван `Lender` (не `Bank`) т.к. JetLend — краудлендинговая площадка.

3. **`Loan`** — кредит компании: contractNumber (free text), companyId FK → Company, lenderId FK → Lender, amount Decimal(14,2), annualRatePct Decimal(6,3), termMonths Int?, issueDate DateTime? (nullable), notes, soft delete (deletedAt).

4. **`LoanPayment`** — строка графика погашения: loanId FK → Loan (Cascade), date Date, principal Decimal(14,2), interest Decimal(14,2). Остаток не хранится — вычисляется при рендере. Composite index `[loanId, date]`.

5. **`Company.loans Loan[]`** — back-relation для FK `Loan.companyId`.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 8bbb5d9 | feat(21-01): add Loan/LoanPayment/Lender models + CREDITS to ERP_SECTION |
| 2 | 3c95ab5 | feat(21-01): add manual SQL migration for phase21 credits schema |

## Deviations from Plan

None — план выполнен точно. Единственное: `prisma validate` возвращает ошибку `DATABASE_URL not found` (нет локального PostgreSQL) — это ожидаемо для данного проекта, паттерн всех предыдущих миграций. `prisma format` прошёл успешно. Validate на VPS пройдёт при `prisma migrate deploy`.

## Verification Results

All acceptance criteria passed:

- `grep -c "^model Loan|^model LoanPayment|^model Lender" prisma/schema.prisma` → 3
- `CREDITS` присутствует в `enum ERP_SECTION`
- `lenderId` FK на `Lender` присутствует в блоке `Loan`
- `annualRatePct Decimal @db.Decimal(6, 3)` — корректная точность ставки
- `@@index([loanId, date])` присутствует в `LoanPayment`
- `onDelete: Restrict` для Company/Lender FK; `onDelete: Cascade` для LoanPayment
- Нет `model Bank`, нет `bankId` нигде (U-03)
- Нет поля `status` в `Loan` (D-09 computed)
- `prisma format` выполнился без изменений
- migration.sql: ALTER TYPE + 3 CREATE TABLE + indexes + FK — все с правильными onDelete

## Self-Check: PASSED

- `prisma/schema.prisma` — существует и изменён (git commit 8bbb5d9)
- `prisma/migrations/20260609_phase21_credits/migration.sql` — создан (git commit 3c95ab5)
- Оба коммита верифицированы через `git log`
