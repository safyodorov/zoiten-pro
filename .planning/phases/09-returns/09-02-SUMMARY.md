---
phase: 09-returns
plan: 02
subsystem: api
tags: [wb-api, returns, sync, cron, idempotency, media, vitest]

# Dependency graph
requires:
  - phase: 09-returns
    plan: 01
    provides: ReturnDecision model, 8 полей SupportTicket, lib/wb-support-api.ts listReturns, canonical fixture, Wave 0 stub tests/support-sync-returns.test.ts
provides:
  - syncReturns() — полная sync-логика RETURN канала с медиа-pipeline и pagination
  - Обновлённый POST /api/support-sync (backward-compat response shape для Phase 8 SupportSyncButton)
  - Обновлённый GET /api/cron/support-sync-reviews (Option A — единый cron для отзывов+вопросов+возвратов)
  - 5 GREEN integration тестов syncReturns с единым mock Prisma (dual-mode $transaction)
affects: [09-03-ui-list, 09-04-actions]

# Tech tracking
tech-stack:
  added: []  # вся инфраструктура уже была (Phase 8 + Wave 1)
  patterns:
    - "Единый mock Prisma с dual-mode $transaction: Array.isArray(arg) ? Promise.all(arg) : arg(prismaMock) — tx внутри callback = сам prismaMock, решает проблему tx undefined (паттерн готов к переиспользованию в 09-04)"
    - "Backward-compatible route response: spread results первым → добавляем new fields после, чтобы существующие клиенты (SupportSyncButton) продолжали читать старые поля (feedbacksSynced/questionsSynced/mediaSaved)"
    - "Защита локальных решений от sync-перезаписи: update блок upsert НЕ содержит returnState/status — Phase 9 менеджер кликнул «Одобрить» → race-condition safe"
    - "Pagination WB Claims с 600ms паузой между запросами (rate limit 10 req/6 sec) + обход обеих страниц is_archive=false/true в одном syncReturns"

key-files:
  created: []
  modified:
    - "lib/support-sync.ts"
    - "tests/support-sync-returns.test.ts"
    - "app/api/support-sync/route.ts"
    - "app/api/cron/support-sync-reviews/route.ts"
    - "tests/support-cron.test.ts"

key-decisions:
  - "Option A для cron (единый /api/cron/support-sync-reviews вместо отдельного /api/cron/returns-sync) — единый CRON_SECRET, единые логи, 15 мин достаточно для обоих каналов. Подтверждено research §8 + отсутствием отдельного cron endpoint в SUP-07"
  - "Backward-compat response shape: spread supportResult ПЕРЕД новыми полями (synced/support/returns/errors) — старые поля feedbacksSynced/questionsSynced/mediaSaved продолжают читаться SupportSyncButton.tsx Phase 8 без касаний клиента"
  - "Единый mock Prisma с dual-mode $transaction решает Warning 5 из плана — tx внутри callback равен prismaMock, поэтому findUnique/upsert внутри callback работают через те же spy-моки"
  - "Update блок upsert НЕ трогает returnState — защита от sync-race: если менеджер только что одобрил, следующий sync не затрёт его решение обратно на PENDING. Тест подтверждает контракт (2-й тест)"
  - "Phase 8 cron-тест пришлось расширить мок (syncReturns) — это Rule 3 (blocking issue): интеграция изменила сигнатуру зависимостей route.ts, старый mock Phase 8 давал undefined при await syncReturns()"

patterns-established:
  - "syncReturns pagination template для будущих WB API клиентов с rate-limit: for (offset=0; offset+=limit) { await listReturns; if (claims.length < limit) break; await sleep(600) }"
  - "Per-claim $transaction с findUnique-before-upsert для корректных счётчиков created/updated без гонок"
  - "WB //photos.wbstatic.net URL normalization: startsWith('//') → 'https:' prefix; уже-https оставить как есть"

requirements-completed:
  - SUP-17

# Metrics
duration: ~5min
completed: 2026-04-17
---

# Phase 09 Plan 02: Sync Logic Summary

**syncReturns() — идемпотентная синхронизация WB Claims → SupportTicket с медиа-pipeline, backward-compatible интеграция в POST /api/support-sync и cron, 5 GREEN integration тестов**

## Performance

- **Duration:** ~5 min
- **Completed:** 2026-04-17
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- `lib/support-sync.ts` экспортирует `syncReturns(): Promise<SyncReturnsResult>` — полная логика:
  - Пагинация `is_archive=false` + `is_archive=true` с `limit=200` + `sleep(600ms)` между запросами
  - Per-claim `$transaction` с `findUnique`-before-`upsert` для точного counter created/updated
  - `upsert` по composite unique `(channel=RETURN, wbExternalId=claim.id)` — идемпотентно
  - Update блок защищён от перезаписи `returnState`/`status` — локальные решения менеджера
  - 1 INBOUND `SupportMessage` per ticket (user_comment)
  - `SupportMedia` для photos + video_paths с `https:` префиксом (`//photos.wbstatic.net/...` → `https://...`)
  - `downloadMediaBatch` вне транзакций + `supportMedia.updateMany` для localPath/sizeBytes
  - Error collection per-claim (fail-soft — одна битая заявка не ломает весь sync)
- `POST /api/support-sync` backward-compatible response:
  - Flat `feedbacksSynced`, `questionsSynced`, `mediaSaved` (spread supportResult) → Phase 8 SupportSyncButton продолжает работать без касаний
  - Объединённый `synced` counter (support + returns)
  - Nested `support: {...}` и `returns: {...}` для новых клиентов
  - Union `errors: [...support.errors, ...returns.errors]`
- `GET /api/cron/support-sync-reviews` (Option A):
  - После syncSupport вызывается syncReturns
  - Response: `{ ok, support, returns }`
  - x-cron-secret guard сохранён
- `tests/support-sync-returns.test.ts` — 5 GREEN integration:
  1. Create SupportTicket с channel=RETURN, returnState=PENDING, wbActions, nmId
  2. Идемпотентность + returnState НЕ в update блоке (контракт защиты)
  3. SupportMedia с https: префиксом для 2 photos + 1 video
  4. Оба is_archive значения передаются в listReturns
  5. Fail-soft: ошибка одной заявки → продолжение, error collected

## Task Commits

1. **Task 1 (TDD): syncReturns() + 5 GREEN тестов** — `ffb6155` (feat)
2. **Task 2: интеграция в POST /api/support-sync + cron** — `9a5c899` (feat)

_TDD workflow для Task 1: тесты написаны первыми (5 FAIL → RED подтверждён через `TypeError: syncReturns is not a function`), затем реализация (5 PASS → GREEN). Тесты + реализация закоммичены единым коммитом (feat префикс) — паттерн 09-01 Task 2._

## Files Created/Modified

- `lib/support-sync.ts` — добавлена `syncReturns()` + `SyncReturnsResult` type + `normalizeWbUrl` helper + `fetchAllClaims` pagination helper + импорт `listReturns, Claim` из `@/lib/wb-support-api`
- `tests/support-sync-returns.test.ts` — 5 GREEN integration (заменили Wave 0 it.skip stubs)
- `app/api/support-sync/route.ts` — `syncSupport + syncReturns` + backward-compat response
- `app/api/cron/support-sync-reviews/route.ts` — расширен `syncReturns` (Option A)
- `tests/support-cron.test.ts` — mock расширен `syncReturns` (Rule 3 fix)

## Decisions Made

- **Option A cron** (единый /api/cron/support-sync-reviews, 15-мин, отзывы+вопросы+возвраты): SUP-07 перечисляет только 3 отдельных cron (chat/appeals/reviews), не отдельный returns — встраиваем в существующий reviews. Research §8 это тоже рекомендует.
- **Backward-compat spread первым** в POST response: `{ ok: true, ...supportResult, synced: ..., support: ..., returns: ..., errors: [...] }` — порядок важен, иначе наши новые поля будут перекрыты синонимами из supportResult (errors). Клиент SupportSyncButton читает `body.feedbacksSynced` — это поле из spread.
- **Update блок БЕЗ returnState/status**: защита от race-condition sync vs human action. Если менеджер кликнул «Одобрить» → returnState=APPROVED, следующий sync (через 15 мин) не должен вернуть на PENDING. Unit-test 2 это пинит через `expect(upsertCall.update).not.toHaveProperty("returnState")`.
- **Dual-mode $transaction mock pattern** для переиспользования в 09-04: `Array.isArray(arg) ? Promise.all(arg) : arg(prismaMock)` — tx внутри callback === prismaMock, все вложенные findUnique/upsert/findFirst/create работают через тот же набор spy-моков. Решает Warning 5 (tx undefined в старом наивном mock).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] Phase 8 cron-тест расширен мок syncReturns**
- **Found during:** Task 2 final `npm run test` (1 failed)
- **Issue:** `tests/support-cron.test.ts` mock для `@/lib/support-sync` содержал только `syncSupport` (Phase 8). Task 2 добавил вызов `syncReturns()` в cron route, → `await syncReturns()` резолвился в `undefined`, выполнение ломалось на деструктуризации/spread.
- **Fix:** добавил `syncReturns: vi.fn().mockResolvedValue({ synced: 0, created: 0, updated: 0, mediaDownloaded: 0, errors: [] })` в mock фабрику.
- **Files modified:** tests/support-cron.test.ts
- **Commit:** 9a5c899 (единый коммит с Task 2 — это одна логическая интеграция)

Все остальные пункты плана выполнены точно — 5 GREEN тестов, backward-compat response, Option A cron, защита returnState, pagination + медиа + https prefix.

## Issues Encountered

- **Phase 8 test regression из-за интеграции** — Rule 3 deviation (см. выше). Зафиксировал в тестовом mock.
- **`NODE_OPTIONS=--experimental-require-module`** — тот же флаг что и в 09-01 (vitest 4.1.4 на Node 20). Проект работает, обход не требуется для CI/build/production.

## Next Phase Readiness

- ✅ syncReturns готов — cron будет автоматически подхватывать новые заявки каждые 15 мин (после deploy)
- ✅ Backward-compat response — SupportSyncButton Phase 8 продолжит работать без изменений; Plan 09-03 (UI List) сможет показывать обновлённую статистику через body.returns
- ✅ Dual-mode $transaction mock паттерн готов для Plan 09-04 actions (approve/reject/reconsider) — копируется идентично
- ✅ lib/support-sync.ts exports обе функции (syncSupport + syncReturns) — интегратор по выбору

**Plan 09-03 следующим:** UI раздел возвратов (страница/таблица) — SSR-рендер через Prisma, статусные табы (PENDING/APPROVED/REJECTED/ARCHIVED), фильтры. Plan 09-04 — actions API (approve/reject/reconsider) + кнопки в UI.

**Deploy задача (Plan 09-04):**
```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"
# После рестарта: journalctl -u zoiten-erp -f → ждать следующего cron tick (15 мин)
# Проверить логи: "syncReturns synced=X created=Y updated=Z"
```

## Self-Check: PASSED

**Files verified:**
- FOUND: lib/support-sync.ts (syncReturns export)
- FOUND: tests/support-sync-returns.test.ts (5 GREEN it() — не it.skip)
- FOUND: app/api/support-sync/route.ts (syncReturns import + вызов)
- FOUND: app/api/cron/support-sync-reviews/route.ts (syncReturns import + вызов)
- FOUND: tests/support-cron.test.ts (расширен mock)

**Commits verified:**
- FOUND: ffb6155 (Task 1 — syncReturns + 5 GREEN)
- FOUND: 9a5c899 (Task 2 — integration + Phase 8 mock fix)

**Tests verified:**
- 5 GREEN in tests/support-sync-returns.test.ts (было 5 it.skip → теперь 5 it())
- 107 passed / 10 skipped / 0 failed (14 test files; 10 skipped = Plan 09-04 return-actions.test.ts stubs)
- `npx tsc --noEmit` exit 0
- `npm run build` exit 0

**Acceptance criteria verified:**
- grep -c "export async function syncReturns" lib/support-sync.ts == 1 ✓
- grep "channel: \"RETURN\"" lib/support-sync.ts — найдено ✓
- grep "returnState: \"PENDING\"" lib/support-sync.ts — в create блоке ✓
- grep "startsWith(\"//\")" lib/support-sync.ts (normalizeWbUrl) ✓
- grep -c "downloadMediaBatch" lib/support-sync.ts — 2 вызова (Phase 8 + Phase 9) ✓
- grep "is_archive" lib/support-sync.ts — обе страницы ✓
- grep -q "Array.isArray(arg)" tests/support-sync-returns.test.ts — dual-mode mock ✓
- grep -c "it(" tests/support-sync-returns.test.ts — 5 активных ✓
- grep "syncReturns" app/api/support-sync/route.ts — найдено ✓
- grep "syncReturns" app/api/cron/support-sync-reviews/route.ts — найдено ✓

---
*Phase: 09-returns*
*Completed: 2026-04-17*
