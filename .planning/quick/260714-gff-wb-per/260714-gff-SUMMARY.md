---
phase: quick-260714-gff
plan: 01
subsystem: finance
tags: [finance-weekly, wb-commission, jem-option, appsetting, pure-engine]

requires:
  - phase: quick-260710-e7h..mih
    provides: "lib/finance-weekly/* pure engine + data loader + snapshot + RBAC-gated /finance/weekly page"
provides:
  - "WeeklyConstants.jemOptionPct — опциональная надбавка к комиссии обоих сценариев (ИУ/Оферта), default 0"
  - "lib/finance-weekly/jem-option.ts — pure carry-forward резолвер per неделя (AppSetting-префикс, default 0.75)"
  - "data.ts резолвит jemOptionPct во всех return-сайтах → constants → движок через live.ts + PageData для UI"
  - "saveWeeklyPools(weekStartISO, pools, { jemOptionPct }) — сохранение ставки текущей недели"
  - "редактируемое поле «Опция Джема, %» в шапке /finance/weekly (группа «Общее»), RBAC FINANCE MANAGE"
affects: [finance-weekly, prices-wb-commission-consistency]

tech-stack:
  added: []
  patterns:
    - "Pure carry-forward AppSetting резолвер (аналог bank-pools.ts): точный ключ недели → ближайшая предыдущая → default"
    - "Аддитивное расширение движка через WeeklyConstants (опциональное поле, coalesce к 0) — golden-тест не трогается"

key-files:
  created:
    - lib/finance-weekly/jem-option.ts
    - tests/finance-weekly-jem-option.test.ts
    - .planning/quick/260714-gff-wb-per/deferred-items.md
  modified:
    - lib/finance-weekly/types.ts
    - lib/finance-weekly/engine.ts
    - lib/finance-weekly/data.ts
    - app/actions/finance-weekly.ts
    - components/finance/WeeklyFinReportControls.tsx
    - "app/(dashboard)/finance/weekly/page.tsx"
    - tests/finance-weekly-engine.test.ts

key-decisions:
  - "jemOptionPct — ОПЦИОНАЛЬНОЕ поле WeeklyConstants, НЕ добавлено в DEFAULT_WEEKLY_CONSTANTS — движок применяет 0 через coalesce (c.jemOptionPct ?? 0), golden-тест nmId 165967746 не меняется"
  - "carry-forward резолв делается ОДНИМ доп. await в data.ts (не через Promise.all с marketplace) — проще, добавляет один быстрый round-trip к AppSetting, покрывает все 3 return-сайта единообразно"
  - "Отрицательные значения ставки приводятся к 0 (Math.max(0, ...)) и в резолвере, и в server action — Опция Джема экономически не может быть отрицательной"
  - "UI-поле размещено в группе «Общее» (не в ManualPools) — это надбавка к комиссии, не пул затрат"

requirements-completed: [JEM-01, JEM-02, JEM-03, JEM-04, JEM-05]

duration: ~15min
completed: 2026-07-14
---

# Quick 260714-gff: Опция Джема в понедельном фин-отчёте Summary

**Аддитивная надбавка к комиссии WB (default 0.75 п.п., carry-forward per неделя) добавлена в оба сценария (ИУ/Оферта) движка /finance/weekly, редактируется MANAGE-пользователем в шапке отчёта.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2/2 completed
- **Files modified:** 7 (+ 3 created)

## Accomplishments
- Движок `computeWeeklyFinReport` аддитивно прибавляет `jemOptionPct` к `commIuPct`/`commStdPct` обоих сценариев перед расчётом `cutPricePerUnit` — комиссии ИУ и Оферты в отчёте теперь = базовая комиссия + Опция Джема, совпадая с Excel-J экономиста.
- Pure carry-forward резолвер `lib/finance-weekly/jem-option.ts`: точный ключ недели → ближайшая ПРЕДЫДУЩАЯ заданная неделя → default 0.75; будущие недели и повреждённые значения игнорируются без падения.
- `data.ts` резолвит ставку из AppSetting (`financeWeekly.jemOptionPct.<weekISO>`) и прокидывает её во все три return-сайта функции (включая ранние return при отсутствии marketplace/привязанных артикулов) — контракт `WeeklyFinReportPageData.jemOptionPct` доступен всегда.
- Server action `saveWeeklyPools` расширен опциональным `jemOptionPct` — сохраняет ставку ТЕКУЩЕЙ недели с санитизацией (≥ 0), сосуществует с существующим `clothingOverheadFixedRub`.
- В шапке `/finance/weekly` (группа «Общее» редактора пулов) добавлено поле «Опция Джема, %» — редактируется вместе с пулами одной кнопкой «Сохранить», видно только `FINANCE MANAGE` и только вне снапшот-режима (в снапшоте значение read-only через `payload.constants.jemOptionPct`).

## Task Commits

1. **Task 1: Pure-слой — jemOptionPct в движке + carry-forward резолвер + тесты** - `87e8823` (test)
2. **Task 2: Wiring — data.ts резолв + server action + поле в шапке + page.tsx** - `7c9c5e3` (feat)

## Files Created/Modified
- `lib/finance-weekly/types.ts` - опциональное поле `WeeklyConstants.jemOptionPct` (комментарий отличает от существующего `jemPct`)
- `lib/finance-weekly/engine.ts` - `jemOpt = c.jemOptionPct ?? 0` прибавляется к `commIuPct`/`commStdPct` перед `computeScenario` в обоих сценариях
- `lib/finance-weekly/jem-option.ts` - новый pure-модуль: `DEFAULT_JEM_OPTION_PCT`, `JEM_OPTION_PREFIX`, `financeWeeklyJemOptionKey`, `resolveJemOptionPct`
- `lib/finance-weekly/data.ts` - импорт резолвера, `jemRows`/`jemOptionPct`/`constants` вычисляются один раз в начале, используются во всех return-сайтах + новое поле интерфейса `WeeklyFinReportPageData.jemOptionPct`
- `app/actions/finance-weekly.ts` - `saveWeeklyPools` принимает `opts.jemOptionPct`, upsert AppSetting по ключу текущей недели
- `components/finance/WeeklyFinReportControls.tsx` - проп `jemOptionPct`, `useState`, поле-инпут в группе «Общее», передача в `handleSave`
- `app/(dashboard)/finance/weekly/page.tsx` - оба render-пути передают `jemOptionPct` (`data.jemOptionPct` live / `payload.constants.jemOptionPct ?? 0.75` снапшот)
- `tests/finance-weekly-engine.test.ts` - новый describe-блок: +0.75 п.п. к комиссии обоих сценариев, падение `cutPricePerUnit` на K×0.75/100=88.116 ₽, падение profit, golden без constants не меняется
- `tests/finance-weekly-jem-option.test.ts` - новый файл, 9 тестов carry-forward резолвера (точный ключ / предыдущая неделя / будущие игнорируются / default / повреждённые значения / отрицательные → 0 / чужой префикс игнорируется)

## Decisions Made
- `jemOptionPct` НЕ добавлен в `DEFAULT_WEEKLY_CONSTANTS` — золотой тест (523.6 / −2176.7) остаётся нетронутым, движок расширен только аддитивно.
- Carry-forward резолв в `data.ts` реализован отдельным sequential `await` сразу после вычисления границ недели (а не через `Promise.all` с marketplace-запросом) — покрывает все 3 return-сайта единым кодом без дублирования логики.
- Отрицательные ставки приводятся к 0 и в резолвере, и в server action (defense in depth).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Полный `npx vitest run` (все 100 тест-файлов) выявил 44 упавших теста в 12 файлах, НЕ относящихся к finance-weekly (`wb-sync-route.test.ts`, `wb-token-validate.test.ts` и др.). Проверено через `git stash` — эти падения ПРЕДСУЩЕСТВУЮЩИЕ, воспроизводятся без правок этого плана. Задокументированы в `.planning/quick/260714-gff-wb-per/deferred-items.md`, НЕ исправлялись (вне scope). Целевой прогон плана (`finance-weekly-engine` + `finance-weekly-jem-option` + `finance-weekly-snapshot`) зелёный: 43/43. `npx tsc --noEmit` чист.

## Next Phase Readiness

Опция Джема готова к использованию: после деплоя MANAGE-пользователь задаёт ставку в шапке /finance/weekly (или полагается на default 0.75), комиссии обоих сценариев недели 06.07–12.07 должны совпасть с Excel экономиста (ручная сверка — следующий шаг пользователя после деплоя). Blocking: нет.

## Self-Check: PASSED

All created/modified files verified present on disk; both task commits (87e8823, 7c9c5e3) verified in git log.

---
*Phase: quick-260714-gff*
*Completed: 2026-07-14*
