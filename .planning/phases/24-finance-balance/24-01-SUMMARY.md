---
phase: 24-finance-balance
plan: 01
subsystem: database
tags: [prisma, postgres, rbac, nextjs, finance]

# Dependency graph
requires:
  - phase: 23-cash
    provides: AppSetting KV pattern, ERP_SECTION checklist precedent (CASH)
provides:
  - "4 Prisma models: FinanceStockSnapshot, FinanceReceivablesSnapshot, FinanceManualAdjustment, FinanceTaxPeriodActual"
  - "2 enums: FinanceStockLocation, FinanceAdjustmentType"
  - "ERP_SECTION.FINANCE fully wired (6-point checklist)"
  - "Routes /finance/{balance,cashflow,pnl} with FinanceTabs nav"
  - "Manual migration.sql with tax-rate/cron seed in AppSetting"
affects: [24-02, 24-03, 24-04, 24-05, 24-06, 24-07, 24-08, 24-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Snapshot table without @relation to Product (survives hard-purge) — WbCardOrdersDaily pattern reused for FinanceStockSnapshot"
    - "Trailing-slash SECTION_PATHS key (/finance/) to avoid collision with public /finance-models prefix"

key-files:
  created:
    - prisma/migrations/20260702_phase24_finance/migration.sql
    - components/finance/FinanceTabs.tsx
    - "app/(dashboard)/finance/balance/page.tsx"
    - "app/(dashboard)/finance/cashflow/page.tsx"
    - "app/(dashboard)/finance/pnl/page.tsx"
  modified:
    - prisma/schema.prisma
    - lib/sections.ts
    - lib/section-labels.ts
    - components/layout/nav-items.ts
    - components/layout/section-titles.ts
    - "app/(dashboard)/dashboard/page.tsx"

key-decisions:
  - "SECTION_PATHS key uses trailing slash \"/finance/\" specifically to prevent startsWith-collision with pre-existing public /finance-models route"
  - "FINANCE dashboard card placed after SALES (plan referenced Кредиты/Банк/Банк/Касса neighbors that don't actually exist as dashboard cards)"

patterns-established:
  - "Pattern: new ERP section route prefix under existing similarly-named public route must use trailing slash key in SECTION_PATHS + regex with trailing slash in section-titles.ts"

requirements-completed: [FIN-BAL-01, FIN-BAL-02, FIN-BAL-03, FIN-BAL-04, FIN-BAL-11]

# Metrics
duration: ~10min
completed: 2026-07-03
---

# Phase 24 Plan 01: Финансовая отчётность — Баланс — Foundation Summary

**4 Prisma снапшот-модели (склад/дебиторка/корректировки/налог-факт) + ERP_SECTION.FINANCE полностью проведён по 6-точечному чеклисту + маршруты /finance/{balance,cashflow,pnl} с таб-навигацией**

## Performance

- **Duration:** ~10 min (execution only; commit span 15:09–15:12 MSK)
- **Tasks:** 3/3 completed
- **Files modified/created:** 11

## Accomplishments
- Schema валидна (`npx prisma validate` OK), клиент перегенерирован; ручная миграция с ALTER TYPE + 2 CREATE TYPE + 4 CREATE TABLE + сид ставок налогов (`finance.vatPct`, `finance.incomeTaxPct`, `finance.taxCalcStartQuarter`, `financeBalanceSnapshotCronTime`)
- Раздел FINANCE полностью проведён по чеклисту CLAUDE.md (все 6 пунктов, включая часто забываемый `SECTION_OPTIONS`)
- Подтверждено grep'ом и Node.js sanity-check'ом, что `/finance/` НЕ матчит `/finance-models` (публичный раздел не задет)
- 3 RSC-страницы + FinanceTabs; все три с `requireSection("FINANCE")`; ОДДС/ОПиУ — ComingSoon, Баланс — временный стаб под Plan 24-07

## Task Commits

1. **Task 1: Prisma-модели + миграция + сид ставок** — `3a57809` (feat)
2. **Task 2: 6-точечный чеклист проводки раздела ERP** — `966628f` (feat)
3. **Task 3: Маршруты /finance + FinanceTabs + заглушки ОДДС/ОПиУ** — `24d6358` (feat)

_Плановая пометка `<output>` "НЕ КОММИТИТЬ" в 24-01-PLAN.md/24-CONTEXT.md относится к работе до создания изолированного git-worktree; орchestrator explicitly инструктировал коммитить каждую задачу в ветку `phase-24-finance` (не main, без push) — см. примечание в разделе "Отклонения"._

## Files Created/Modified
- `prisma/schema.prisma` — enum ERP_SECTION.FINANCE, enum FinanceStockLocation/FinanceAdjustmentType, 4 модели
- `prisma/migrations/20260702_phase24_finance/migration.sql` — ручная миграция (не запускалась — нет локальной PG)
- `lib/sections.ts` — SECTION_PATHS["/finance/"] = "FINANCE"
- `lib/section-labels.ts` — SECTION_OPTIONS += FINANCE
- `components/layout/nav-items.ts` — NAV_ITEMS запись + Scale import/ICON_MAP
- `components/layout/section-titles.ts` — 3 regex-записи finance/{balance,cashflow,pnl} выше finance-models
- `app/(dashboard)/dashboard/page.tsx` — карточка «Финансовая отчётность»
- `components/finance/FinanceTabs.tsx` — таб-навигация (копия CardsTabs)
- `app/(dashboard)/finance/balance/page.tsx`, `.../cashflow/page.tsx`, `.../pnl/page.tsx` — RSC-страницы с requireSection + FinanceTabs + ComingSoon (balance = временный ComingSoon до 24-07)

## Decisions Made
- Трейлинг-слэш в ключе SECTION_PATHS — обязателен для изоляции от `/finance-models` (задокументировано в плане, подтверждено тестом).
- Карточка дашборда FINANCE размещена после SALES (следуя порядку NAV_ITEMS), т.к. упомянутые в плане соседние карточки Кредиты/Банк/Касса фактически отсутствуют в `ALL_SECTIONS` дашборда — это pre-existing gap, не в скоупе этого плана.

## Deviations from Plan

### Auto-fixed / Adjusted

**1. [Task instructions override plan `<output>` note] Коммит выполнен вопреки пометке "НЕ КОММИТИТЬ" в PLAN.md/CONTEXT.md**
- **Found during:** старт выполнения
- **Issue:** `24-01-PLAN.md` `<output>` и `24-CONTEXT.md` шапка содержат пометку пользователя "не коммитить артефакты фазы до окончания параллельной разработки" — датированную 2026-07-02, до создания изолированного worktree.
- **Резолюция:** прямые инструкции запуска этого исполнителя (созданные ПОСЛЕ этой пометки, специально для работы в изолированном `git worktree` на ветке `phase-24-finance`) явно предписывают атомарный коммит после каждой задачи именно в этот worktree-бранч, без push и без касания `main`. Изоляция через worktree — механизм, разрешающий конфликт "не мешать параллельной разработке" (main не трогается). Выполнено согласно явным, более актуальным инструкциям запуска.
- **Files modified:** н/п (процедурное решение)
- **Committed in:** все 3 коммита задач

**2. [Информационная] Карточки Кредиты/Банк/Касса на дашборде не найдены**
- **Found during:** Task 2 (п.6 чеклиста)
- **Issue:** План ссылался на «рядом с финансовыми разделами (Кредиты/Банк/Касса)» как визуальный ориентир, но `ALL_SECTIONS` в `dashboard/page.tsx` эти разделы не содержит вовсе (pre-existing, вне скоупа этого плана).
- **Fix:** карточка FINANCE добавлена после SALES, по аналогии с общим порядком в NAV_ITEMS.
- **Files modified:** `app/(dashboard)/dashboard/page.tsx`
- **Committed in:** `966628f`

---

**Total deviations:** 2 (1 процедурное — коммит-политика, 1 незначительное — размещение карточки)
**Impact on plan:** Не влияет на корректность/безопасность фундамента; оба отклонения задокументированы в тексте коммитов.

## Issues Encountered
None.

## User Setup Required
None — миграция не применялась (нет локальной PostgreSQL); применение через `deploy.sh` запланировано в Plan 24-09 (вне скоупа 24-01).

## Next Phase Readiness
- Prisma-типы 4 новых моделей доступны для последующих планов фазы (снапшот-cron, UI баланса, ручные корректировки, факт-налог)
- Раздел FINANCE полностью доступен через RBAC-тумблер в /admin/users
- Маршруты открываются; Plan 24-07 заменит стаб `/finance/balance` на полный отчёт

---
*Phase: 24-finance-balance*
*Completed: 2026-07-03*

## Self-Check: PASSED

All created files verified present on disk; all 3 task commit hashes (3a57809, 966628f, 24d6358) verified in git log.
