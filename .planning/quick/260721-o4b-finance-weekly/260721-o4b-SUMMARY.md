---
phase: quick-260721-o4b
plan: 01
subsystem: finance
tags: [finance-weekly, pricing-math, wb-commission, vitest]

requires:
  - phase: quick-260710-e7h
    provides: "computeWeeklyFinReport pure engine (ИУ/Оферта dual scenario), водопад затрат"
provides:
  - "CostWaterfall.commission бакет (K−I)×H, оба сценария"
  - "WeeklyFinReportInputs.waterfallTails (опц.) — лямп-хвосты рекламы/отзывов в водопад"
  - "Оферта: хранение = расчётная модель (calculatePricingStandard.storageAmount), не пул"
  - "UI: строка «Комиссия» в /finance/weekly Водопад затрат"
affects: [finance-weekly, prices-wb]

tech-stack:
  added: []
  patterns:
    - "engine.ts contract остаётся additive: новое поле CostWaterfall + новый опц. вход WeeklyFinReportInputs.waterfallTails + новое internal-поле ScenarioBreakdown — diff-guard проходит"
    - "Хвосты (не привязанные к candidates суммы) применяются лямп-суммой ПОСЛЕ основного цикла по articles, не per-article"

key-files:
  created: []
  modified:
    - lib/finance-weekly/types.ts
    - lib/finance-weekly/engine.ts
    - lib/finance-weekly/data.ts
    - lib/finance-weekly/live.ts
    - components/finance/WeeklyFinReportTable.tsx
    - tests/finance-weekly-engine.test.ts

key-decisions:
  - "Хранение Оферты = расчётная модель (объём × ставки × дни), как логистика — решение пользователя 2026-07-21"
  - "Комиссия WB = K − cutPricePerUnit (I), отдельный бакет водопада — иначе Итого затрат ≠ Выручка − Прибыль"
  - "Хвосты рекламы/отзывов (nmId вне candidates) идут ТОЛЬКО в водопад через waterfallTails, per-article строки не трогаем"

patterns-established:
  - "waterfallTails: Partial<CostWaterfall> — обобщённый механизм лямп-корректировки водопада без изменения per-article модели"

requirements-completed: [WK-01-commission-bucket, WK-02-ad-review-tails, WK-03-storage-offer-modeled, WK-04-golden-recompute, WK-05-gates, WK-06-snapshots-immutable]

duration: ~11min
completed: 2026-07-21
---

# Phase quick-260721-o4b: Понедельный фин-отчёт — Комиссия/хвосты/хранение-модель Summary

**Добавлен бакет «Комиссия» в водопад /finance/weekly (оба сценария), хвосты рекламы/отзывов доводят водопад до кабинетных сумм, хранение Оферты теперь расчётная модель (объём×ставки×дни) вместо ИУ=Оферта=0.**

## Performance

- **Duration:** ~11 мин
- **Started:** 2026-07-21T14:36:00Z
- **Completed:** 2026-07-21T14:47:14Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- `CostWaterfall.commission` — новый бакет (K−I)×H в обоих сценариях; UI-строка «Комиссия» сразу после «Закупка». С ним «Итого затрат» = Выручка − Прибыль (инвариант проверен golden-тестом).
- `WeeklyFinReportInputs.waterfallTails?: Partial<CostWaterfall>` — аддитивный вход движка, применяемый к обоим сценариям (iu+std) ПОСЛЕ накопления по articles; отсутствие поля не меняет golden.
- `data.ts`: `adTail = updTotal − Σ adSpendTotal(articles)`, `reviewTail = Σ reviewPointsRub(недели) − Σ reviewWriteoffTotal(articles)` — доводят водопад до ground truth /adv/v1/upd и отчёта реализации, не трогая per-article строки.
- `data.ts`: Оферта `storagePerUnit` теперь = `calculatePricingStandard(pricingInputs).storageAmount` (тот же вызов, что уже даёт `logisticsEffAmount`) — расчётная модель вместо голого пула; `volumeLiters<=0` → `undefined` → fallback на пул хранения (как раньше). ИУ хранение по-прежнему 0.
- Golden-тест (nmId 165967746, реальные габариты 38×26×44 см из прод-БД → V=43.5 л): Оферта profit пересчитан с `S=417.6 ₽/ед` (модель хранения) — `profitPerUnit≈−961.78`, `profit≈−3847.1`. ИУ golden (523.6) не изменился.

## Task Commits

Each task was committed atomically:

1. **Task 1: Движок — бакет «Комиссия» + аддитивный вход waterfallTails** - `87f78bf` (feat)
2. **Task 2: Data-слой — хранение Оферты моделью + хвосты рекламы/отзывов + проброс в движок** - `55668f6` (feat)
3. **Task 3: UI-строка «Комиссия» + пересчёт golden Оферты (хранение-модель) + сверка тестов** - `4ab6b97` (test)

_Note: SUMMARY/STATE meta-commit follows separately._

## Files Created/Modified

- `lib/finance-weekly/types.ts` — `CostWaterfall.commission`, `WeeklyFinReportInputs.waterfallTails?`
- `lib/finance-weekly/engine.ts` — `ScenarioBreakdown.commissionPerUnit`, `emptyWaterfall()`/`addToWaterfall()` учитывают commission, tails-loop после цикла articles
- `lib/finance-weekly/data.ts` — захват полного `stdOut` из `calculatePricingStandard` (storageAmount + logisticsEffAmount), `adTail`/`reviewTail`, `WeeklyFinReportPageData.waterfallTails`
- `lib/finance-weekly/live.ts` — проброс `data.waterfallTails` в `computeWeeklyFinReport`
- `components/finance/WeeklyFinReportTable.tsx` — строка «Комиссия» в `WATERFALL_BUCKETS`
- `tests/finance-weekly-engine.test.ts` — golden `storagePerUnit=GOLDEN_STORAGE_STD` (417.6), обновлены 3 захардкоженных std.profit-assertions (главный блок + «Опция Джема» + «overheadFixedPerUnit»), новые тесты commission/инварианта/waterfallTails/storage-водопада

## Decisions Made

- Хранение Оферты = расчётная модель (объём × ставки × дни), как логистика — решение пользователя 2026-07-21 (зафиксировано в PLAN.md objective).
- S (модель хранения golden nmId) выведен из реальных габаритов Product в прод-БД (38×26×44 см → V=43.472 л, округл. до 0.1 → 43.5 л) — не произвольная оценка.
- Хвосты рекламы/отзывов — только лямп-корректировка водопада (`waterfallTails`), per-article breakdown НЕ меняется — сохраняет изоляцию drill-down модалки от водопад-сверки.

## Deviations from Plan

None - plan executed exactly as written (включая явное указание проверить 3 shared-const describe-блока golden-теста на сдвиг std.profit).

## Issues Encountered

None. Габариты nmId 165967746 получены с прод-БД по ssh-команде из constraints (38×26×44 см), формула storage-модели взята из `lib/pricing-math.ts:575`.

## User Setup Required

None - no external service configuration required. Ручная сверка водопада (после деплоя оркестратором, неделя 13–19.07: Реклама 145 340 ₽, Отзывы 51 167 ₽) остаётся на усмотрение пользователя — вне scope исполнителя (constraints: не деплоить).

## Next Phase Readiness

- Движок/data-слой/UI готовы; деплой и ручная сверка кабинета WB — следующий шаг оркестратора/пользователя.
- `WeeklyFinReportSnapshot` (фиксация недель) не пересчитывается — immutable, правки только в live-расчёте (WK-06), как и требовалось.

---
*Phase: quick-260721-o4b*
*Completed: 2026-07-21*

## Self-Check: PASSED

All 3 task commits (87f78bf, 55668f6, 4ab6b97) and all 6 modified files verified present.
