---
phase: quick-260710-jgs
plan: 01
subsystem: finance
tags: [finance-weekly, wb-finance-api, sales-reports, realization, cron, prisma, vitest]

# Dependency graph
requires:
  - phase: quick-260710-evz (W2a)
    provides: /finance/weekly движок + data.ts загрузчик + WeeklyFinReportControls
  - phase: quick-260710-hkj (W2d)
    provides: двухбазисная сборка candidates (appliances=заказы, clothing=выкупы)
  - phase: 24-finance-balance
    provides: WB_FINANCE_TOKEN + lib/wb-finance-api.ts (образец 401/402/429) + bucket 'finance'
provides:
  - WbRealizationWeekly — недельный агрегат отчёта реализации per nmId (nmId=0 = account-level)
  - lib/wb-realization-api.ts — клиент sales-reports list/detailed + pure-классификатор 8 бакетов
  - lib/wb-realization-sync.ts — syncRealizationWeek (clean-replace недели + сверка с list-агрегатами)
  - POST /api/wb-realization-sync (FINANCE MANAGE) + кнопка «Реализация WB» на /finance/weekly
  - Крон wb-realization-weekly (вторник 05:50 МСК, прошлая ISO-неделя, ?week backfill)
  - lib/finance-weekly/realization.ts — pure split/distribute/buildPools/reviewWriteoffFor/logisticsIuPerUnit
  - ИУ-факт в /finance/weekly — reviewWriteoffTotal, logisticsIuPerUnit, пулы storage/acceptance
affects: [finance-weekly, finance-balance, cashflow, W3-bank-classifier]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "BigInt guard: стрингификация reportId regex'ом в JSON-тексте ДО JSON.parse"
    - "Rate-limit 1 req/мин: cooldown bucket per endpoint-семейство + ровно 1 retry по Retry-After"
    - "Weekly cron через ежедневный dispatcher + weekday-guard внутри endpoint'а"
    - "Факт-пулы замещают manual с manual-fallback + бейдж источника в UI"

key-files:
  created:
    - prisma/migrations/20260710_wb_realization_weekly/migration.sql
    - lib/wb-realization-api.ts
    - lib/wb-realization-sync.ts
    - app/api/wb-realization-sync/route.ts
    - app/api/cron/wb-realization-weekly/route.ts
    - lib/finance-weekly/realization.ts
    - tests/wb-realization-classify.test.ts
    - tests/finance-weekly-realization.test.ts
  modified:
    - prisma/schema.prisma
    - lib/wb-cooldown.ts
    - lib/wb-finance-api.ts (только шапка-комментарий)
    - app/api/cron/dispatch/route.ts
    - components/finance/WeeklyFinReportControls.tsx
    - lib/finance-weekly/data.ts
    - lib/finance-weekly/types.ts (только комментарии)
    - app/(dashboard)/finance/weekly/page.tsx

key-decisions:
  - "universeByNmId для пулов реализации — из ВСЕХ привязанных артикулов (productByNmId), не из candidates: storage/acceptance товаров без продаж недели (qty<=0) не выпадает"
  - "Бакеты непривязанных nmId присоединяются к account-level → пропорциональное распределение по базам вселенных (не теряются)"
  - "?week-backfill крона обходит Tuesday-guard (иначе восстановление возможно только по вторникам)"
  - "std-сценарий (calculatePricingStandard) остаётся моделью НАВСЕГДА — в отчёте реализации на ИУ нет std-логистики/хранения Оферты"
  - "promotionRub/forPayRub/deductionOtherRub хранятся, но в расчёт НЕ идут (продвижение уже покрыто /adv/v1/upd)"

# Metrics
duration: ~18min
completed: 2026-07-10
---

# Quick 260710-jgs: W1 — импорт отчёта реализации WB → ИУ-факт в /finance/weekly Summary

Клиент WB Finance API sales-reports (list/detailed, деньги-строки, BigInt guard, 1 req/мин) → недельный агрегат WbRealizationWeekly по 8 бакетам → ИУ-факт (отзывы, возвратная логистика, пулы хранения/приёмки) в /finance/weekly с manual-fallback и бейджем источника.

## Что сделано

### Task 1 — Модель + миграция + клиент + классификатор (6256b7c)
- `WbRealizationWeekly` (@@unique weekStart+nmId; nmId=0 = account-level строки без nm_id) + hand-written миграция `20260710_wb_realization_weekly` (применится через deploy.sh).
- `lib/wb-realization-api.ts`: `listSalesReports` (RFC3339 МСК body, BigInt guard reportId → string), `fetchSalesReportDetailed` (пагинация rrdId → HTTP 204, guard от зацикливания cursor'а, sleep 61s между страницами), `callFinanceReports` (cooldown bucket `finance-reports`, ровно 1 retry на 429 по Retry-After, 402 → подписка, 401 → scope/тип токена).
- Pure-хелперы: `parseMoney` (запятая-десятичная), `normalizeRealizationRow` (snake_case + camelCase), `classifyRealizationRow` (8 бакетов, бонус-дискриминаторы отзывы/продвижение ПЕРЕД операционными, unknown → deductionOther), `accumulateRealizationRows`.
- `lib/wb-cooldown.ts`: bucket `finance-reports` — изолирован от `finance` (balance), resolveBucketFromUrl различает по пути.
- `tests/wb-realization-classify.test.ts` — 17 тестов (8 бакетов + возврат с отрицательным forPay + unknown + parseMoney + normalize + accumulate).

### Task 2 — Sync-route + кнопка + крон (70b4173)
- `lib/wb-realization-sync.ts`: `syncRealizationWeek(weekStart)` — list → фильтр отчётов, пересекающих неделю (0 отчётов → понятная ошибка «ещё не сформирован WB») → detailed → classify → accumulate → clean-replace недели в `$transaction` (deleteMany + createMany, идемпотентно).
- Сверка Σ бакетов с list-агрегатами отчёта (deliveryServiceSum/paidStorageSum/paidAcceptanceSum/penaltySum/forPaySum/deductionSum) — `console.warn` при расхождении >1% (диагностика классификатора на первом реальном синке).
- `POST /api/wb-realization-sync`: FINANCE MANAGE, body `{week}` → нормализация к ISO-понедельнику, WbRateLimitError → 429 с секундами.
- `GET /api/cron/wb-realization-weekly`: x-cron-secret, Tuesday-guard MSK (в прочие дни `skipped: not-tuesday` БЕЗ lastRun), прошлая ISO-неделя, `?week=` backfill обходит guard, lastRun только при успехе.
- Dispatcher: `wbRealizationWeeklyCronTime` default 05:50 (после box-tariffs 05:20 / cards-refresh 05:30), fired-тег `realization:{status}`.
- Кнопка «Реализация WB» в ряду выбора недели (canManage, useTransition, loading toast «до 2-3 мин», router.refresh()).

### Task 3 — Wiring ИУ-факта + бейдж (0fd0602)
- `lib/finance-weekly/realization.ts` (pure, ноль Prisma/Next): `splitRealizationRows` (nmId=0 → accountLevel), `distributeByRevenue` (Σ долей = total, zero-base guard), `buildRealizationPools` (storage = Σ своих + account-доля; acceptance = acceptanceRub+penaltyRub аналогично), `reviewWriteoffFor`, `logisticsIuPerUnit` (qty=0 guard).
- `data.ts`: `wbRealizationWeekly.findMany` в Promise.all (БЕЗ фильтра nmId — нужны account-level и непривязанные); двухпроходная сборка (candidates → revenueByNmId → articles); при hasRealization: `reviewWriteoffTotal` = свои строки + account-доля по выручке, `logisticsIuPerUnit` = deliveryRub/qty; пулы storage/acceptance per universe замещают manualPools (fallback при hasRealization=false; delivery/overhead* остаются ручными).
- `hasRealization` в `WeeklyFinReportPageData` (false в обоих early-return'ах) → page.tsx → Controls.
- Бейдж «из реализации» / «вручную» (text-[10px]) у 4 пулов Приёмка/Хранение обеих групп; инпуты НЕ задизейблены (manual = редактируемый fallback).
- `tests/finance-weekly-realization.test.ts` — 10 тестов, включая fix-кейсы plan-checker'а.

## Deviations from Plan

### Plan-checker фиксы (предписаны оркестратором, применены)

**1. [WARNING, Task 3] universeByNmId из productByNmId, не из candidates**
- **Проблема:** товары без продаж на неделе (qty<=0) выпадали бы из пулов storage/acceptance.
- **Фикс:** universeByNmId строится из ВСЕХ привязанных WB-артикулов (`product.brand?.direction?.hasSizes`); бакеты nmId вне universeByNmId (непривязанные) присоединяются к account-level для пропорционального распределения. Behavior-кейсы в тестах: «nmId вне universeByNmId → в account-level, не теряется» + «товар без продаж, но с universe → пул своей вселенной».
- **Файлы:** lib/finance-weekly/realization.ts, lib/finance-weekly/data.ts, tests/finance-weekly-realization.test.ts. Коммит 0fd0602.

**2. [INFO, Task 2] Сверка Σ бакетов с list-агрегатами**
- `reconcileWithListAggregates` в lib/wb-realization-sync.ts — console.warn при относительном расхождении >1% по 6 парам. Коммит 70b4173.

### Собственные микро-решения (Rule 1/2 — корректность)

**3. [Rule 2] ?week-backfill обходит Tuesday-guard**
- План перечислял guard и override без явного порядка. Ручной backfill, заблокированный по дням недели, сделал бы восстановление упавшего крона возможным только по вторникам — override поставлен ПЕРЕД guard'ом. Коммит 70b4173.

**4. [Rule 1] Guard от зацикливания пагинации detailed**
- Если rrd_id последней строки не растёт (нет поля / не число) — break вместо бесконечного цикла с 61-сек паузами. Коммит 6256b7c.

## Операционная заметка (важно для оркестратора)

**Упавший вторничный крон НЕ ретраится автоматически для той недели.** lastRun пишется только при успехе, но следующий автозапуск — только в следующий вторник (Tuesday-guard). Восстановление: кнопка «Реализация WB» на /finance/weekly (выбрав неделю) или `GET /api/cron/wb-realization-weekly?week=YYYY-MM-DD` с x-cron-secret (обходит Tuesday-guard).

**Первый реальный синк — после деплоя** (deploy.sh применит миграцию): живые вызовы WB API из задач не делались. Требования к токену: WB_FINANCE_TOKEN должен быть Персональный/Сервисный (sales-reports недоступен на базовом), scope «Финансы». На первом синке проверить журнал на warn'ы `[wb-realization-sync] сверка` — сигнал недоучёта классификатора.

## Known Stubs

Нет. Fallback-нули (`reviewWriteoffTotal`/`logisticsIuPerUnit` = 0 и manual-пулы при hasRealization=false) — проектное поведение до первого синка, коммуницируется бейджем «вручную».

## Verification

- `npx prisma generate` — чисто; `npx tsc --noEmit` — чисто
- 7 тест-файлов (5 существующих finance-weekly/pricing + 2 новых) — 110 passed
- `git diff --exit-code lib/finance-weekly/engine.ts` — пусто (std-сценарий не тронут)
- grep key_links: `wb-realization-sync` в Controls ✓, `wbRealizationWeekly.findMany` в data.ts ✓, `wb-realization-weekly` в dispatch ✓, `finance-reports` в wb-cooldown/wb-realization-api ✓
- Ни одного реального вызова WB API; деплой не выполнялся (вне скоупа)

## Commits

| Task | Commit | Что |
| ---- | ------- | --- |
| 1 | 6256b7c | Модель + миграция + клиент sales-reports + классификатор + bucket finance-reports |
| 2 | 70b4173 | syncRealizationWeek + POST route + кнопка + крон + dispatcher |
| 3 | 0fd0602 | ИУ-факт в data.ts + realization.ts pure + бейдж источника |

## Self-Check: PASSED

Все 9 артефактов на диске, все 3 коммита в истории (6256b7c / 70b4173 / 0fd0602), push origin/main выполнен.
