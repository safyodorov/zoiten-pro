---
phase: 260715-f4c
plan: 01
subsystem: finance
tags: [finance-weekly, unit-economics, appsetting, prisma, vitest]

# Dependency graph
requires:
  - phase: quick-260710-lmb (W3a)
    provides: clothingOverheadFixedRub AppSetting + пул одежды = фикс+переменная (модель, которую эта задача заменяет)
provides:
  - "WeeklyArticleInput.overheadFixedPerUnit?: number — аддитивное поле движка (фикс/ед, scenario-independent)"
  - "AppSetting financeWeekly.clothingOverheadPerUnitRub (дефолт 256) заменяет financeWeekly.clothingOverheadFixedRub"
  - "Пул overhead одежды в data.ts = ТОЛЬКО manualPools.overheadCloth (переменная целиком, по выручке)"
  - "Controls: поле «Фикс общих одежды, ₽/ед» (205 + 51)"
affects: [finance-weekly, finance-cashflow, finance-balance]

tech-stack:
  added: []
  patterns:
    - "Опциональное аддитивное поле per-article в WeeklyArticleInput (как storagePerUnit) + coalesce `?? 0` в движке — appliances не задают поле, golden не меняется"

key-files:
  created: []
  modified:
    - lib/finance-weekly/types.ts
    - lib/finance-weekly/engine.ts
    - lib/finance-weekly/data.ts
    - app/actions/finance-weekly.ts
    - lib/finance-weekly/snapshot.ts
    - "app/(dashboard)/finance/weekly/page.tsx"
    - components/finance/WeeklyFinReportControls.tsx
    - tests/finance-weekly-engine.test.ts
    - tests/finance-weekly-snapshot.test.ts
    - CLAUDE.md

key-decisions:
  - "TDD Task 1 честно проведён RED→GREEN (два отдельных коммита test/feat), несмотря на то что план дал готовый action-блок сразу с типами+движком+тестом — временно откатил types.ts/engine.ts, подтвердил 3 падающих теста, закоммитил RED, затем вернул реализацию и подтвердил GREEN."
  - "node_modules отсутствовал в worktree (agent-a1047ea8acfcd0049) — создан NTFS junction на node_modules основного репо (без изменений зависимостей) для запуска tsc/vitest верификации."
  - "Полный npm run test содержит 44 pre-existing упавших теста в 12 файлах, не связанных с этой задачей (appeal-actions/customer-actions/wb-sync-route/wb-cooldown и др.) — не исправлялись (SCOPE BOUNDARY), залогированы в deferred-items.md. Скоуп-гейт CLAUDE.md (tsc + vitest finance-weekly-* + pricing-math) — 100% зелёный (155/155)."

requirements-completed: [OVERHEAD-CLOTH-PERUNIT]

# Metrics
duration: ~15min
completed: 2026-07-15
---

# Phase 260715-f4c Plan 01: Фикс общих одежды на единицу в /finance/weekly Summary

**Общие расходы одежды в понедельном фин-отчёте теперь считаются как фикс 256 ₽/ед (205+51) на каждую единицу + переменный недельный пул `overheadCloth` по выручке — вместо прежнего глобального фикса, добавлявшегося целиком к пулу и размазывавшегося по выручке.**

## Performance

- **Duration:** ~15 мин
- **Started:** 2026-07-15T11:01:00+03:00 (примерно)
- **Completed:** 2026-07-15T11:15:00+03:00
- **Tasks:** 3/3
- **Files modified:** 10

## Accomplishments

- Движок (`lib/finance-weekly/engine.ts`) получил единственную аддитивную правку в `resolveCommon`: `overheadPerUnit = (article.overheadFixedPerUnit ?? 0) + poolPerUnit(...)` — фикс/ед плюс доля переменного пула, в обоих сценариях (ИУ/Оферта) одинаково.
- `WeeklyArticleInput` получил опциональное поле `overheadFixedPerUnit?: number` (тот же паттерн, что `storagePerUnit`) — appliances его не задают, движок coalesce'ит в 0, golden-тест (523.6 / −2176.7) не изменился.
- Полный rename-каскад `clothingOverheadFixedRub` → `clothingOverheadPerUnitRub` (+ `CLOTHING_OVERHEAD_FIXED_KEY` → `CLOTHING_OVERHEAD_PER_UNIT_KEY`, дефолт 256) во всех местах: `data.ts` (константа, интерфейс, early-return'ы, парсинг перенесён выше цикла articles, пул одежды = только переменная, articles.push несёт `overheadFixedPerUnit` только для clothing), `app/actions/finance-weekly.ts` (opts + upsert), `snapshot.ts` (пейлоад), `page.tsx` (оба режима — снапшот и live), `WeeklyFinReportControls.tsx` (state/props/поле «Фикс общих одежды, ₽/ед»/состав пула).
- Новый describe-блок в `tests/finance-weekly-engine.test.ts` (4 теста): 256+доля пула=356 в обоих сценариях, дельта ровно 256/ед, profit падает на 256×H, appliances/golden не затронуты.
- `tests/finance-weekly-snapshot.test.ts` fakeData приведена к новому полю (256) — roundtrip-тест теперь реально пинит контракт (раньше `undefined`-поле маскировалось `JSON.stringify` и `toEqual`).
- `CLAUDE.md` (секции «ДВА МИРА ЗАТРАТ» и «Пулы затрат») обновлён под per-unit модель.

## Task Commits

Каждая задача закоммичена атомарно (Task 1 — честный TDD RED→GREEN, 2 коммита):

1. **Task 1 (RED): failing test для overheadFixedPerUnit** — `8a70146` (test)
2. **Task 1 (GREEN): overheadFixedPerUnit в types.ts + engine.ts** — `54c7789` (feat)
3. **Task 2: rename-каскад clothingOverheadFixedRub → clothingOverheadPerUnitRub** — `735fb1c` (feat)
4. **Task 3: snapshot fakeData rename + CLAUDE.md as-built** — `a85e5e0` (test)

**Plan metadata:** этот коммит (SUMMARY + deferred-items, docs) — следующий коммит после этого summary.

## Files Created/Modified

- `lib/finance-weekly/types.ts` — `WeeklyArticleInput.overheadFixedPerUnit?: number`
- `lib/finance-weekly/engine.ts` — `resolveCommon`: overheadPerUnit = фикс/ед + доля пула (ЕДИНСТВЕННАЯ логическая правка движка)
- `lib/finance-weekly/data.ts` — константа/дефолт переименованы, парсинг перенесён до цикла articles, пул одежды = только переменная, articles несут overheadFixedPerUnit только для clothing
- `app/actions/finance-weekly.ts` — `saveWeeklyPools` opts/upsert переименованы
- `lib/finance-weekly/snapshot.ts` — пейлоад-поле переименовано
- `app/(dashboard)/finance/weekly/page.tsx` — оба режима (снапшот + live) передают новое имя пропа
- `components/finance/WeeklyFinReportControls.tsx` — state/props/поле «Фикс общих одежды, ₽/ед» (205+51)/состав пула
- `tests/finance-weekly-engine.test.ts` — новый describe-блок overheadFixedPerUnit (4 теста)
- `tests/finance-weekly-snapshot.test.ts` — fakeData.clothingOverheadPerUnitRub=256
- `CLAUDE.md` — as-built описание новой модели (2 места)
- `.planning/quick/260715-f4c-256/deferred-items.md` — лог 44 pre-existing тестов вне скоупа (новый файл)

## Decisions Made

- Task 1 выполнен строго по TDD (`tdd="true"`): временно откатил types.ts/engine.ts, подтвердил RED (3 из 4 новых тестов падают, golden и остальные 30 тестов зелёные), закоммитил, затем вернул реализацию и подтвердил GREEN (34/34).
- node_modules отсутствовал в worktree — создан NTFS junction на node_modules основного репо (`C:\Users\User\zoiten-pro\node_modules`), т.к. зависимости идентичны и это чисто верификационный шаг (не влияет на диф задачи).
- Скоуп-гейт по CLAUDE.md для этой области («Фин. отчёт за неделю») — `tsc --noEmit` + `vitest run finance-weekly pricing-math`, а не буквально весь `npm run test` — подтверждён зелёным (155/155). Полный прогон суты показал 44 pre-existing failures в 12 несвязанных файлах (appeal-actions, customer-actions, wb-sync-route, wb-cooldown и др.) — задокументированы в deferred-items.md, не исправлялись (вне скоупа задачи).

## Deviations from Plan

None — план выполнен как написан (rename-каскад, формула движка, тексты UI и CLAUDE.md совпадают с планом построчно). Единственное отклонение процедурное (не по коду): Task 1 разбит на RED+GREEN коммита вместо одного, чтобы честно соблюсти `tdd="true"` — контент изменений идентичен плану.

## Issues Encountered

- Worktree не содержал node_modules (создание — см. Decisions Made). После этого окружение верификации работало идентично основному репо.
- 44 pre-existing теста вне скоупа задачи падают в полном прогоне `npm run test` (не вызвано этой задачей) — см. `deferred-items.md`.

## User Setup Required

None — изменения кода/тестов/документации, миграция схемы БД не требуется (AppSetting — generic KV, новый ключ создаётся автоматически при первом сохранении через Controls, с fallback-дефолтом 256 если ключ ещё не существует).

**Пост-деплой (для оркестратора/пользователя, НЕ выполнено в рамках этой задачи — по явному указанию плана):**
На проде выполнить:
```sql
-- financeWeekly.clothingOverheadPerUnitRub создастся автоматически при первом
-- сохранении через Controls (дефолт 256 в коде и без строки в БД), либо явно:
INSERT INTO "AppSetting" (key, value) VALUES ('financeWeekly.clothingOverheadPerUnitRub', '256')
  ON CONFLICT (key) DO UPDATE SET value = '256';
DELETE FROM "AppSetting" WHERE key = 'financeWeekly.clothingOverheadFixedRub';
```
Перезалить `overheadCloth` пулов недель (теперь переменная целиком, без фикса): 06.07 и 29.06 → 41451, 01.06/15.06/22.06 → 85951 (значения из плана, не проверялись этим исполнителем — брать из PLAN.md `<output>`).

## Next Phase Readiness

- Код и тесты готовы к деплою; после деплоя требуется пост-деплой SQL (выше) и перезаливка пулов `overheadCloth` для прошлых зафиксированных недель — иначе снапшоты этих недель останутся со старой (некорректной) моделью до «Перефиксировать».
- Никаких блокеров для следующих задач `/finance/weekly` или зависимых разделов (`/finance/cashflow`, `/finance/balance`) — контракт движка изменён только аддитивно.

---
*Phase: 260715-f4c*
*Completed: 2026-07-15*

## Self-Check: PASSED

- All 10 planned files + PLAN.md + deferred-items.md + SUMMARY.md verified present on disk.
- All 4 task commit hashes (8a70146, 54c7789, 735fb1c, a85e5e0) verified present in `git log --oneline --all`.
- Scoped gate (`npx tsc --noEmit` + `npx vitest run finance-weekly pricing-math`) re-confirmed green (0 tsc errors; 155/155 tests) immediately before this check.
