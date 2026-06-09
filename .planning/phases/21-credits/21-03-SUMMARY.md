---
phase: 21-credits
plan: "03"
subsystem: credits
tags: [pure-lib, server-actions, tdd, rbac, loan-math, lender-crud]
dependency_graph:
  requires: [21-01]
  provides: [lib/loan-math.ts, app/actions/credits.ts, app/actions/lender.ts]
  affects: [21-04, 21-05, 21-06, 21-07, 21-08]
tech_stack:
  added: []
  patterns:
    - Pure TypeScript функции без Prisma/Next (паттерн lib/stock-math.ts)
    - TDD: vitest RED→GREEN для guard расчётного слоя
    - Server actions с Zod валидацией + requireSection/requireSuperadmin + revalidatePath
    - Clean-replace паттерн для nested LoanPayment (deleteMany + createMany в транзакции)
    - Soft delete (deletedAt = new Date()) для Loan
    - FK Restrict guard с user-friendly message для Lender
key_files:
  created:
    - lib/loan-math.ts
    - tests/loan-math.test.ts
    - app/actions/credits.ts
    - app/actions/lender.ts
  modified: []
decisions:
  - "ISO 8601 week algorithm реализован через «четверг текущей недели» (RFC стандарт) — year/week определяется по году, в котором находится четверг недели"
  - "bucketLabel: ru-RU короткие месяцы через статический массив RU_MONTHS_SHORT — нет зависимости от Intl.DateTimeFormat (SSR safe)"
  - "Prisma generate потребовался после Plan 21-01 (Rule 3 — блокирующая проблема) — типы Loan/LoanPayment/Lender не были в клиенте до regenerate"
metrics:
  duration: "~4 минуты"
  completed: "2026-06-09"
  tasks: 2
  files: 4
---

# Phase 21 Plan 03: Pure Loan Math + Server Actions Summary

Pure расчётный слой `lib/loan-math.ts` с ISO-week бакетированием + vitest (24 теста) + CRUD actions для Loan+LoanPayment и Lender-справочника.

## What Was Built

### Task 1: lib/loan-math.ts + tests/loan-math.test.ts (TDD)

**lib/loan-math.ts** — pure TypeScript модуль без Prisma/Next зависимостей:

- `computeSchedule(amount, payments[])` — накопительный balance = amount − Σprincipal, сортировка по date ASC
- `computeLoanAggregates(amount, payments[])` — D-04: totalPrincipalPaid / totalInterestPaid / currentBalance / overpayment с guard для пустого массива
- `computeStatus(balance)` — D-09: "active" если balance>0, "paid" если ≤0
- `bucketKey(date, granularity)` — D-03/D-14: "day"→YYYY-MM-DD, "month"→YYYY-MM, "week"→ISO 8601 YYYY-Www
- `bucketLabel(key, granularity)` — ru-RU метки: "09.06" / "июн 2026" / "нед. 24"
- `round2(n)` helper — Math.round(n*100)/100 для денег

**tests/loan-math.test.ts** — 24 vitest теста зелёные:
- computeSchedule (5 тестов): balance накопительный, сортировка ASC
- computeLoanAggregates (7 тестов): агрегаты + guards (пустой массив)
- computeStatus (4 теста): active/paid граничные случаи
- bucketKey (5 тестов): включая ISO week edge cases (2024-12-30 → 2025-W01)
- bucketLabel (3 теста): ru-RU форматирование

### Task 2: app/actions/credits.ts + app/actions/lender.ts

**app/actions/credits.ts** — "use server", все действия под `requireSection("CREDITS", "MANAGE")`:
- `createLoan(data)` — prisma.loan.create с nested payments.create[]
- `updateLoan(data)` — транзакция: update скаляров + deleteMany/createMany payments (clean-replace)
- `deleteLoan(id)` — soft delete: `{ deletedAt: new Date() }`
- `replaceLoanPayments(loanId, payments[])` — для seed/импорта (clean-replace)

**app/actions/lender.ts** — "use server", все действия под `requireSuperadmin()`:
- `createLender(name)` — sortOrder = max+1
- `updateLender(id, name)` — update name
- `deleteLender(id)` — P2003 FK Restrict → "Нельзя удалить кредитора с кредитами"
- `reorderLenders(ids[])` — update sortOrder по индексу (паттерн reference.ts)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prisma client не содержал типы Loan/LoanPayment/Lender**
- **Found during:** Task 2 (npx tsc --noEmit)
- **Issue:** Plan 21-01 добавил модели в schema.prisma, но не запустил `prisma generate` — клиент не имел `prisma.loan`, `prisma.loanPayment`, `prisma.lender`
- **Fix:** `npx prisma generate` — сгенерировал клиент с новыми типами
- **Files modified:** node_modules/@prisma/client (generated)
- **Result:** tsc прошёл с 0 ошибками

## Known Stubs

None — этот план создаёт только server-side функции (pure lib + actions), без UI компонентов. Данные не отображаются — нет стабов для верификатора.

## Self-Check: PASSED

Files exist:
- lib/loan-math.ts: FOUND
- tests/loan-math.test.ts: FOUND
- app/actions/credits.ts: FOUND
- app/actions/lender.ts: FOUND

Commits:
- 4fc0828: feat(21-03): add pure loan-math.ts + vitest tests
- 8cf9d01: feat(21-03): add credits.ts + lender.ts server actions
