---
phase: quick-260714-maz-rolling
plan: 01
subsystem: finance
tags: [finance-weekly, buyout-pct, rolling-30d, appliances, wildberries]

# Dependency graph
requires:
  - phase: quick-260714-kuh
    provides: "buyoutResolver (loadBuyoutPctRolling30dMap → BuyoutResolver.resolve) уже загружен в lib/finance-weekly/data.ts Promise.all и используется для N_std"
  - phase: quick-260714-gt7
    provides: "lib/finance-weekly/clothing-net.ts — образец pure-хелпера базиса вселенной, стиль сохранён для buyout-discount.ts"
provides:
  - "Базис бытовой техники (appliances) в /finance/weekly = недельные заказы × (rolling-% выкупа/100) — дробное H, модель экономиста (его лист H=F×коэф)"
  - "lib/finance-weekly/buyout-discount.ts — pure discountAppliancesByBuyout(rawOrders, rawRub, buyoutPct) → {qty, rub}, K-инвариант (grossPricePerUnit не меняется)"
affects: [finance-weekly-reconciliation, finance-balance, finance-cashflow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-хелпер без импортов (ноль зависимостей от prisma/next) для vitest-дружественной unit-логики — тот же паттерн, что clothing-net.ts"
    - "Переиспользование существующего резолвера из Promise.all вместо повторного load — экономит round-trip"

key-files:
  created:
    - lib/finance-weekly/buyout-discount.ts
    - tests/finance-weekly-buyout-discount.test.ts
  modified:
    - lib/finance-weekly/data.ts
    - components/finance/WeeklyFinReportTable.tsx
    - components/finance/WeeklyFinArticleDialog.tsx

key-decisions:
  - "Дисконт применяется К ОБОИМ (qty и rub) одним и тем же коэффициентом buyoutPct/100 — сохраняет grossPricePerUnit K=rub/qty инвариантным, чтобы per-unit статьи (реклама/отзывы/логистика ИУ из недельных тоталов) не искажали K"
  - "buyoutResolver — тот же инстанс, что уже используется для N_std (quick 260714-kuh); второй loadBuyoutPctRolling30dMap НЕ создан — дешёвый повторный resolve() на существующей карте"
  - "H НЕ округляется (движок линеен по qtyOrders; модель экономиста тоже дробная) — округление вносило бы искажение в K и в распределение пулов"
  - "Строка N_std (~589, buyoutResolver.resolve на weekEndISO) оставлена без изменений — минимальный аддитивный дифф, второй resolve на тот же Map дешевле рефакторинга"
  - "basisLabel в модалке заодно приведён в соответствие с фактическим базисом одежды («выкупы нетто» вместо устаревшего «выкупы» — clothing уже нетто с quick 260714-gt7), т.к. того требовал must_haves артефакт плана"

requirements-completed: [MAZ-01]

duration: 7min
completed: 2026-07-14
---

# Phase quick-260714-maz-rolling: Базис бытовой техники — выкупленные единицы (rolling-%) Summary

**Бытовая техника в `/finance/weekly` теперь считается на «выкупленных» единицах H = недельные заказы × (rolling-30d weighted % выкупа / 100) — воспроизводит лист экономиста (H = F × коэф, неделя 22.06 коэф ≈0.87), используя тот же `BuyoutResolver`, что уже подключён к N_std (quick 260714-kuh).**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-07-14T13:18:00Z (копирование плана в worktree)
- **Completed:** 2026-07-14T13:25:18Z
- **Tasks:** 2 (2 completed)
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- `lib/finance-weekly/buyout-discount.ts` — новый pure-хелпер `discountAppliancesByBuyout(rawOrders, rawRub, buyoutPct)`, ноль импортов (как `clothing-net.ts`), 4 unit-теста (K-инвариант, no-op при 100%, дробное без округления, zero-guard) — все зелёные
- `lib/finance-weekly/data.ts`: appliances-ветка кандидатного цикла дисконтирует `qty`/`rub` через хелпер, переиспользуя существующий `buyoutResolver` из `Promise.all` (второго `loadBuyoutPctRolling30dMap` НЕТ); clothing-ветка не тронута; комментарии (шапка, инлайн у цикла, `qtyOrders`) актуализированы под quick 260714-maz
- `components/finance/WeeklyFinReportTable.tsx`: `UNIVERSE_BASIS.appliances` = «по заказам × % выкупа»
- `components/finance/WeeklyFinArticleDialog.tsx`: добавлен `qtyFmt` (`Intl.NumberFormat`, до 1 знака) — обе подстановки `qtyOrders` больше не рендерят сырой float; `basisLabel` актуализирован («заказы × %выкупа» / «выкупы нетто»)
- Downstream-эффект дисконта проверен по коду: `K = rub/qty` (сохраняет валовую цену/ед), `applBase` (Σ K×qtyOrders — база распределения пулов), `logisticsIuPerUnit(deliveryRub, qty)` — все три используют уже дисконтированный `qty` из `candidates` → недельные ТОТАЛЫ (реклама/отзывы/логистика-ИУ/пулы) не искажаются, распределяются пропорционально на выкупленные единицы
- `engine.ts` / `types.ts` / `plan-fact.ts` не тронуты (diff-guard подтверждён — пустой `git diff --stat` на engine.ts)

## Task Commits

Each task was committed atomically:

1. **Task 1: Хелпер дисконта + wiring в data.ts (appliances H = заказы × %выкупа)** - `edf83fe` (feat)
2. **Task 2: Отражение базиса в UI (бейдж таблицы + модалка)** - `58cddb2` (feat)

**Plan metadata:** (создаётся этим же execution — commit после SUMMARY.md)

## Files Created/Modified
- `lib/finance-weekly/buyout-discount.ts` - pure-хелпер `discountAppliancesByBuyout` (новый файл)
- `tests/finance-weekly-buyout-discount.test.ts` - 4 unit-теста хелпера (новый файл)
- `lib/finance-weekly/data.ts` - appliances-ветка кандидатного цикла дисконтирует qty/rub через хелпер + актуализированные комментарии (3 места)
- `components/finance/WeeklyFinReportTable.tsx` - `UNIVERSE_BASIS.appliances` текст обновлён
- `components/finance/WeeklyFinArticleDialog.tsx` - `qtyFmt` форматтер, `basisLabel` обновлён, обе подстановки `qtyOrders` обёрнуты форматтером

## Decisions Made
См. `key-decisions` во frontmatter — кратко: дисконт применяется симметрично к qty и rub (инвариант K), резолвер переиспользуется без повторного load, H не округляется, N_std строка не трогается (минимальный дифф), basisLabel одежды заодно приведён в соответствие фактическому нетто-базису.

## Deviations from Plan

None - plan executed exactly as written (аддитивный дифф ровно по 5 файлам из `files_modified`, без затрагивания engine.ts/types.ts/plan-fact.ts).

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `/finance/weekly` готов к пост-деплой UAT-сверке: для недели с известным коэф экономиста (напр. 22.06, коэф ≈0.87) проверить H строки бытовой ≈ сырые заказы × коэф, «Выручка» = ordersSumRub × коэф, «Итого затрат» водопада почти не меняется относительно до-maz (см. `<out_of_scope>` плана — только сдвиг доли per-unit статей на дисконтированный H)
- **Осознанный флаг для UAT** (задокументирован в плане, out_of_scope): после дисконта появится расхождение план/факт бытовой на ~(1−%выкупа), т.к. `plan-fact.ts` НЕ тронут (план/факт остаются на заказах). Если пользователь захочет выровнять — отдельный quick task
- Рекомендуется деплой + визуальная проверка `/finance/weekly` (бейдж «по заказам × % выкупа», модалка с дробным H)

---
*Phase: quick-260714-maz-rolling*
*Completed: 2026-07-14*

## Self-Check: PASSED

- FOUND: lib/finance-weekly/buyout-discount.ts
- FOUND: tests/finance-weekly-buyout-discount.test.ts
- FOUND: .planning/quick/260714-maz-rolling/260714-maz-SUMMARY.md
- FOUND commit: edf83fe (Task 1 — feat(quick-260714-maz))
- FOUND commit: 58cddb2 (Task 2 — feat(quick-260714-maz))
