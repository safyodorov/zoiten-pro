---
phase: 28-cashflow
plan: "01"
subsystem: finance
tags: [cashflow, pure-engine, prisma, typescript, vitest, appsetting]

requires:
  - phase: 25-sales-plan-v2
    provides: getPlannedRevenueSeries, getPlannedVirtualPayments (pdds-feed.ts контракт ПДДС)
  - phase: 24-finance-balance
    provides: getBankBalanceAsOf, getRateForDate (balance-data.ts), computeQuarterAccrual (balance-math.ts)
  - phase: 20-procurement
    provides: PurchasePayment (PLANNED status, amountRub field), amountRub-приоритет паттерн

provides:
  - lib/finance-cashflow/types.ts — CashflowInputs/Day/Bucket/Result интерфейсы + PayoutModelType (чистые, сериализуемые)
  - lib/finance-cashflow/engine.ts — computeCashflow() pure-функция (дневная симуляция, бакеты, gap-детекция, сменная PayoutFn)
  - lib/finance-cashflow/data.ts — loadCashflowInputs() DI-загрузчик (8 групп данных из БД)
  - prisma/migrations/20260705_phase28_cashflow_seed/migration.sql — AppSetting-сид 4 ключа finance.cashflow.*
  - tests/finance-cashflow-engine.test.ts — 5 golden тестов (conservation, WB timing, gap, anti-double-count, custom payout)

affects: [28-cashflow-02, 28-cashflow-03, finance/cashflow RSC page]

tech-stack:
  added: []
  patterns:
    - "lib/finance-cashflow/ — DI-паттерн: engine pure, data принимает db: PrismaClient"
    - "PayoutFn — сменная функция выплат (D-1 задел v2 per-product, инъектируется 3-м аргументом computeCashflow)"
    - "wbCashDay — формула выплаты WB скопирована из lib/finance-model/engine.ts (не импортируется)"
    - "amountRub-приоритет в PurchasePayment (паттерн balance-data B1 / quick-260704-go2)"
    - "actualBalanceSeries: MSK-today cap — согласовано с finance/balance page.tsx"

key-files:
  created:
    - lib/finance-cashflow/types.ts
    - lib/finance-cashflow/engine.ts
    - lib/finance-cashflow/data.ts
    - tests/finance-cashflow-engine.test.ts
    - prisma/migrations/20260705_phase28_cashflow_seed/migration.sql
  modified: []

key-decisions:
  - "PayoutFn: опциональный 3-й параметр computeCashflow — v1 undefined → coefficient (rub × wbPayoutPct/100); v2 per-product из pricing-math подключается без переписывания движка"
  - "Квартальные налоги: hardcoded Q3/Q4 2026 (дата уплаты = конец квартала); v1 упрощение, Q1/Q2 добавляются в v2 при расширении горизонта"
  - "actualBalanceSeries: накопительный ряд из BankTransaction (RUR) + CashEntry от startingBalance — отражает фактическую кассу+банк, но не all-in аналитика (D-4 пометка)"
  - "Test 5 (сменная payout-модель): проверяет соотношение custom/default (0.9/0.55) в пределах горизонта — не все buyoutsRub попадают в 2-недельное окно"

requirements-completed: []

duration: 5min
completed: "2026-07-05"
---

# Phase 28 Plan 01: ПДДС — движок и загрузчик данных

**Pure computeCashflow() с дневной симуляцией WB-тайминга + gap-детекцией + сменной PayoutFn, DI-загрузчик 8 групп данных (bank/cash/revenue/VP/procurement/loan/tax/actual), AppSetting-сид 4 ключа finance.cashflow.***

## Performance

- **Duration:** ~5 мин (324 сек)
- **Started:** 2026-07-05T19:36:38Z
- **Completed:** 2026-07-05T19:42:02Z
- **Tasks:** 3
- **Files modified:** 5 (создано 5, изменено 0)

## Accomplishments

- `lib/finance-cashflow/types.ts` — 5 публичных экспортов (PayoutModelType + CashflowInputs/Day/Bucket/Result), ноль запрещённых импортов
- `lib/finance-cashflow/engine.ts` — pure computeCashflow: wbCashDay-тайминг (Пн+лаг), gap-детекция, бакетирование через date-buckets, сменная PayoutFn (D-1)
- `lib/finance-cashflow/data.ts` — loadCashflowInputs: 8 групп данных, amountRub-приоритет, RUR (не RUB), MSK-today cap на actualBalanceSeries
- 5 тестов green, sales-plan golden не тронут (iuTotalForRange проверен)
- AppSetting-сид 4 ключа finance.cashflow.* с ON CONFLICT DO NOTHING (без createdAt)

## Task Commits

1. **Task 1: types.ts + сид-миграция AppSetting** — `5d26dab` (feat)
2. **Task 2: engine.ts (pure computeCashflow) + golden-тесты** — `e1c2e87` (feat)
3. **Task 3: data.ts (DI-загрузчик loadCashflowInputs)** — `5be3265` (feat)

## Files Created/Modified

- `lib/finance-cashflow/types.ts` — Сериализуемые интерфейсы движка ПДДС (pure)
- `lib/finance-cashflow/engine.ts` — Pure computeCashflow: дневная симуляция + бакеты + gap + сменная PayoutFn
- `lib/finance-cashflow/data.ts` — DI-загрузчик loadCashflowInputs (8 групп данных из БД)
- `tests/finance-cashflow-engine.test.ts` — 5 golden тестов (все green)
- `prisma/migrations/20260705_phase28_cashflow_seed/migration.sql` — AppSetting-сид finance.cashflow.*

## Decisions Made

- **PayoutFn как опциональный 3-й аргумент computeCashflow**: v1 пропускает (undefined → coefficient), v2 per-product из pricing-math подключается без смены сигнатуры
- **wbCashDay скопирована из lib/finance-model/engine.ts** (не импортируется) — legacy-движок имеет hardcoded зависимости, копирование чище
- **Test 5 проверяет соотношение custom/default** (а не абсолютную сумму) — пейауты за горизонт 2 недели частично выходят за рамки, соотношение инвариантно

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript: `sum` is possibly `null` в groupBy + `bankRurTotal` reduce**
- **Found during:** Task 3 (data.ts TypeScript typecheck)
- **Issue:** `cashEntry.groupBy._sum.amount` имеет тип `Decimal | null`, `reduce` не имел явного generic
- **Fix:** Промежуточная переменная `amt = Number(g._sum.amount ?? 0)` + `reduce<number>(..., 0)`
- **Files modified:** lib/finance-cashflow/data.ts
- **Verification:** `npx tsc --noEmit` — 0 ошибок про finance-cashflow
- **Committed in:** `5be3265` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — TypeScript type bug)
**Impact on plan:** Минимальный — однострочные исправления типов, логика не менялась.

## Issues Encountered

- Test 5 (сменная payout-модель) первоначально сравнивал `totalWbPayoutCustom` с `totalBuyoutsRub × 0.9`, что некорректно — не все пейауты за 14-дневный horizonTo попадают внутрь горизонта. Исправлено на сравнение соотношений custom/default (ratio = 0.9/0.55).

## Next Phase Readiness

- `lib/finance-cashflow/{types,engine,data}.ts` готовы для потребления в 28-02 (RSC страница /finance/cashflow)
- `lib/finance-cashflow/engine.ts` pure — можно вызывать из RSC без Prisma, из клиента без ошибок гидратации
- AppSetting-сид применится через deploy.sh (`prisma migrate deploy`)
- sales-plan golden не задет (20 тестов green)

## Self-Check

- [x] `lib/finance-cashflow/types.ts` — существует
- [x] `lib/finance-cashflow/engine.ts` — существует
- [x] `lib/finance-cashflow/data.ts` — существует
- [x] `tests/finance-cashflow-engine.test.ts` — существует, 5 тестов green
- [x] `prisma/migrations/20260705_phase28_cashflow_seed/migration.sql` — существует
- [x] Коммиты 5d26dab, e1c2e87, 5be3265 — в git log

---
*Phase: 28-cashflow*
*Completed: 2026-07-05*
