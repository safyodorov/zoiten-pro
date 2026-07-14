---
phase: quick-260714-kke
plan: 01
subsystem: finance
tags: [finance-weekly, pricing-engine, vitest, tdd]

# Dependency graph
requires:
  - phase: quick-260710-e7h
    provides: "lib/finance-weekly/engine.ts (computeWeeklyFinReport pure engine, golden nmId 165967746)"
provides:
  - "Оферта-only семантика хранения (Z) в /finance/weekly движке — ИУ больше не вычитает хранение"
affects: [finance-weekly, prices-wb-adjacent-reports]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-сценарий параметр в внутренней (не-экспортируемой) функции computeScenario — аддитивный способ развести ИУ/Оферта поведение без изменения публичного контракта"

key-files:
  created: []
  modified:
    - lib/finance-weekly/engine.ts
    - lib/finance-weekly/types.ts
    - tests/finance-weekly-engine.test.ts

key-decisions:
  - "storagePerUnit стал 5-м параметром внутренней computeScenario (как logisticsPerUnit) — ИУ-вызов передаёт 0, Оферта-вызов передаёт common.storagePerUnit; публичные экспортируемые типы и сигнатура computeWeeklyFinReport не изменены"

requirements-completed: [STG-01, STG-02, STG-03, STG-04, STG-05, STG-06]

# Metrics
duration: 4min
completed: 2026-07-14
---

# Phase quick-260714-kke: Хранение — статья только Оферты в /finance/weekly Summary

**В движке `/finance/weekly` статья «Хранение» (Z) теперь вычитается ТОЛЬКО в сценарии Оферта; ИУ-сценарий получает `storagePerUnit=0` во всех breakdown/waterfall местах — устранён двойной учёт хранения на ИУ (WB не берёт хранение на ИУ, оно зашито в комиссию).**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-07-14T15:00:xx+03:00 (первое чтение файлов)
- **Completed:** 2026-07-14T15:04:09+03:00
- **Tasks:** 2/2 completed (TDD: RED → GREEN)
- **Files modified:** 3

## Accomplishments
- Новый unit-тест `describe("computeWeeklyFinReport — хранение вычитается только в Оферте (ИУ=0)")` закрепляет: ИУ breakdown.storagePerUnit=0 при любом пуле, ИУ-прибыль не зависит от хранения, Оферта-прибыль падает ровно на storage×H, водопад iu.storage=0/std.storage=storage×H, per-article override storagePerUnit действует только на Оферту
- `computeScenario` (внутренняя, не-экспортируемая функция) получила 5-й параметр `storagePerUnit`, разводящий ИУ (0) и Оферта (`common.storagePerUnit`) без изменения публичного контракта движка
- Golden nmId 165967746 (storage=0 во входах) остался неизменным: ИУ +523.6 / Оферта −2176.7
- Комментарии в `engine.ts` (5 мест) и `types.ts` (4 места) обновлены — явно документируют Оферта-only семантику хранения

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — новый тест «хранение — статья только Оферты»** - `a0be4a1` (test)
2. **Task 2: GREEN — per-сценарий хранение в computeScenario + комментарии + golden-нота** - `7143190` (feat)

_TDD: Task 1 = RED (новые 4 ассерта падают на текущем движке), Task 2 = GREEN (те же ассерты проходят) + комментарии._

## Files Created/Modified
- `lib/finance-weekly/engine.ts` - `computeScenario` получила параметр `storagePerUnit`; ИУ-вызов передаёт `0`, Оферта-вызов передаёт `common.storagePerUnit`; 5 обновлённых комментариев (ScenarioBreakdown, CommonPerUnit, resolveCommon, computeScenario, profitPerUnit-выражение)
- `lib/finance-weekly/types.ts` - 4 обновлённых комментария (`WeeklyArticleInput.storagePerUnit`, `UniversePools.storage`, блок над `CostBreakdown`, `CostBreakdown.storagePerUnit`) — типы (поля/сигнатуры) НЕ изменены, только документация Оферта-only семантики
- `tests/finance-weekly-engine.test.ts` - новый describe-блок (6 тестов) «хранение вычитается только в Оферте (ИУ=0)» + пояснительный комментарий у golden-пула хранения

## Decisions Made
- **Аддитивный параметр вместо изменения контракта:** `storagePerUnit` добавлен как 5-й аргумент внутренней `computeScenario` (симметрично уже существующему паттерну `logisticsPerUnit`), а не через новое публичное поле входа — сохраняет обратную совместимость `WeeklyArticleInput`/`computeWeeklyFinReport` на 100%, потребители (`data.ts`, `WeeklyFinArticleDialog.tsx`, водопад) уже читают per-сценарий значения из `ScenarioBreakdown`/`CostBreakdown` и не требуют правок (подтверждено grep — `storagePerUnit` в компонентах читается как `article.iu.breakdown[key]` / `article.std.breakdown[key]`, что автоматически покажет 0/пул после этой правки)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Изменение чисто в pure-движке (`lib/finance-weekly/engine.ts`), деплой стандартный (git push + deploy.sh на VPS по правилам CLAUDE.md), UI-компоненты (модалка, водопад) автоматически подхватят новую семантику без правок.

## Next Phase Readiness
- Изменение изолировано, гейтовые сьюты зелёные (tsc чист, `finance-weekly` + `pricing` сьюты 165/165 passed)
- Публичный контракт движка не тронут — другие quick-планы, зависящие от `computeWeeklyFinReport`/`WeeklyArticleInput`, не затронуты
- Готово к деплою по стандартному циклу (коммит → push → deploy.sh на VPS)

---
*Phase: quick-260714-kke*
*Completed: 2026-07-14*

## Self-Check: PASSED

- FOUND: lib/finance-weekly/engine.ts
- FOUND: lib/finance-weekly/types.ts
- FOUND: tests/finance-weekly-engine.test.ts
- FOUND: .planning/quick/260714-kke-wb/260714-kke-SUMMARY.md
- FOUND: commit a0be4a1 (test — RED)
- FOUND: commit 7143190 (feat — GREEN)
