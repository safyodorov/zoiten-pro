---
phase: 26-roll-forward
plan: "03"
subsystem: sales-plan/virtual-purchases
tags: [sp-17, roll-forward, cron, virtual-purchases, invariant]
dependency_graph:
  requires: ["26-01"]
  provides: ["roll-forward-accepted", "sp-rollforward-cron"]
  affects: ["sales-plan/purchases", "finance/cashflow"]
tech_stack:
  added: []
  patterns:
    - "rollForwardAcceptedArrivals — чистый pure хелпер сдвига просроченных авто-ACCEPTED"
    - "виtest pool=vmForks (фикс runner-бага на Windows+Node 24)"
key_files:
  created:
    - lib/sales-plan/virtual-purchases.ts (rollForwardAcceptedArrivals + RollForwardResult)
    - tests/sales-plan-rollforward.test.ts (4 теста инварианта)
    - app/api/cron/sales-plan-rollforward/route.ts (GET-роут крона x-cron-secret)
  modified:
    - app/actions/sales-plan.ts (импорт + roll-forward в regenerate + export internal + UPDATE в транзакции)
    - app/api/cron/dispatch/route.ts (vpRollforwardCronTime/LastRun + shouldFireCron блок 04:40)
    - vitest.config.ts (pool=vmForks)
decisions:
  - "rollForwardAcceptedArrivals сдвигает только source=auto && status=ACCEPTED && orderDate<today; manual не трогается (D-4)"
  - "Крон вызывает regenerateVirtualPurchasesInternal напрямую (export) — без RBAC-гейта requireSection, вместо public action (T-26-10: эквивалентно системной операции)"
  - "vitest pool=vmForks: дефолтный 'threads' pool падает на Windows+Node.js 24 с 'Cannot read properties of undefined (reading config)'; vmForks изолирует каждый тест-файл в отдельный fork"
  - "VP UPDATE внутри той же транзакции что deleteMany(SUGGESTED+auto) + createMany — атомарность сдвига и регенерации"
metrics:
  duration_minutes: 25
  completed_date: "2026-07-05"
  tasks_completed: 3
  tasks_total: 3
  files_created: 3
  files_modified: 4
---

# Phase 26 Plan 03: SP-17 — Динамический roll-forward виртуальных отгрузок + ежедневный крон

**One-liner:** Инвариант «не прошлым числом» для авто-ACCEPTED VP через чистый хелпер rollForwardAcceptedArrivals + ежедневный крон sales-plan-rollforward в dispatcher (04:40 МСК).

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Хелпер rollForwardAcceptedArrivals + тест инварианта | 04de7d2 | lib/sales-plan/virtual-purchases.ts, tests/sales-plan-rollforward.test.ts, vitest.config.ts |
| 2 | Сдвиг авто-ACCEPTED в regenerateVirtualPurchasesInternal | 2871d89 | app/actions/sales-plan.ts |
| 3 | Крон sales-plan-rollforward + wiring в dispatcher | fa84177 | app/api/cron/sales-plan-rollforward/route.ts, app/api/cron/dispatch/route.ts |

## What Was Built

**SP-17: Динамический roll-forward виртуальных отгрузок**

Проблема (D-4): авто-ACCEPTED виртуальные закупки с `orderDate < today` «застывали» на прошлых датах — инвариант «не прошлым числом» держался только для авто-SUGGESTED в `suggestVirtualPurchases`. При регенерации ACCEPTED-записи подавались в suggester на исходную `expectedArrivalDate`, хотя `orderDate` мог быть недельной давности.

**Решение:**

1. **`rollForwardAcceptedArrivals`** (lib/sales-plan/virtual-purchases.ts): чистая pure-функция. `source=auto && status=ACCEPTED && orderDate<today` → `orderDate=today, expectedArrivalDate=today+leadTimeDays`. `source=manual` не трогается (пользователь управляет датой вручную). Возвращает `RollForwardResult[]` с флагом `shifted`.

2. **`regenerateVirtualPurchasesInternal`** (app/actions/sales-plan.ts): после построения `minLeadTimeByProduct` применяет roll-forward per товар, собирает `allShiftedVps`, обновляет `existingByProduct` (suggester видит сдвинутые `expectedArrivalDate`). В транзакции: UPDATE сдвинутых авто-ACCEPTED + deleteMany(SUGGESTED+auto) + createMany(новые). Атомарность обеспечена. Функция экспортирована для прямого вызова из крона.

3. **Ежедневный крон** `app/api/cron/sales-plan-rollforward/route.ts`: GET, `x-cron-secret`, вызывает `regenerateVirtualPurchasesInternal()`, записывает `vpRollforwardLastRun`. Wired в dispatcher: `vpRollforwardCronTime` (default 04:40 МСК — после wb-sales-daily 04:30), `shouldFireCron` guard, dynamic import.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Все 86 тестов vitest падали на Windows+Node.js 24**
- **Found during:** Task 1 (RED-фаза)
- **Issue:** Дефолтный `pool: "threads"` в vitest 4.1.4 вызывал `TypeError: Cannot read properties of undefined (reading 'config')` при импорте в тест-файлах — runner-контекст не инициализировался. Баг затрагивал ВСЕ существующие тесты (86 файлов).
- **Fix:** `vitest.config.ts`: `pool: "vmForks"` — изолирует каждый тест-файл в fork с VM-контекстом, стабильно на win32+Node.js 24.
- **Files modified:** vitest.config.ts
- **Commit:** 04de7d2

**2. [Rule 2 - Critical] Экспорт `regenerateVirtualPurchasesInternal` для крона**
- **Found during:** Task 3 (план указывал экспортировать)
- **Issue:** Функция была `async function` (не экспортирована) — крон не мог вызвать её напрямую без RBAC-гейта. Предпочтительный вариант из плана: экспортировать internal, не публичный action.
- **Fix:** `export async function regenerateVirtualPurchasesInternal(...)` + крон импортирует напрямую.
- **Files modified:** app/actions/sales-plan.ts
- **Commit:** 2871d89

## Verification Results

```
npx vitest run tests/sales-plan-rollforward.test.ts tests/sales-plan-virtual.test.ts tests/sales-plan-engine.test.ts tests/sales-plan-iu.test.ts
Test Files  4 passed (4)
Tests  34 passed (34)

npx tsc --noEmit → no errors
npm run build → success
```

## Known Stubs

None — план не вводит заглушек.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: privilege-bypass | app/api/cron/sales-plan-rollforward/route.ts | Прямой вызов regenerateVirtualPurchasesInternal минует requireSection("SALES","MANAGE") — это намеренно (T-26-10, accept: x-cron-secret за nginx+UFW, системная операция) |

## Self-Check: PASSED

- [x] `lib/sales-plan/virtual-purchases.ts` — rollForwardAcceptedArrivals экспортирована
- [x] `tests/sales-plan-rollforward.test.ts` — создан, 4 теста GREEN
- [x] `app/actions/sales-plan.ts` — rollForwardAcceptedArrivals импортирован и применён, export internal
- [x] `app/api/cron/sales-plan-rollforward/route.ts` — создан, x-cron-secret guard
- [x] `app/api/cron/dispatch/route.ts` — vpRollforwardCronTime/LastRun + shouldFireCron 04:40
- [x] Commits: 04de7d2, 2871d89, fa84177 — все существуют
- [x] `npx vitest run` — 34 тестов GREEN
- [x] `npm run build` — success
- [x] STATE.md / ROADMAP.md — не тронуты
