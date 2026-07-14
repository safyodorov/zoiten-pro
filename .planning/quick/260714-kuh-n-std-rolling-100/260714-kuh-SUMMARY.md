---
phase: quick-260714-kuh
plan: 01
subsystem: finance
tags: [finance-weekly, pricing-math, wildberries, buyout-pct, rolling-30d]

# Dependency graph
requires:
  - phase: quick-260710-hkj
    provides: "lib/finance-weekly/data.ts (W2d — loadWeeklyFinReportInputs, N_std блок)"
  - phase: phase-19-advert
    provides: "lib/wb-advert-spend-data.ts — loadBuyoutPctRolling30dMap (канонический rolling-30d резолвер выкупа, общий с /prices/wb и /ads/wb)"
provides:
  - "N_std (std-логистика сценария «Оферта») в /finance/weekly использует реальный rolling-30d weighted % выкупа per nmId вместо хардкода 100%"
affects: [finance-weekly-reconciliation, prices-wb, ads-wb]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Переиспользование канонического BuyoutResolver (loadBuyoutPctRolling30dMap) в новом потребителе через тот же Promise.all-паттерн параллельной загрузки"

key-files:
  created: []
  modified:
    - lib/finance-weekly/data.ts

key-decisions:
  - "buyoutPct для N_std = buyoutResolver.resolve(nmId, weekEndISO) с защитным хвостом ?? card?.buyoutPercent ?? 100 (resolve() тотальна, хвост на случай будущего изменения контракта)"
  - "Окно резолвера [weekEnd−30d, weekEndExclusive) — mirror /prices/wb (from сдвинут на −30д, т.к. резолвер эмитит per-nmId строки только для date >= from)"
  - "lib/wb-advert-spend-data.ts не изменён — общий модуль с /prices/wb и /ads/wb, менять нельзя"

requirements-completed: [QUICK-260714-KUH]

duration: 5min
completed: 2026-07-14
---

# Phase quick-260714-kuh: N_std rolling-30d выкуп Summary

**Std-логистика сценария «Оферта» (N_std) в `/finance/weekly` теперь считается с реальным rolling-30d weighted % выкупа per nmId (`loadBuyoutPctRolling30dMap`) вместо хардкода 100%, восстанавливая невыкупную надбавку Л_эфф для одежды.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-07-14T12:13:00Z (примерно, копирование плана в worktree)
- **Completed:** 2026-07-14T12:17:00Z
- **Tasks:** 2 (2 completed)
- **Files modified:** 1 (`lib/finance-weekly/data.ts`)

## Accomplishments
- `lib/finance-weekly/data.ts` грузит `loadBuyoutPctRolling30dMap` в существующем `Promise.all` (окно `[weekEnd−30d, weekEndExclusive)`, `nmIdsFilter=linkedNmIds`)
- `pricingInputs.buyoutPct` (N_std, `calculatePricingStandard`) = `buyoutResolver.resolve(nmId, weekEndISO)` вместо хардкода 100% — восстанавливает невыкупную надбавку `(1−ПВ)×Л_обратно` для товаров с низким выкупом (одежда 15-35%)
- Комментарии header-блока и inline N_std актуализированы под quick 260714-kuh
- `pricing-math.ts`, `engine.ts`, `wb-advert-spend-data.ts` не тронуты (diff-guard подтверждён — только `data.ts` в диффе задачи)

## Task Commits

Each task was committed atomically:

1. **Task 1: N_std buyoutPct = реальный rolling-30d выкуп per nmId (data.ts)** - `36bfdd1` (fix)
2. **Task 2: Регрессионный прогон существующих тестов (гейт правок finance-weekly)** - verification-only, без code diff (см. `deferred-items.md` для найденных вне-scope падений)

**Plan metadata:** (создаётся этим же execution — commit после SUMMARY.md)

## Files Created/Modified
- `lib/finance-weekly/data.ts` - импорт `loadBuyoutPctRolling30dMap`, добавлен резолвер в Promise.all, `pricingInputs.buyoutPct` использует реальный rolling-30d выкуп, актуализированы комментарии (header + inline N_std)

## Decisions Made
- Защитный хвост `?? card?.buyoutPercent ?? 100` оставлен, хотя `resolve()` — тотальная функция (всегда возвращает число): страхует от будущего изменения контракта резолвера, ничего не стоит по коду
- Резолвер вызывается ОДИН РАЗ на весь loader (не per-article) через существующий `Promise.all`, дешевле чем per-nmId запрос в цикле сборки articles
- Тестами `data.ts` не покрывается (Prisma-зависимый loader, паттерн проекта) — фолбэк-цепочка тривиальна над уже протестированным `loadBuyoutPctRolling30dMap`; проверка через `tsc` + существующий regression suite достаточна (план явно указал не раздувать тестами)

## Deviations from Plan

None - plan executed exactly as written (аддитивный дифф без отклонений от 4 пунктов Task 1).

## Issues Encountered

При регрессионном прогоне `npm run test` обнаружены 44 падающих теста в 12 файлах
(`appeal-actions`, `customer-actions`, `customer-sync-chat`, `merge-customers`,
`messenger-ticket`, `response-templates`, `support-sync-chats`,
`support-sync-returns`, `template-picker`, `wb-cooldown`, `wb-sync-route`,
`wb-token-validate`). Ни один из этих файлов не связан с
`lib/finance-weekly/data.ts` / `loadBuyoutPctRolling30dMap`. Подтверждено вне
scope: временный `git checkout HEAD~1 -- lib/finance-weekly/data.ts` (откат
файла к состоянию ДО правки) + повторный прогон 3 репрезентативных файлов
(`appeal-actions`, `wb-cooldown`, `wb-sync-route`) — те же 17 тестов падают
идентично. Значит регрессия предсуществующая, не вызвана этим planом.
Задокументировано в `deferred-items.md` (не исправлялось, согласно scope
boundary в execute-plan.md). Целевой regression-гейт плана — зелёный:
`npm run test -- finance-weekly pricing-math` → 10 test files, 141 tests passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `/finance/weekly` готов к пост-деплой дампу недели 06.07 для проверки: std-логистика
  одежды должна вырасти с ~127 тыс. до порядка ~900 тыс. (сопоставимо с экономистом
  ~900 599), бытовая — остаться в пределах ~460-530 тыс. (выполняет оркестратор, не входит
  в этот план)
- Отдельная задача рекомендована для разбора 44 пред-существующих тестовых регрессий
  в support/customer/template/wb-sync-route/wb-cooldown/wb-token-validate suites
  (см. `deferred-items.md`) — не блокирует эту задачу

---
*Phase: quick-260714-kuh*
*Completed: 2026-07-14*

## Self-Check: PASSED

- FOUND: lib/finance-weekly/data.ts
- FOUND: .planning/quick/260714-kuh-n-std-rolling-100/deferred-items.md
- FOUND: .planning/quick/260714-kuh-n-std-rolling-100/260714-kuh-SUMMARY.md
- FOUND commit: 36bfdd1 (Task 1 — fix(quick-260714-kuh))
