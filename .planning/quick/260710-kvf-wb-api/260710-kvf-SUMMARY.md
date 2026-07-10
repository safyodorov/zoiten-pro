---
phase: quick-260710-kvf
plan: 01
subsystem: finance
tags: [wb-api, sales-reports, finance-weekly, classifier, pools]

# Dependency graph
requires:
  - phase: quick-260710-jgs
    provides: "W1 импорт отчёта реализации WB (WbRealizationWeekly + клиент sales-reports + ИУ-факт в /finance/weekly)"
provides:
  - "explodeRealizationRow — мульти-поле разнос строки отчёта реализации по бакетам (classifyRealizationRow удалён)"
  - "Алиас sellerOperName в normalizeRealizationRow (реальное имя поля оператора в API)"
  - "rebillLogisticCost в NormalizedRealizationRow → deductionOther (диагностика, не ИУ-факт)"
  - "resolvePoolTotals — per-бакет выбор реализация(>0)/manual + sources для бейджей"
  - "poolSources в WeeklyFinReportPageData; per-пул бейдж «из реализации/вручную» в Controls"
affects: [finance-weekly, wb-realization-sync]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Explode-классификация: каждое ненулевое (!== 0) денежное поле строки → отдельный вклад в свой бакет"
    - "Per-бакет fallback: значение из источника-факта берётся только при > 0, иначе manual"

key-files:
  created: []
  modified:
    - lib/wb-realization-api.ts
    - lib/wb-realization-sync.ts
    - lib/finance-weekly/realization.ts
    - lib/finance-weekly/data.ts
    - app/(dashboard)/finance/weekly/page.tsx
    - components/finance/WeeklyFinReportControls.tsx
    - tests/wb-realization-classify.test.ts
    - tests/finance-weekly-realization.test.ts

key-decisions:
  - "Explode по условию !== 0 (не > 0): «Возврат» несёт ОТРИЦАТЕЛЬНЫЙ forPay, знак WB не инвертируется"
  - "deduction суб-классифицируется ТОЛЬКО по bonusTypeName: «списание за отзыв» → reviewPoints, «продвижение» → promotion, прочее → deductionOther (старый маркер «баллы за отзывы» был доисследовательской гипотезой)"
  - "rebillLogisticCost → deductionOther: хранится для сверки, в расчёт ИУ-факта не идёт"
  - "Пулы per-бакет по условию > 0: нулевой paidStorage/paidAcceptance на ИУ не затирает ручные значения"
  - "hasRealization в data.ts сохранён — используется reviewWriteoffTotal / logisticsIuPerUnit / reviewAccountShare (вне scope)"

patterns-established:
  - "explodeRealizationRow: одна строка отчёта → N вкладов (WB кладёт деньги полями, не строками-операциями)"
  - "resolvePoolTotals: per-key выбор источника с sources-map для UI-бейджей"

requirements-completed: [QUICK-260710-KVF]

# Metrics
duration: 10min
completed: 2026-07-10
---

# Quick 260710-kvf: Фикс классификатора реализации WB (мульти-поле разнос) Summary

**Explode-классификатор (одна строка → вклады во все ненулевые бакеты) + алиас sellerOperName + per-бакет fallback пулов хранения/приёмки — исправлены delivery=0/penalty=0/reviewPoints=0 после первого реального синка**

## Performance

- **Duration:** ~10 мин
- **Started:** 2026-07-10T12:08:41Z
- **Completed:** 2026-07-10T12:18:30Z
- **Tasks:** 2/2
- **Files modified:** 8

## Accomplishments

1. **Task 1 — explode-классификатор** (`test 383523d` → `feat d2f5434`):
   - `explodeRealizationRow` заменил `classifyRealizationRow` (удалён полностью, grep вне .planning пуст): каждое ненулевое денежное поле строки (`forPay`, `deliveryRub`, `penaltyRub`, `storageRub`, `acceptanceRub`, `deductionRub`, `rebillLogisticCost`) даёт отдельный вклад в свой бакет — строка «Продажа» с forPay+deliveryService+penalty теперь даёт 3 вклада вместо одного.
   - `normalizeRealizationRow` читает `sellerOperName` (реальное имя поля в API по зонду detailed 772161985) + новое поле `rebillLogisticCost`.
   - deduction по `bonusTypeName`: «списание за отзыв» → reviewPoints, «продвижение» → promotion (ловит «WB Продвижение» и «ВБ.Продвижение»), прочее → deductionOther.
   - `accumulateRealizationRows` через explode; запись в Map создаётся для каждой строки (поведение прежнее).
   - Тесты: 7 кейсов (а)-(ж) + «Возврат» с отрицательным forPay + storage/acceptance + строка без денег → 18 passed.

2. **Task 2 — per-бакет fallback пулов** (`test 29a1dac` → `fix 6c65380`):
   - `resolvePoolTotals(realization, manual)` в `lib/finance-weekly/realization.ts`: per ключ — реализация при `> 0`, иначе manual; возвращает `{totals, sources}`.
   - `data.ts`: 4 тернарника заменены на `resolvedPools.totals.X`; `WeeklyFinReportPageData` += `poolSources`; оба early-return'а — все 4 ключа "manual"; `hasRealization` сохранён (reviewWriteoffTotal / logisticsIuPerUnit вне scope).
   - `page.tsx`: prop `hasRealization` → `poolSources`.
   - `Controls`: per-пул бейдж «из реализации/вручную» через `poolSources[f.key]` + type guard `isRealizationPoolKey` (REALIZATION_POOL_KEYS `as const`).
   - Тесты: describe("resolvePoolTotals") — 3 кейса (per-бакет независимость в одном вызове; realization=null; отрицательный бакет) → 13 passed.

## Gates

- `npx tsc --noEmit` — чисто (exit 0)
- Гейтовые тест-файлы зелёные: finance-weekly-engine/realization/attribution/credit-accrual/plan-fact, pricing-math/fallback/settings, wb-realization-classify — 132 passed суммарно
- Полный suite: 44 падения только в 12 известных чужих файлах (support/CRM/wb-sync/token/cooldown) — подтверждено pre-existing прогоном на stash без моих изменений
- `lib/finance-weekly/engine.ts` НЕ в diff
- Запушено в origin/main (`54ccf88..6c65380`), деплой НЕ выполнялся (по заданию)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] Обновлён устаревший docstring reconcileWithListAggregates**
- **Found during:** Task 1
- **Issue:** Комментарий сверки ссылался на «deduction-fallback'и в classify» (удалённая функция)
- **Fix:** Комментарий переписан: rebillLogisticCost → deductionOther не входит в deductionSum → warning ожидаем (диагностика). Сама логика reconcile НЕ менялась (по заданию)
- **Files modified:** lib/wb-realization-sync.ts
- **Commit:** d2f5434

Прочих отклонений нет — план исполнен как написан.

## Known Behavior Notes (не stubs)

- Пара сверки «reviewPoints+promotion+deductionOther vs deductionSum» в `reconcileWithListAggregates` может давать console.warn (~308K rebillLogisticCost не входит в deductionSum) — задокументировано в коде как ожидаемая диагностика, НЕ чинить (по заданию).
- Перезапуск синка реализации на проде — отдельно, после деплоя (живые вызовы WB API в этой задаче запрещены).

## Commits

| Hash | Message |
|------|---------|
| 383523d | test(quick-260710-kvf): переписать тесты классификатора реализации под explode (мульти-поле) |
| d2f5434 | feat(quick-260710-kvf): explode-классификатор реализации WB (мульти-поле разнос) |
| 29a1dac | test(quick-260710-kvf): failing тесты resolvePoolTotals (per-бакет fallback пулов) |
| 6c65380 | fix(quick-260710-kvf): мульти-поле explode классификатора реализации WB + per-бакет fallback пулов |

## Self-Check: PASSED

- 9/9 файлов существуют (8 изменённых + SUMMARY)
- 4/4 коммита в истории (383523d, d2f5434, 29a1dac, 6c65380)
- origin/main = 6c65380 (запушено)
