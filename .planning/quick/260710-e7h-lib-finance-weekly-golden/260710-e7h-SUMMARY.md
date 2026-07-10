---
phase: quick-260710-e7h
plan: 01
subsystem: finance
tags: [finance-weekly, pure-engine, unit-economics, wb, golden-test, vitest, typescript]

# Dependency graph
requires:
  - phase: docs/superpowers/specs/2026-07-08-weekly-finreport-design.md
    provides: "формулы листа «Показатели» (§2), пулы недели (§2.1), два мира затрат (§2.2), решения §7"
provides:
  - "lib/finance-weekly/types.ts — контракт входов/выходов движка понедельного фин-отчёта"
  - "lib/finance-weekly/engine.ts — computeWeeklyFinReport (дуал ИУ/Оферта, два мира затрат) + poolPerUnit (revenue-share)"
  - "tests/finance-weekly-engine.test.ts — golden nmId 165967746 + pool-distribution + clothing credit guard"
affects: [finance-weekly-page, finance-weekly-W1-realization-import, finance-weekly-W3-pools-snapshot]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure детерминированный движок (ноль импортов Prisma/React/Next/pricing-math) — как lib/sales-plan/engine.ts и lib/pricing-math.ts"
    - "Пул несёт СВОЮ базу распределения (per-pool baseRevenue) — не единая база на всё"

key-files:
  created:
    - lib/finance-weekly/types.ts
    - lib/finance-weekly/engine.ts
    - tests/finance-weekly-engine.test.ts
  modified: []

key-decisions:
  - "Движок data-agnostic: N_std (логистика Оферты) и хранение приходят как ВХОД от слоя страницы, движок их НЕ считает через юнит-экономику /prices/wb"
  - "Эквайринг по умолчанию 2.87% (Excel), не 2.7% из /prices/wb — DEFAULT_WEEKLY_CONSTANTS, overridable через inputs.constants"
  - "clothing credit guard хардкодом в resolveCommon: universe==='clothing' → creditPerUnit=0 независимо от переданного пула"

patterns-established:
  - "poolPerUnit(K, baseRevenue, total) = baseRevenue>0 ? (K/baseRevenue)×total : 0 — экспортируемый pure-хелпер revenue-share с zero-guard"
  - "Два независимых мира затрат (appliances/clothing) с отдельными наборами UniversePools; пул кредита существует только у appliances"

requirements-completed: [WFR-ENGINE]

# Metrics
duration: ~10min
completed: 2026-07-10
---

# Phase quick-260710-e7h: Движок понедельного WB фин-отчёта (pure lib) Summary

**PURE-движок `computeWeeklyFinReport` воспроизводит недельную юнит-экономику per-nmId из Excel-листа «Показатели» в двух сценариях комиссии (ИУ/Оферта) с распределением затратных пулов пропорционально выручке в двух непересекающихся мирах затрат — golden nmId 165967746 сходится с эталоном в пределах ±0.5 ₽.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-10T07:21:51Z
- **Completed:** 2026-07-10T07:26Z
- **Tasks:** 2/2
- **Files created:** 3

## Accomplishments
- `computeWeeklyFinReport(inputs)` — детерминированный расчёт per-article ИУ+Оферта одновременно, роллап (Σ per universe + grand total) и водопад затрат (Σ бакетов × H, отдельно iu/std т.к. логистика различается по сценариям).
- `poolPerUnit` — отдельный экспортируемый pure-хелпер revenue-share распределения с zero-guard (baseRevenue ≤ 0 → 0).
- Guard §2.2: одежда (clothing) НИКОГДА не получает проценты по кредиту, даже если пул кредита передан во входе.
- Полная изоляция: движок не импортирует Prisma/React/Next и не импортирует движок юнит-экономики /prices/wb — существующие тесты (pricing-math, sales-plan-engine, balance-math) остались зелёными.

## Task Commits

Each task was committed atomically:

1. **Task 1: типы + движок lib/finance-weekly/ (pure)** — `a9e85a3` (feat)
2. **Task 2: golden-тест tests/finance-weekly-engine.test.ts** — `8ad124a` (test)

## Files Created/Modified
- `lib/finance-weekly/types.ts` — WeeklyArticleInput / WeeklyPool / UniversePools / WeeklyConstants (+DEFAULT_WEEKLY_CONSTANTS) / ScenarioResult / ArticleResult / роллап / водопад / WeeklyFinReportInputs+Output.
- `lib/finance-weekly/engine.ts` — `computeWeeklyFinReport` + `poolPerUnit`; внутренние pure-хелперы resolveCommon / computeScenario / водопад-аккумулятор.
- `tests/finance-weekly-engine.test.ts` — 3 блока: golden дуал-сценарий (nmId 165967746), poolPerUnit revenue-share (≈175) + guards, clothing credit guard.

## Golden-эталон (ручная сверка, совпала с движком)

| Сценарий | I (цена−комиссия/ед) | profitPerUnit | profit (×H=4) | revenue |
|---|---|---|---|---|
| ИУ (comm=31.5, N=0) | 8047.928 | 130.895 | 523.582 | 46995.2 |
| Оферта (comm=25.5, N=1380) | 8752.856 | −544.177 | −2176.706 | 46995.2 |

`poolPerUnit(11748.8, 17614883, 262300) ≈ 174.95` (revenue-share).

## Verification / Gates

- `npx tsc --noEmit` — чист (весь проект компилируется, strict).
- Целевые suites зелёные: `finance-weekly-engine` (новый) + `pricing-math` + `sales-plan-engine` = 73/73; `balance-math` = 12/12.
- `git grep "pricing-math" lib/finance-weekly/engine.ts` — пусто; `grep -rE "from ['\"]@?/?(lib/prisma|next|react)" lib/finance-weekly/` — пусто (изоляция подтверждена).

## Deviations from Plan

**1. [Rule 3 - Blocking] Убран литеральный токен `pricing-math` из комментария engine.ts**
- **Found during:** Task 1 (проверка done-критерия)
- **Issue:** done-критерий требует «engine.ts НЕ содержит строки "pricing-math"», а пояснительный комментарий содержал `@/lib/pricing-math`.
- **Fix:** переформулировал комментарий на «движок юнит-экономики /prices/wb» — смысл сохранён, литеральный токен убран.
- **Files modified:** lib/finance-weekly/engine.ts
- **Commit:** a9e85a3

## Deferred / Known Issues

- Полный прогон `npm run test` показывает 42 падения в 11 файлах доменов support/CRM/wb-sync (appeal-actions, customer-actions, customer-sync-chat, merge-customers, messenger-ticket, response-templates, support-sync-chats, support-sync-returns, template-picker, wb-sync-route, wb-token-validate). Подтверждено ПРЕДСУЩЕСТВУЮЩИМИ: `wb-token-validate` падает идентично и БЕЗ моего теста (stash-проверка), а новый изолированный модуль нигде не импортируется — повлиять на эти suites не может. Вне scope этой задачи, не трогал.

## Known Stubs

None — pure lib + golden test, без UI/данных-заглушек.

## Self-Check: PASSED

- lib/finance-weekly/types.ts — FOUND
- lib/finance-weekly/engine.ts — FOUND
- tests/finance-weekly-engine.test.ts — FOUND
- Commit a9e85a3 (Task 1) — FOUND
- Commit 8ad124a (Task 2) — FOUND
