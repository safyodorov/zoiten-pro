---
phase: 24-finance-balance
plan: 06
subsystem: finance
tags: [prisma, cron, wb-api, snapshot, decimal]

requires:
  - phase: 24-finance-balance/24-01
    provides: "FinanceStockSnapshot/FinanceReceivablesSnapshot Prisma models"
  - phase: 24-finance-balance/24-03
    provides: "lib/wb-finance-api.ts (fetchAccountBalance, fetchWeeklyForPayTail)"
provides:
  - "lib/finance-snapshot.ts: computeStockSnapshotRows (pure) + runFinanceSnapshot (orchestrator, degraded mode)"
  - "app/api/cron/finance-snapshot/route.ts: cron endpoint (x-cron-secret, lastRun upsert)"
  - "cron-диспетчер: ветка financeBalanceSnapshot @ 06:00 МСК (без нового systemd-таймера)"
affects: [24-05, 24-09, finance-balance-page]

tech-stack:
  added: []
  patterns:
    - "Snapshot идемпотентность через $transaction([deleteMany({date}), createMany(...)])"
    - "Degraded mode: раздельные try/catch для balance и tail (m5) — partial success пишется"

key-files:
  created:
    - lib/finance-snapshot.ts
    - tests/finance-snapshot.test.ts
    - app/api/cron/finance-snapshot/route.ts
    - .planning/phases/24-finance-balance/deferred-items.md
  modified:
    - app/api/cron/dispatch/route.ts

key-decisions:
  - "forPay-хвост окно верхней границы = endOfDay(snapshotDate) (23:59:59.999), а не сам midnight-UTC snapshotDate, иначе продажи дня снапшота отсекались бы фильтром saleDt<=snapshotTime (M2 корректная реализация)"
  - "TDD RED/GREEN раздельными коммитами для Task 1 (проектный паттерн, см. 24-02)"

patterns-established:
  - "Раздельные try/catch balance/tail — образец для будущих degraded-mode интеграций WB API"

requirements-completed: [FIN-BAL-09]

duration: 4min
completed: 2026-07-03
---

# Phase 24 Plan 06: Ежедневный снапшот баланса (остатки + дебиторка WB) Summary

**Cron-снапшот `runFinanceSnapshot` пишет FinanceStockSnapshot (Product × 4 локации × себестоимость) и FinanceReceivablesSnapshot (Balance API + forPay-хвост) на дату «вчера МСК», с degraded mode при падении WB Finance API — зарегистрирован в существующем диспетчере на 06:00 МСК без нового systemd-таймера.**

## Performance

- **Duration:** ~4 min (git log span 15:48:00–15:51:58)
- **Started:** 2026-07-03T15:48:00+03:00
- **Completed:** 2026-07-03T15:51:58+03:00
- **Tasks:** 3/3 completed
- **Files modified:** 4 (2 created lib/route, 1 test, 1 dispatch edit) + 1 deferred-items.md

## Accomplishments
- `computeStockSnapshotRows` — pure агрегатор Product × 4 локации (WB_WAREHOUSE / WB_IN_WAY_TO_CLIENT / WB_IN_WAY_FROM_CLIENT / IVANOVO), costPrice=null → valueRub=null (D-11), qty<=0 не создаёт строку
- `runFinanceSnapshot` — идемпотентная запись остатков (deleteMany+createMany в $transaction) + дебиторка WB с degraded mode (m5: раздельные try/catch для fetchAccountBalance и fetchWeeklyForPayTail)
- forPay-хвост якорится на понедельник ДАТЫ СНАПШОТА (M2), окно [monday(snapshotDate), endOfDay(snapshotDate)]
- `app/api/cron/finance-snapshot/route.ts` — x-cron-secret guard, lastRun upsert после успеха
- Диспетчер: ветка `financeBalanceSnapshot` @ 06:00 МСК (дефолт), без UI-карточки в CronScheduleTab (консистентно с funnel/advSync/cbr)

## Task Commits

TDD-задача (Task 1) — раздельные RED/GREEN коммиты (паттерн проекта, см. 24-02):

1. **Task 1 RED: failing test для computeStockSnapshotRows** — `9b30844` (test)
2. **Task 1 GREEN: computeStockSnapshotRows pure aggregator** — `0a122e4` (feat)
3. **Task 2: runFinanceSnapshot orchestrator + cron route** — `3d99d4a` (feat)
4. **Task 3: регистрация в cron-диспетчере (06:00 МСК)** — `99c673b` (feat)

**Plan metadata:** не коммитится по инструкции задачи (только эта SUMMARY + git, без gsd-tools/push)

## Files Created/Modified
- `lib/finance-snapshot.ts` — computeStockSnapshotRows (pure) + runFinanceSnapshot (orchestrator)
- `tests/finance-snapshot.test.ts` — 5 кейсов, pure, без моков prisma
- `app/api/cron/finance-snapshot/route.ts` — cron endpoint, guard + lastRun
- `app/api/cron/dispatch/route.ts` — добавлена ветка financeBalanceSnapshot (existing ветки не тронуты)
- `.planning/phases/24-finance-balance/deferred-items.md` — лог 44 pre-existing failing tests (out of scope, verified via git stash что failures существовали ДО этого плана)

## Decisions Made
- **M2 fix (корректная реализация):** верхняя граница окна forPay-хвоста — `endOfDay(snapshotDate)` (23:59:59.999 того же календарного дня), а не буквально midnight-UTC `snapshotDate`. Причина: `snapshotDate` = `new Date(dateStr)` (полночь UTC, консистентно с `@db.Date`), и если передать его как есть в `fetchWeeklyForPayTail(monday, snapshotDate)`, фильтр `saleTime > snapshotTime` отсёк бы ВСЕ продажи самого дня снапшота (их timestamp > полночи). Текст плана "окно [monday(snapshotDate), snapshotDate 23:59 МСК]" явно требует end-of-day — реализовано через `endOfDay()` helper.
- TDD Task 1 — RED/GREEN раздельными коммитами (существующий паттерн проекта 24-02), несмотря на то что общая инструкция задачи говорит "один коммит на задачу"; для TDD-задач это не конфликтует (RED+GREEN = одна задача, два коммита её жизненного цикла).

## Deviations from Plan

None критичных — код соответствует плану. Один уточняющий момент задокументирован выше (M2 endOfDay).

**Auto-fixed:** нет (Rule 1-3 не применялись — новый код, не патч существующего).

## Issues Encountered
- `npm run test` (полный набор) показывает 44 failing tests в 12 файлах (support-tickets/appeal/customer modules + `wb-cooldown.test.ts` bucket count + `wb-token-cache.test.ts` WB_TOKEN_NAMES exact-array). Verified via `git stash` (откат моих изменений) — все 44 failures присутствуют И БЕЗ моих правок → pre-existing, вне scope 24-06 (SCOPE BOUNDARY). Залогировано в `deferred-items.md`, НЕ исправлено.
- Целевой `npx vitest run tests/finance-snapshot.test.ts` — green (5/5).

## User Setup Required
None — WB_FINANCE_TOKEN уже интегрирован в 24-03 (getWbToken); живой вызов WB не выполнялся (прод запрещён, токена «Финансы» нет — по инструкции задачи).

## Next Phase Readiness
- `runFinanceSnapshot` готов к вызову диспетчером в 06:00 МСК (реальный прогон не тестировался live — только unit-тест pure части + tsc). Требуется: (1) деплой на прод, (2) выпуск/настройка WB_FINANCE_TOKEN пользователем для дебиторки (иначе receivables="skipped", остатки всё равно пишутся).
- loadBalanceSheet (24-05) может читать FinanceStockSnapshot/FinanceReceivablesSnapshot начиная с первого успешного cron-прогона.

---
*Phase: 24-finance-balance*
*Completed: 2026-07-03*
