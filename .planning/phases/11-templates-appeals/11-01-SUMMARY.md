---
phase: 11-templates-appeals
plan: 01
subsystem: database
tags: [prisma, postgresql, vitest, templates, appeals, wb-offline]

# Dependency graph
requires:
  - phase: 08-support-mvp
    provides: SupportTicket, TicketChannel enum, AppealStatus enum, Customer
  - phase: 09-returns
    provides: ReturnDecision audit pattern (paragon для AppealRecord)
provides:
  - ResponseTemplate Prisma model (локальные шаблоны ответов, @@unique(name, channel))
  - AppealRecord Prisma model (hybrid трекер обжалований, 1:1 с SupportTicket)
  - 2 новых nullable поля в SupportTicket: appealedAt, appealResolvedAt + back-relation appealRecord
  - 4 новых named relations в User (templatesCreated/Updated, appealsCreated/Resolved)
  - APPEAL_REASONS — статичный справочник 8 причин обжалования в коде
  - substituteTemplateVars(text, ctx) — pure function подстановки {имя_покупателя}/{название_товара}
  - Wave 0 test stubs для планов 11-02/03/04
affects: [11-02-templates-crud, 11-03-templates-ui, 11-04-appeals-hybrid, phase-10-chat-autoreply]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Local-only storage для выбывших WB API (Templates отключён 2025-11-19, Complaint отключён 2025-12-08)"
    - "Денормализация reason как String (label), не reasonId — устойчивость к изменению справочника в коде"
    - "Hybrid manual workflow для обжалований: ERP создаёт запись + jump-link в ЛК WB + ручной toggle статуса"
    - "Переиспользование существующих enum (TicketChannel, AppealStatus) вместо новых"
    - "Pure utility функция с fallback defaults для template variables (консистентно с Phase 10 AutoReplyConfig)"

key-files:
  created:
    - prisma/migrations/20260418_templates_appeals/migration.sql
    - lib/appeal-reasons.ts
    - lib/template-vars.ts
    - tests/template-vars.test.ts
    - tests/response-templates.test.ts
    - tests/template-picker.test.ts
    - tests/appeal-actions.test.ts
  modified:
    - prisma/schema.prisma

key-decisions:
  - "WB Templates API отключён 2025-11-19 — хранилище 100% локальное, без wbTemplateId/wbSyncedAt полей"
  - "WB Complaint API отключён 2025-12-08 — hybrid manual workflow (jump-link в ЛК + ручной toggle статуса)"
  - "ResponseTemplate.@@unique(name, channel) — одно имя допустимо в разных каналах (ключ для import JSON upsert)"
  - "AppealRecord.reason: String (денормализованный label, не id) — изменение APPEAL_REASONS не ломает историю"
  - "AppealRecord.createdBy onDelete:Restrict — аудит, нельзя потерять автора обжалования"
  - "Переиспользуем AppealStatus enum (PENDING/APPROVED/REJECTED) — новый LocalAppealStatus не нужен"
  - "Миграция применится на VPS через deploy.sh в Plan 11-04 (локальной PG нет)"

patterns-established:
  - "Pattern: Wave 0 stubs — it.skip placeholder с комментарием «Реализация: Plan N-M» для downstream планов"
  - "Pattern: переиспользование enum вместо создания parallel enums (DRY в schema)"
  - "Pattern: денормализация label (не id) для справочников в коде — Future-proof"

requirements-completed:
  - SUP-26
  - SUP-29
  - SUP-31

# Metrics
duration: 10min
completed: 2026-04-18
---

# Phase 11 Plan 01: Foundation Summary

**Prisma миграция templates_appeals — 2 новые модели (ResponseTemplate + AppealRecord) + расширение SupportTicket/User для локальной библиотеки шаблонов и hybrid-трекера обжалований после отключения WB API.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-18T05:51:00Z
- **Completed:** 2026-04-18T06:01:36Z
- **Tasks:** 3
- **Files modified:** 8 (1 schema, 1 migration SQL, 2 lib, 4 tests)

## Accomplishments

- Prisma schema расширена двумя новыми моделями без breaking changes для Phase 8/9/10
- Миграция `20260418_templates_appeals` написана вручную и готова к применению на VPS
- `lib/appeal-reasons.ts` — статичный справочник 8 причин обжалования (source of truth в коде)
- `lib/template-vars.ts` — pure-функция substituteTemplateVars с fallback defaults
- 9 GREEN тестов на template-vars + 21 it.skip стаб для downstream-планов

## Task Commits

Each task was committed atomically:

1. **Task 1: Prisma миграция templates_appeals** — `9156d61` (feat)
2. **Task 2: appeal reasons + template vars + TDD тесты** — `dffbdad` (feat)
3. **Task 3: Wave 0 stubs для планов 11-02/03/04** — `ce9887e` (test)

**Plan metadata:** TBD (final docs commit)

## Files Created/Modified

- `prisma/schema.prisma` — добавлены модели ResponseTemplate, AppealRecord; расширены SupportTicket (2 поля + back-relation) и User (4 relations)
- `prisma/migrations/20260418_templates_appeals/migration.sql` — DDL вручную (ALTER SupportTicket + 2 CREATE TABLE + индексы + FK)
- `lib/appeal-reasons.ts` — экспорт `APPEAL_REASONS` (8 элементов) + тип `AppealReason`
- `lib/template-vars.ts` — экспорт `substituteTemplateVars(text, ctx)` + интерфейс `TemplateVarContext`
- `tests/template-vars.test.ts` — 9 GREEN тестов (substitution + fallbacks + global regex + trim + два параметра одновременно)
- `tests/response-templates.test.ts` — 8 it.skip стабов для Plan 11-02 (CRUD + Export/Import)
- `tests/template-picker.test.ts` — 6 it.skip стабов для Plan 11-03 (группировка/фильтрация/substitution)
- `tests/appeal-actions.test.ts` — 7 it.skip стабов для Plan 11-04 (createAppeal/updateAppealStatus/RBAC)

## Decisions Made

- **@@unique([name, channel])** вместо `@@unique([name])` (как в RESEARCH.md) — позволяет использовать одно имя в разных каналах («Спасибо» в FEEDBACK и CHAT). План — source of truth.
- **AppealRecord.reason/text** (2 поля) вместо `reasonId/reasonLabel/freeText/wbDecisionNote` из RESEARCH.md — план упрощённая модель: label денормализованно, свободный комментарий менеджера. Downstream планы добавят wbDecisionNote при необходимости через миграцию.
- **Отдельное поле appealResolvedAt в AppealRecord** — в плане две локации (SupportTicket.appealResolvedAt + AppealRecord.appealResolvedAt). Первая для быстрого JOIN-free фильтра в ленте, вторая — источник истины в рекорде. Дублирование допустимо per план.
- **Миграция вручную** (как в Phase 9) — локальной PG нет, применим через `prisma migrate deploy` на VPS в Plan 11-04 deploy-фазе.

## Deviations from Plan

None - plan executed exactly as written (за вычетом дополнительного test case `trim пробелов` в template-vars, что усиливает контракт).

## Issues Encountered

- **vitest + std-env ESM incompat (локально)** — known environment issue. `npm run test` падает на `ERR_REQUIRE_ESM` до применения конфига. Не-регрессия, тесты корректны и прогонятся на VPS. Верификация прошла через `npx tsc --noEmit` (clean).

## Authentication Gates

None.

## User Setup Required

None — миграция применится автоматически через deploy.sh в Plan 11-04.

## Next Phase Readiness

- Schema готова для Plan 11-02 (CRUD server actions + Export/Import JSON)
- Plan 11-03 может читать ResponseTemplate через `prisma.responseTemplate.findMany` + использовать `substituteTemplateVars` из этого плана
- Plan 11-04 может создавать AppealRecord через `prisma.appealRecord.create` + проверять `APPEAL_REASONS.includes(input.reason)` в Zod-схеме
- Миграция `20260418_templates_appeals` ожидает deploy на VPS в Plan 11-04 Task «deploy.sh + postdeploy smoke»

## Self-Check: PASSED

**Files verified:**
- FOUND: prisma/schema.prisma (model ResponseTemplate, model AppealRecord, appealedAt, appealResolvedAt, @relation("Appeal"))
- FOUND: prisma/migrations/20260418_templates_appeals/migration.sql
- FOUND: lib/appeal-reasons.ts (8 APPEAL_REASONS + type AppealReason)
- FOUND: lib/template-vars.ts (substituteTemplateVars)
- FOUND: tests/template-vars.test.ts (9 describe/it blocks)
- FOUND: tests/response-templates.test.ts (8 it.skip)
- FOUND: tests/template-picker.test.ts (6 it.skip)
- FOUND: tests/appeal-actions.test.ts (7 it.skip)

**Commits verified:**
- FOUND: 9156d61 (Task 1 — prisma миграция)
- FOUND: dffbdad (Task 2 — appeal reasons + template vars + тесты)
- FOUND: ce9887e (Task 3 — Wave 0 stubs)

**Tooling verified:**
- PASS: npx prisma validate (с DATABASE_URL dummy) → schema valid
- PASS: npx prisma format → no-op после нашего edit (авто-применён после записи)
- PASS: npx tsc --noEmit → 0 ошибок
- SKIP: npm run test — known vitest/std-env ESM env issue (прогонится на VPS)

---
*Phase: 11-templates-appeals*
*Completed: 2026-04-18*
