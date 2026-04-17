---
phase: 08-support-mvp
plan: 02
subsystem: api, sync, cron

tags: [wildberries, sync, cron, media-download, idempotent-upsert, prisma-transaction]

requires:
  - phase: 08-support-mvp
    provides: "Plan 08-01 — Prisma модели SupportTicket/Message/Media + lib/wb-support-api.ts клиент"

provides:
  - "lib/support-sync.ts — idempotent sync WB feedbacks + questions → Prisma"
  - "lib/support-media.ts — concurrent media download + retry"
  - "POST /api/support-sync — manual sync with SUPPORT+MANAGE RBAC"
  - "GET /api/cron/support-sync-reviews — 15-min scheduled sync"
  - "GET /api/cron/support-media-cleanup — daily cleanup of expired media"
  - "AppSetting ключ support.lastSyncedAt — timestamp последней синхронизации"

affects: [08-03-ui-list, 08-04-dialog, 09-returns, 10-chats, 11-appeals]

tech-stack:
  added: []
  patterns:
    - "Idempotent upsert через composite unique (channel, wbExternalId)"
    - "Cron endpoint защищён x-cron-secret header (паттерн purge-deleted/route.ts)"
    - "Concurrent media download с retry=1, batch concurrency=5"
    - "PII-минимизация: customerId=null в Phase 8 (WB API не даёт wbUserId)"

key-files:
  created:
    - "lib/support-sync.ts"
    - "lib/support-media.ts"
    - "app/api/support-sync/route.ts"
    - "app/api/cron/support-sync-reviews/route.ts"
    - "app/api/cron/support-media-cleanup/route.ts"
  modified:
    - "tests/support-sync.test.ts (Wave 0 stub → 4 integration-теста)"
    - "tests/support-cron.test.ts (Wave 0 stub → 3 теста)"
    - "tests/support-media-download.test.ts (Wave 0 stub → 4 теста)"
    - "tests/support-media-cleanup.test.ts (Wave 0 stub → 3 теста)"

key-decisions:
  - "customerId: null в Phase 8 — WB Feedbacks/Questions API не возвращает wbUserId, Customer будет наполнен в Phase 12 (мессенджеры)"
  - "Транзакция per-item (prisma.$transaction) — изоляция failure одного ticket не ломает sync остальных"
  - "Медиа скачивается после всех транзакций — сначала создаём SupportMedia записи с localPath=null, потом downloadMediaBatch обновляет"
  - "Пагинация take=5000/10000 с break при неполной страницы — безопасно для любого объёма отзывов"
  - "Cron для chat (5 мин) и appeals (1 час) в Phase 8 НЕ создаются — появятся в Phase 10/11 (см. 08-RESEARCH.md §cron расписание)"
  - "ENOENT при fs.unlink игнорируется в cleanup — файл мог быть удалён вручную"

patterns-established:
  - "syncSupport({isAnswered?}) паттерн: листинг → per-item транзакция → пост-обработка медиа → AppSetting upsert"
  - "Cron endpoint: header check → try/catch → JSON result with {ok, ...details}"
  - "Integration test: vi.mock('@/lib/prisma') с in-memory state вместо real DB"

requirements-completed:
  - SUP-05
  - SUP-06
  - SUP-07  # partial — только FEEDBACK/QUESTION cron (chat+appeals в Phase 10-11)
  - SUP-08
  - SUP-09

duration: 20min
completed: 2026-04-17
---

# Phase 08 Plan 02: Sync & Cron Summary

**Идемпотентный sync WB Feedbacks+Questions → Prisma с медиа-загрузкой, ручной POST + cron-endpoints с защитой x-cron-secret**

## Performance

- **Duration:** ~20 мин (inline execution)
- **Completed:** 2026-04-17
- **Tasks:** 3
- **Files created:** 5 (2 lib + 3 route)
- **Files replaced:** 4 test stubs → 14 integration-тестов GREEN

## Accomplishments

- **`lib/support-sync.ts` syncSupport()** — пагинирует feedbacks/questions, делает upsert через composite unique `(channel, wbExternalId)`, создаёт INBOUND message + OUTBOUND если WB-answer.text есть, собирает медиа для батч-загрузки, обновляет `support.lastSyncedAt` в AppSetting
- **`lib/support-media.ts`** — downloadMedia с retry=1 (pause 1с), downloadMediaBatch concurrency=5 (per-item isolation)
- **Идемпотентность проверена тестом** — двойной вызов `syncSupport()` с тем же feedback не создаёт дубликатов тикетов
- **PII-минимизация** — customerId=null всегда в Phase 8 (соответствует 08-CONTEXT.md)
- **POST /api/support-sync** — ручной trigger (RBAC SUPPORT+MANAGE, maxDuration=300с)
- **GET /api/cron/support-sync-reviews** — 15-мин cron с делегированием в syncSupport
- **GET /api/cron/support-media-cleanup** — суточный cron, удаляет `expiresAt < now()` записи + файлы с диска, ENOENT игнорируется
- **14 новых тестов GREEN:** 4 integration sync, 3 cron-auth, 4 media-download, 3 media-cleanup. Полный suite `npm run test`: **76 passed + 4 skipped, 0 failed**
- **TSC `npx tsc --noEmit`** — чисто

## Task Commits

1. **Task 1: lib/support-media.ts** — `37c9107` (feat)
2. **Task 2: lib/support-sync.ts + POST /api/support-sync** — `a6d9a5a` (feat)
3. **Task 3: cron endpoints + cleanup** — `6b719c2` (feat)

## Files Created/Modified

### Создано

- `lib/support-sync.ts` — syncSupport() + SyncResult интерфейс (~270 LOC)
- `lib/support-media.ts` — downloadMedia + downloadMediaBatch (~55 LOC)
- `app/api/support-sync/route.ts` — POST handler
- `app/api/cron/support-sync-reviews/route.ts` — GET cron handler
- `app/api/cron/support-media-cleanup/route.ts` — GET cleanup handler

### Заменено (Wave 0 stubs → полные тесты)

- `tests/support-sync.test.ts` — 4 integration-теста (in-memory prisma mock)
- `tests/support-cron.test.ts` — 3 теста (401 без секрета, 401 неверный, 200 + вызов syncSupport)
- `tests/support-media-download.test.ts` — 4 теста (путь, retry×2 fail, retry recovery, batch with failure)
- `tests/support-media-cleanup.test.ts` — 3 теста (401, full cleanup, ENOENT ignored)

## Decisions Made

- **Транзакция per-item**, а не single big transaction: изоляция failure одного feedback не ломает sync остальных. Errors аккумулируются в `result.errors[]`.
- **Медиа скачивается после всех транзакций**, а не внутри: сначала создаём SupportMedia с `localPath=null`, потом batch-download и `updateMany({wbUrl, messageId})`. Это позволяет Prisma транзакциям коммититься быстро, не блокируясь на I/O.
- **customerId=null сознательно зафиксирован** в коде sync — WB Feedbacks/Questions не даёт wbUserId; Customer модель готова, но наполнится в Phase 12.
- **AppSetting.support.lastSyncedAt** — источник "последней синхронизации" для UI (Plan 08-03 может показать опционально).

## Deviations from Plan

None — план выполнен как написан.

## Issues Encountered

None.

## User Setup Required

**Cron на VPS (добавит Plan 08-04 в deploy.sh):**

```
*/15 * * * * curl -s -H "x-cron-secret: $CRON_SECRET" http://localhost:3001/api/cron/support-sync-reviews > /var/log/zoiten-support-sync.log 2>&1
0 3 * * *    curl -s -H "x-cron-secret: $CRON_SECRET" http://localhost:3001/api/cron/support-media-cleanup > /var/log/zoiten-support-cleanup.log 2>&1
```

**Env var для VPS:** `CRON_SECRET` должен быть задан в `/etc/zoiten.pro.env`. Если отсутствует — cron-запросы вернут 401.

## Next Phase Readiness

**Готово для Plan 08-03 (UI лента + sidebar badge):**
- SupportTicket наполняется через sync — UI может `findMany` с фильтрами по channel/status/nmId
- `support.lastSyncedAt` — опциональное поле для показа на странице
- `previewText` уже хранится обрезанным до 140 символов — можно рендерить без доп. обработки

**Готово для Plan 08-04 (диалог + server actions):**
- `lib/support-sync.ts` экспортирует syncSupport() — SupportSyncButton из Plan 08-04 вызывает POST /api/support-sync
- SupportMessage уже хранит INBOUND + исторические OUTBOUND — диалог покажет полную цепочку
- `lib/wb-support-api.ts` (Plan 08-01) replyFeedback / replyQuestion / editFeedbackAnswer готовы к вызову из server actions

**Блокеров нет.**

---
*Phase: 08-support-mvp*
*Completed: 2026-04-17*
