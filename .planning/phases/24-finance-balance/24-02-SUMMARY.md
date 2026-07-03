---
phase: 24-finance-balance
plan: 02
subsystem: lib
tags: [pure-function, tdd, vitest, finance, tax]

# Dependency graph
requires:
  - phase: 24-finance-balance
    provides: "ERP_SECTION.FINANCE, Prisma-модели FinanceTaxPeriodActual/FinanceManualAdjustment (24-01)"
provides:
  - "lib/balance-math.ts — pure-функции computeQuarterAccrual, computeTaxLiability, computeCapital, computeDelta"
  - "tests/balance-math.test.ts — 12 golden-тестов, покрывающих D-16/D-06/D-09 и фикс дефекта B3"
affects: [24-05, 24-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure math module без Prisma/Next импортов (паттерн lib/loan-math.ts, lib/pricing-math.ts) — переиспользуется на сервере (RSC-агрегатор 24-05) и клиенте (realtime-пересчёт)"
    - "B3 fix: вычитание уплаченных налогов из накопленного начисления делается ЕДИНОЖДЫ, глобально (computeTaxLiability), НЕ внутри пер-квартальной ветки факт/расчёт"

key-files:
  created:
    - lib/balance-math.ts
    - tests/balance-math.test.ts

key-decisions:
  - "computeQuarterAccrual считает ТОЛЬКО начисление за квартал (без вычитания платежей) — разделение начисления и оплаты предотвращает потерю платежей, датированных внутри факт-квартала (B3)"
  - "computeDelta.pct делится на |compare| (модуль), а не на compare — чтобы знак pct совпадал со знаком реального изменения при отрицательном compare"

requirements-completed: [FIN-BAL-05]

# Metrics
duration: ~8min
completed: 2026-07-03
---

# Phase 24 Plan 02: Balance Pure Math (D-16, D-06, D-09) Summary

**Pure-модуль `lib/balance-math.ts` с 4 функциями (начисление налога за квартал, налоговое обязательство, капитал, дельта дат) — TDD RED→GREEN, фикс дефекта B3 (платежи внутри факт-квартала больше не теряются)**

## Performance

- **Duration:** ~8 min
- **Tasks:** 2/2 completed (TDD: RED test, GREEN implementation)
- **Files created:** 2

## Accomplishments
- `tests/balance-math.test.ts` — 12 golden-тестов (2 computeQuarterAccrual, 4 computeTaxLiability включая B3-кейс, 2 computeCapital, 4 computeDelta), изначально RED (`Cannot find package '@/lib/balance-math'`)
- `lib/balance-math.ts` — реализация всех 4 функций ровно по формулам из PLAN interfaces, pure (без импортов Prisma/Next)
- Все 12 тестов GREEN, `npx tsc --noEmit` чистый (0 ошибок)
- Дефект B3 закрыт: `computeTaxLiability({accruedTotal, taxesPaidTotal})` вычитает уплаченные налоги ЕДИНОЖДЫ, глобально — платёж, датированный внутри уже закрытого факт-квартала, больше не «теряется» и не завышает обязательство

## Task Commits

1. **Task 1 (RED): golden-тесты balance-math** — `09510fa` (test)
2. **Task 2 (GREEN): реализация lib/balance-math.ts** — `97b97f4` (feat)

## Files Created
- `tests/balance-math.test.ts` — 12 `it(...)` кейсов, импорт `from "@/lib/balance-math"`
- `lib/balance-math.ts` — `round2` (локальный helper) + `computeQuarterAccrual`, `TaxLiabilityInputs`, `computeTaxLiability`, `computeCapital`, `Delta`, `computeDelta`

## Decisions Made
- Разнесение начисления (`computeQuarterAccrual`, per-квартал) и вычитания уплаченного (`computeTaxLiability`, глобально по всему налоговому окну) — прямое следствие ревизии дефекта B3 из инструкций запуска; зафиксировано в JSDoc обеих функций, чтобы не регрессировало в будущих правках.
- `computeDelta` берёт `Math.abs(compare)` в знаменателе pct — иначе при `current=-50, compare=-100` (улучшение — убыток сократился) знак pct инвертировался бы относительно интуитивного восприятия.

## Deviations from Plan
None — план выполнен точно как написано, включая формулы из `<interfaces>` и ревизию B3 из стартовых инструкций (полностью согласована с текстом `<behavior>` плана, отдельного расхождения не потребовалось).

## Issues Encountered
None.

## User Setup Required
None.

## Next Phase Readiness
- `lib/balance-math.ts` готов к использованию в `lib/balance-data.ts` (RSC-агрегатор баланса, Plan 24-05) и в клиентском realtime-пересчёте (Plan 24-07, модалка/таблица баланса)
- Golden-тесты фиксируют контракт формул — регрессия B3 будет немедленно обнаружена при будущих правках `computeTaxLiability`

---
*Phase: 24-finance-balance*
*Completed: 2026-07-03*

## Self-Check: PASSED

Both created files verified present on disk (lib/balance-math.ts, tests/balance-math.test.ts); both task commit hashes (09510fa, 97b97f4) verified in git log; `npx vitest run tests/balance-math.test.ts` → 12/12 passed; `npx tsc --noEmit` → 0 errors.
