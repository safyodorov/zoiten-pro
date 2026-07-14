---
phase: quick-260714-or9
plan: 01
subsystem: finance
tags: [finance-weekly, buyout-pct, appliances, url-toggle, drill-down-modal]

requires:
  - phase: quick-260714-maz
    provides: "discountAppliancesByBuyout — rolling-% выкупа дисконт заказов бытовой техники в /finance/weekly"
  - phase: quick-260714-kuh
    provides: "buyoutResolver (loadBuyoutPctRolling30dMap) — общий rolling-30d резолвер для H (базис) и N_std (buyoutPct)"
provides:
  - "URL-тумблер ?rawBuyout=1 в /finance/weekly (live-режим): бытовая техника при 100%-выкупе (сырые заказы, N_std buyoutPct=100) для сверки с Excel-листами экономиста"
  - "WeeklyArticleMeta.rawQtyOrders / appliedBuyoutPct — опциональный транзит недельных величин per nmId из data.ts в drill-down модалку (в обход движка)"
  - "Блок «базис количества» (3 строки) в WeeklyFinArticleDialog для бытовой техники"
affects: [finance-weekly]

tech-stack:
  added: []
  patterns:
    - "URL-driven view-only тумблер (без RBAC/revalidate) — состояние в searchParams → RSC page → client props, тот же паттерн, что и ?week="
    - "Транзит расчётных величин в drill-down модалку через optional-поля meta-объекта (не через движок/types.ts), когда движок трогать нельзя"

key-files:
  created: []
  modified:
    - lib/finance-weekly/data.ts
    - lib/finance-weekly/live.ts
    - app/(dashboard)/finance/weekly/page.tsx
    - components/finance/WeeklyFinReportControls.tsx
    - components/finance/WeeklyFinReportTable.tsx
    - components/finance/WeeklyFinArticleDialog.tsx

key-decisions:
  - "rawQtyOrders/appliedBuyoutPct транзитятся через WeeklyArticleMeta (data.ts), а НЕ через WeeklyArticleInput/types.ts — модалка получает только ArticleResult+meta, движок engine.ts не тронут, golden-тест (nmId 165967746) не затронут"
  - "WEEKLY_SNAPSHOT_VERSION не бампится — новые поля опциональны и обратно-совместимы; старые снапшоты рендерят «—» для отсутствующих полей"
  - "fixWeeklyReport вызывает loadWeeklyLiveBundle БЕЗ опций → снапшот всегда пишется в дефолтном режиме (дисконт применён); тумблер скрыт в снапшот-режиме (как редактор пулов)"

requirements-completed: [or9-A-buyout-toggle, or9-B-modal-rows]

duration: ~10min
completed: 2026-07-14
---

# Quick Task 260714-or9: Тумблер «без учёта % выкупа» + базис количества в модалке /finance/weekly Summary

**URL-тумблер `?rawBuyout=1` переводит бытовую технику в /finance/weekly на 100%-выкуп (сырые заказы) для сверки с Excel экономиста; drill-down модалка получила 3 строки разбивки количества**

## Performance

- **Duration:** ~10 min
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- `lib/finance-weekly/data.ts` — опциональный параметр `skipAppliancesBuyoutDiscount` в `loadWeeklyFinReportInputs`; при включении appliances-ветка отдаёт `qty=rawH`/`rub=rawRub` (без дисконта rolling-% выкупа) и `N_std.buyoutPct=100`; одежда не затронута ни в одной ветке
- `lib/finance-weekly/live.ts` — сквозной проброс опции в `loadWeeklyLiveBundle` (default-safe для `fixWeeklyReport`, который вызывает без опций)
- `app/(dashboard)/finance/weekly/page.tsx` — парсинг `?rawBuyout=1` из searchParams, проброс в live-вызов и в оба client-компонента (снапшот-ветка не тронута)
- `components/finance/WeeklyFinReportControls.tsx` — чекбокс «Без учёта % выкупа (бытовая)», видимый только в live-режиме (`!snapshot`); `buildWeeklyUrl` сохраняет тумблер при навигации по неделям
- `components/finance/WeeklyFinReportTable.tsx` — бейдж направления бытовой при тумблере показывает «по заказам (100% выкуп)»
- `components/finance/WeeklyFinArticleDialog.tsx` — блок «Процент выкупа (применённый)» / «Заказы за период (без корректировки)» / «Кол-во с корректировкой», только для `article.universe === "appliances"`

## Task Commits

Each task was committed atomically:

1. **Задача 1: Тумблер «Без учёта % выкупа» — данные + проброс + UI-панель + бейдж** - `562d439` (feat)
2. **Задача 2: Строки «базис количества» в модалке артикула** - `0f064a2` (feat)

## Files Created/Modified
- `lib/finance-weekly/data.ts` - Опциональный `options.skipAppliancesBuyoutDiscount`; `WeeklyArticleMeta` расширен `rawQtyOrders?`/`appliedBuyoutPct?`; appliances-ветка расчёта qty/rub разветвлена на raw (тумблер) / rolling-дисконт (дефолт); `pricingInputs.buyoutPct` (N_std) = 100 при тумблере для appliances
- `lib/finance-weekly/live.ts` - `loadWeeklyLiveBundle` принимает `options?` и пробрасывает в загрузчик
- `app/(dashboard)/finance/weekly/page.tsx` - `searchParams` типизирован с `rawBuyout?: string`; парс `rawBuyout = sp.rawBuyout === "1"`; проброс в `loadWeeklyLiveBundle` + оба live-компонента
- `components/finance/WeeklyFinReportControls.tsx` - Проп `skipAppliancesBuyoutDiscount?`; `buildWeeklyUrl(mondayISO, rawBuyout)` заменяет прежний inline-URL в `goToWeek`; новый `toggleRawBuyout`; чекбокс в тулбаре (скрыт при `snapshot`)
- `components/finance/WeeklyFinReportTable.tsx` - Проп `skipAppliancesBuyoutDiscount?`; `buildRows` принимает 5-й параметр `skipBuyout`; direction-заголовок вычисляет `basis` условно для appliances+тумблер
- `components/finance/WeeklyFinArticleDialog.tsx` - `Props.meta` расширен опциональными `rawQtyOrders?`/`appliedBuyoutPct?`; новый блок 3 строк между `DialogHeader` и таблицей разбивки, виден только для `universe === "appliances"`

## Decisions Made
- Транзит `rawQtyOrders`/`appliedBuyoutPct` через `WeeklyArticleMeta`, а не через движок (`WeeklyArticleInput`/`types.ts`/`engine.ts`) — golden-тест движка (nmId 165967746) и pure-suite не затронуты
- Версия снапшота (`WEEKLY_SNAPSHOT_VERSION`) не инкрементирована — новые поля опциональны, старые снапшоты остаются валидными (модалка показывает «—» для отсутствующих полей)
- Одежда (`clothing`) не имеет параметра «применённый % выкупа» по определению (факт нетто-выкупов без корректировки) — `appliedBuyoutPct = null`, блок в модалке для одежды не рендерится

## Deviations from Plan

None - plan executed exactly as written. Все блоки кода (сигнатуры, ветвления, JSX) реализованы точно по `<action>` каждой задачи, включая "ТОЧНЫЙ вид блока" из секции `<interfaces>`.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Изменение чисто computational (view-режим существующих LIVE-данных), деплой на прод стандартный (git push → deploy.sh).

**Деплой:** этот worktree-агент выполняется в изолированной git-ветке (`worktree-agent-a896ad0333974854d`, без upstream), созданной оркестратором отдельно от `main` — стандартный цикл «push origin main → deploy на VPS → curl проверка» из `<output>` плана **не выполнен этим агентом**: у ветки нет upstream и слияние с `main` — задача оркестратора (по аналогии с `.planning/STATE.md`, который тоже явно оставлен оркестратору). Требуется, чтобы оркестратор смержил `562d439`/`0f064a2` в `main`, запушил и задеплоил.

## Next Phase Readiness

- `/finance/weekly` готов показать тумблер сразу после мержа в `main` и деплоя — новых миграций/данных не требуется (все источники уже LIVE)
- Рекомендуемая ручная сверка после деплоя: включить тумблер на неделе со известным Excel-сопоставлением экономиста бытовой техники → qty должен совпасть с «сырыми заказами» без невыкупной надбавки
- Блокеров нет; ожидает мерж + push + deploy (см. «User Setup Required» выше)

## Self-Check: PASSED

- FOUND: lib/finance-weekly/data.ts
- FOUND: lib/finance-weekly/live.ts
- FOUND: app/(dashboard)/finance/weekly/page.tsx
- FOUND: components/finance/WeeklyFinReportControls.tsx
- FOUND: components/finance/WeeklyFinReportTable.tsx
- FOUND: components/finance/WeeklyFinArticleDialog.tsx
- FOUND: 562d439
- FOUND: 0f064a2

---
*Phase: quick-260714-or9*
*Completed: 2026-07-14*
