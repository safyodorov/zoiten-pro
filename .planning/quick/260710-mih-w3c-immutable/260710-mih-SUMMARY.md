---
phase: quick-260710-mih
plan: 01
subsystem: finance-weekly
tags: [finance, weekly-report, snapshot, immutable, prisma, server-actions]
requires:
  - lib/finance-weekly/data.ts (loadWeeklyFinReportInputs, WeeklyFinReportPageData)
  - lib/finance-weekly/engine.ts (computeWeeklyFinReport — НЕ изменён, diff-guard)
  - lib/finance-weekly/plan-fact.ts (loadWeeklyPlanFact)
provides:
  - model WeeklyFinReportSnapshot (одна строка на неделю, payloadJson v1)
  - lib/finance-weekly/snapshot.ts (payload v1: build/parse/version-guard + toIsoMonday, pure)
  - lib/finance-weekly/live.ts (loadWeeklyLiveBundle — общая live-композиция)
  - app/actions/finance-weekly.ts (fixWeeklyReport / unfixWeeklyReport, FINANCE MANAGE)
  - /finance/weekly режим «зафиксированная неделя» (рендер из снапшота без пересчёта)
affects:
  - app/(dashboard)/finance/weekly/page.tsx
  - components/finance/WeeklyFinReportControls.tsx
tech-stack:
  added: []
  patterns:
    - "Immutable-снапшот одной Json-строкой (в отличие от SalesPlanVersionDay — здесь один снимок, не дни×товары)"
    - "Version-guard пейлоада → live-fallback + warning-бейдж при mismatch"
    - "Серверный пересбор пейлоада в action (клиенту не доверяем)"
key-files:
  created:
    - prisma/migrations/20260710_weekly_finreport_snapshot/migration.sql
    - lib/finance-weekly/snapshot.ts
    - lib/finance-weekly/live.ts
    - tests/finance-weekly-snapshot.test.ts
  modified:
    - prisma/schema.prisma
    - app/actions/finance-weekly.ts
    - app/(dashboard)/finance/weekly/page.tsx
    - components/finance/WeeklyFinReportControls.tsx
decisions:
  - "Пейлоад v1 = результат движка + план-факт + входы (пулы/источники/константы) — всё для рендера Table+Controls+KPI без пересчёта"
  - "fakeResult в тестах собирается pure-движком computeWeeklyFinReport (не руками) — валидный WeeklyFinReportOutput без хрупкой ручной сборки"
  - "toIsoMonday вынесен в snapshot.ts; page.tsx и currentIsoMonday переведены на него (третья копия monday-нормализации устранена — plan-checker info #1)"
metrics:
  duration: 8min
  tasks: 2
  files: 8
completed: 2026-07-10
---

# Quick 260710-mih: W3c — фиксация недели /finance/weekly (immutable-снапшот) Summary

Фиксация недели понедельного фин-отчёта: одна строка WeeklyFinReportSnapshot на неделю с целым рендер-пейлоадом v1 в Json — зафиксированная неделя рендерится из снапшота без live-расчёта и не «плывёт» при изменении справочников.

## Что сделано

### Task 1 — модель + payload v1 + actions (commit `1eba6e5`)

- **prisma/schema.prisma**: `model WeeklyFinReportSnapshot` (`weekStart @db.Date @unique`, `fixedAt`, `fixedById FK User SetNull`, `payloadJson Json`) + back-relation `weeklyFinReportSnapshots` в User. Hand-written миграция `20260710_weekly_finreport_snapshot` (применится на VPS через deploy.sh; `prisma migrate dev` НЕ запускался — локального PG нет).
- **lib/finance-weekly/snapshot.ts** (pure, только `import type` из data.ts → vitest не тянет Prisma): `WEEKLY_SNAPSHOT_VERSION = 1`, `WeeklyFinReportSnapshotPayload` (articles/rollup/waterfall/meta/planFact + пулы/константы/источники), `buildWeeklySnapshotPayload` (1:1, без округлений), `parseWeeklySnapshotPayload` (version-guard: не объект / version≠1 / articles не массив → null; planFact нормализуется к null), `toIsoMonday`.
- **lib/finance-weekly/live.ts**: `loadWeeklyLiveBundle(weekStart)` — композиция live-расчёта (inputs → движок → план-факт → Record на RSC-границе), вынесена из page.tsx без изменений логики.
- **app/actions/finance-weekly.ts**: `fixWeeklyReport` (MANAGE → ISO-guard → toIsoMonday → СЕРВЕРНЫЙ loadWeeklyLiveBundle → guard «Нет данных за неделю» → clean-replace upsert c `payloadJson: payload as never`, fixedById из сессии) и `unfixWeeklyReport` (deleteMany). Оба с `revalidatePath("/finance/weekly")`.
- **tests/finance-weekly-snapshot.test.ts** (TDD, 10 тестов): roundtrip build→JSON→parse deepEqual (version 1), roundtrip с planFact null → null (не undefined), 5 version-guard кейсов, 3 кейса toIsoMonday (Ср/Пн/Вс → 2026-07-06).

### Task 2 — page.tsx + Controls (commit `bf61f21`)

- **page.tsx**: после резолва недели — `prisma.weeklyFinReportSnapshot.findUnique` (+ include fixedBy). Снапшот валиден → рендер полностью из payload (live НЕ вызывается), Controls получают `snapshot={{ fixedAtLabel (Europe/Moscow), fixedByName (firstName+lastName || name) }}`. Снапшот с чужой version → `loadWeeklyLiveBundle` + `snapshotStale={true}`. Нет снапшота → live через bundle (инлайн-композиция удалена). `force-dynamic` и RBAC-гейт сохранены.
- **Controls**: props `snapshot`/`snapshotStale`; отдельный `useTransition` (isFixPending); кнопка «Зафиксировать неделю» (live+MANAGE), emerald-бейдж «Зафиксирована {дата} · {кем}» + «Перефиксировать»/«Снять фиксацию» (снапшот+MANAGE), amber «Снапшот устарел — перефиксируйте» + «Перефиксировать» (stale+MANAGE). Пулы-редактор: `canManage && !snapshot`. «Реализация WB» видима во всех режимах (комментарий в коде: импорт не влияет на снапшот, полезна перед перефиксацией).

## Верификация

- `npx prisma generate` — ок; `npx tsc --noEmit` — чисто (после обеих задач).
- Гейтовые сьюты: 10 файлов (finance-weekly-engine/plan-fact/attribution/bank-pools/credit-accrual/realization/snapshot + pricing-math/fallback/settings) — **134/134 passed**. Полный suite не гонялся (известные чужие падения support/CRM/wb-* — вне scope).
- `git diff HEAD --quiet -- lib/finance-weekly/engine.ts` — engine.ts не изменён (diff-guard пройден после каждой задачи).
- Grep key links: `fixWeeklyReport` в Controls (4), `loadWeeklyLiveBundle` в actions (2) и page (3), `parseWeeklySnapshotPayload` в page (2), `weeklyFinReportSnapshot.upsert|deleteMany` в actions (2).
- `git push origin main` выполнен (449a788..bf61f21). **Деплой НЕ выполнялся** (решение оркестратора; миграция применится через deploy.sh).

## Deviations from Plan

### Auto-fixed / adjusted

**1. [Rule 2 - Атомарность коммитов] Явное стейджирование вместо `git add -A`**
- **Found during:** Task 1 commit
- **Issue:** в working tree находились unrelated untracked файлы параллельной quick-задачи 260710-mja (`.planning/quick/260710-mja-.../`, `tests/wb-commission-iu-parser.test.ts`) и `.claude/worktrees/` — `git add -A` затащил бы их в коммит W3c.
- **Fix:** файлы задачи стейджились явно по списку (все новые файлы включены: миграция, snapshot.ts, live.ts, тест).
- **Commits:** `1eba6e5`, `bf61f21`

**2. [Plan-checker info #1] toIsoMonday вместо локальной normalizeToIsoMonday**
- Применено: page.tsx импортирует `toIsoMonday` из snapshot.ts; `currentIsoMonday` тоже делегирует ему (поведение идентично, третья копия monday-нормализации устранена). tsc/тесты зелёные.

**3. [Минорное отклонение] fakeResult в тестах — через pure-движок**
- План допускал «минимальные объекты, удовлетворяющие типам»; `WeeklyFinReportOutput` руками собирать хрупко (ArticleResult с breakdown из 16 полей × 2 сценария) — использован `computeWeeklyFinReport` (pure, без Prisma), что типобезопасно и реалистично.

## Known Stubs

Нет — данные снапшота полностью проводятся в UI, плейсхолдеров не добавлено.

## Out-of-scope наблюдения

- Параллельная quick-задача 260710-mja (Excel-парсер wb-commission-iu) оставлена untracked в working tree — не трогалась.

## Self-Check: PASSED

- prisma/migrations/20260710_weekly_finreport_snapshot/migration.sql — FOUND
- lib/finance-weekly/snapshot.ts — FOUND
- lib/finance-weekly/live.ts — FOUND
- tests/finance-weekly-snapshot.test.ts — FOUND
- Commit 1eba6e5 — FOUND
- Commit bf61f21 — FOUND
