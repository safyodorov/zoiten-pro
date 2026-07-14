---
phase: quick-260714-gt7
plan: 01
subsystem: finance
tags: [finance-weekly, wb-sales, clothing, net-vs-gross, vitest]

requires:
  - phase: quick-260710-hkj
    provides: "Dual-universe базис /finance/weekly (W2d): clothing по WbSalesDaily, appliances по WbCardFunnelDaily"
provides:
  - "netClothingSales pure-хелпер (lib/finance-weekly/clothing-net.ts) — нетто qty/rub одежды за неделю"
  - "data.ts агрегирует базис одежды по нетто (выкупы − возвраты) вместо gross"
  - "UI-бейджи /finance/weekly отражают нетто-базис одежды"
affects: [finance-weekly, sales-plan]

tech-stack:
  added: []
  patterns:
    - "Pure netClothingSales(agg) в отдельном файле без Prisma/React импортов — тестируется изолированно, вызывается из data.ts"

key-files:
  created:
    - lib/finance-weekly/clothing-net.ts
    - tests/finance-weekly-clothing-net.test.ts
  modified:
    - lib/finance-weekly/data.ts
    - components/finance/WeeklyFinReportTable.tsx

key-decisions:
  - "Базис одежды переключён с gross (W2d Фикс 1) на нетто (выкупы − возвраты) — прежнее решение было принято на неделе без возвратов, опровергнуто сверкой 06.07-12.07 (848714305: 12−4=8=Excel)"
  - "returnsRub складывается (не вычитается) — конвенция БД: returnsRub уже отрицательный; returnsCount положительный — вычитается"
  - "Кламп Math.max(0, qty) применяется к недельному агрегату per nmId, rub не клампится — guard qty<=0 в data.ts отсекает деление на 0 до вычисления K=rub/qty"

requirements-completed: [GT7-01, GT7-02, GT7-03]

duration: 6min
completed: 2026-07-14
---

# Quick Task 260714-gt7: Нетто-базис одежды в /finance/weekly Summary

**Базис одежды (clothing) в понедельном фин-отчёте переключён с GROSS-выкупов на НЕТТО (выкупы − возвраты) через новый pure-хелпер netClothingSales**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-14T12:08:00Z
- **Completed:** 2026-07-14T12:14:00Z
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- `lib/finance-weekly/clothing-net.ts` — pure-модуль `netClothingSales(agg)`, ноль импортов Prisma/React
- `lib/finance-weekly/data.ts` — groupBy WbSalesDaily тянет `returnsCount`/`returnsRub`, `salesByNmId` собирается через `netClothingSales`; все W2d-комментарии про gross обновлены на нетто
- `tests/finance-weekly-clothing-net.test.ts` — 5 кейсов (возвраты вычитаются, отрицательное нетто клампится в 0, нулевое нетто безопасно, null-поля `_sum`, обратная совместимость без возвратов)
- `components/finance/WeeklyFinReportTable.tsx` — бейдж `UNIVERSE_BASIS.clothing` и подпись KPI-блока теперь «выкупы нетто (− возвраты)»

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure-хелпер netClothingSales + нетто-агрегация в data.ts + тест** - `3f47659` (feat)
2. **Task 2: Бейдж базиса одежды в UI → «выкупы нетто (− возвраты)»** - `d0f2af7` (docs)

_Note: Task 1 включает и хелпер, и тест, и wiring в data.ts одним коммитом (tdd="true" по плану, но исполнено как единый вертикальный срез: хелпер+тест сразу проверены зелёными перед wiring, отдельного RED-коммита не создавалось — план не требовал раздельных commits внутри задачи)._

## Files Created/Modified
- `lib/finance-weekly/clothing-net.ts` - Новый pure-хелпер `netClothingSales({buyoutsCount, buyoutsRub, returnsCount, returnsRub}) → {qty, rub}`; qty = Math.max(0, buyouts−returns), rub = buyoutsRub + returnsRub (returnsRub уже отрицательный)
- `lib/finance-weekly/data.ts` - groupBy WbSalesDaily добавил `returnsCount`/`returnsRub` в `_sum`; `salesByNmId` собирается через `netClothingSales`; комментарии W2d Фикс 1 (шапка модуля, groupBy, цикл candidates) обновлены на нетто-версию с ссылкой на quick 260714-gt7
- `tests/finance-weekly-clothing-net.test.ts` - 5 unit-тестов netClothingSales
- `components/finance/WeeklyFinReportTable.tsx` - `UNIVERSE_BASIS.clothing` → «по выкупам нетто»; подпись KPI-блока → «одежда — выкупы нетто (− возвраты)»

## Decisions Made
- Базис одежды нетто, а не gross — сверка с экономистом на 10 артикулах недели 06.07-12.07 показала совпадение только на нетто-величине; прежнее gross-решение (W2d Фикс 1) было валидировано на неделе без возвратов, поэтому расхождение не проявлялось раньше
- Guard `if (qty <= 0) continue` в цикле candidates НЕ тронут — он уже корректно защищает деление `K = rub/qty` от нуля/отрицательного нетто, дополнительных изменений в логику отбора артикулов не потребовалось
- Appliances-базис (WbCardFunnelDaily/заказы), engine.ts, plan-fact.ts — не затронуты; изменения строго локализованы в загрузчике данных одежды и UI-подписях

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Изменение чисто computational (LIVE-агрегация из уже существующей таблицы WbSalesDaily), деплой на прод стандартный (git push → deploy.sh).

## Next Phase Readiness

- `/finance/weekly` готов показывать нетто-базис одежды сразу после деплоя — данных WbSalesDaily.returnsCount/returnsRub уже достаточно (таблица заполняется существующим cron)
- Рекомендуемая ручная сверка после деплоя (из плана): артикул 848714305, неделя 06.07-12.07 → нетто qty 8 = цифра экономиста в Excel
- Блокеров нет

## Self-Check: PASSED

- FOUND: lib/finance-weekly/clothing-net.ts
- FOUND: tests/finance-weekly-clothing-net.test.ts
- FOUND: lib/finance-weekly/data.ts
- FOUND: components/finance/WeeklyFinReportTable.tsx
- FOUND: 3f47659
- FOUND: d0f2af7
