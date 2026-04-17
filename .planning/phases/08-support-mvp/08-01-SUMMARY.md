---
phase: 08-support-mvp
plan: 01
subsystem: database, api
tags: [prisma, postgres, wildberries, feedbacks, questions, vitest]

requires:
  - phase: 02-user-management
    provides: User модель + RBAC (User.id для assignedTo / authoredMessages)
  - phase: 04-products-module
    provides: WbCard модель с nmId (связь SupportTicket → WbCard через nmId без FK)

provides:
  - Prisma схема для всех 5 каналов поддержки (FEEDBACK/QUESTION/CHAT/RETURN/MESSENGER)
  - Типизированный WB Feedbacks+Questions API клиент с 429 retry
  - 6 пустых test stub-файлов для downstream планов 08-02/03/04

affects: [08-02-sync, 08-03-ui-list, 08-04-dialog, 09-returns, 10-chats, 11-appeals, 12-messengers]

tech-stack:
  added: []  # все зависимости уже есть (prisma, vitest, next, typescript)
  patterns:
    - "Единая модель Ticket для всех каналов поддержки (FEEDBACK/QUESTION/CHAT/RETURN/MESSENGER)"
    - "Связь с WbCard через nmId без FK (паттерн проекта — повторяется по CLAUDE.md)"
    - "WB API client pattern: getToken() + fetch + 429 retry через X-Ratelimit-Retry header"

key-files:
  created:
    - "lib/wb-support-api.ts"
    - "tests/wb-support-api.test.ts"
    - "tests/support-sync.test.ts"
    - "tests/support-cron.test.ts"
    - "tests/support-media-download.test.ts"
    - "tests/support-media-cleanup.test.ts"
    - "tests/support-badge.test.ts"
    - "tests/support-actions.test.ts"
    - "prisma/migrations/20260417_support_mvp/migration.sql"
  modified:
    - "prisma/schema.prisma"

key-decisions:
  - "wbExternalId: String? (не Int) — WB возвращает cuid-like 20-символьные Elasticsearch-строки"
  - "Composite @@unique([channel, wbExternalId]) обеспечивает идемпотентный upsert для sync"
  - "Customer создаётся в MVP без записей — WB Feedbacks/Questions API не даёт wbUserId, заполнится в Phase 12"
  - "Direction enum (INBOUND/OUTBOUND) + authorId?: null = покупатель или WB system"
  - "5 индексов на SupportTicket (status, channel, nmId, assignedToId, createdAt) для фильтров ленты"
  - "SupportMedia.expiresAt обязателен — createdAt + 1 год, cron-очистка в Plan 08-02"

patterns-established:
  - "lib/wb-support-api.ts: getToken() + callWb() helper с retry, аналогично lib/wb-api.ts но для feedbacks-api домена"
  - "Vitest fetch mock: vi.stubGlobal('fetch', vi.fn()) + mockResolvedValueOnce(mockResponse(body, status, headers))"
  - "Русскоязычные ошибки WB API: 401 → 'Неверный токен WB API', 403 → 'Нет доступа — проверьте scope токена (bit 5)'"

requirements-completed:
  - SUP-01
  - SUP-02
  - SUP-03
  - SUP-04

duration: 30min
completed: 2026-04-17
---

# Phase 08 Plan 01: Foundation Summary

**Prisma-схема для всех 5 каналов поддержки + типизированный WB Feedbacks/Questions API клиент с 429 retry + test-stubs для Plan 08-02/03/04**

## Performance

- **Duration:** ~30 мин (inline execution, без subagent)
- **Completed:** 2026-04-17
- **Tasks:** 3
- **Files created:** 8
- **Files modified:** 1 (prisma/schema.prisma)

## Accomplishments

- **Единая модель Ticket** для всех каналов поддержки (FEEDBACK/QUESTION на Phase 8 + готовые enum-значения для CHAT/RETURN/MESSENGER на Phase 9-12) — без повторных миграций
- **4 новые модели** (Customer, SupportTicket, SupportMessage, SupportMedia) + **5 новых enum** (TicketChannel, TicketStatus, AppealStatus, Direction, MediaType)
- **Обратные relations в User:** assignedTickets (SupportAssignee), authoredMessages (SupportAuthor)
- **Композитный @@unique([channel, wbExternalId])** обеспечивает идемпотентный upsert для sync в Plan 08-02
- **lib/wb-support-api.ts:** 5 методов (listFeedbacks, replyFeedback, editFeedbackAnswer, listQuestions, replyQuestion) + типы Feedback, Question, ProductDetails, FeedbackAnswer, PhotoLink, FeedbackVideo
- **10 unit-тестов GREEN:** URL/query params, Authorization header, parsing `{data: {feedbacks}}`, 429 retry, 401/403 русские ошибки, POST/PATCH body format
- **6 stub-файлов тестов** подготовлены для downstream планов (2 для 08-02 sync, 1 для 08-02 cron, 2 для 08-02 media, 1 для 08-03 badge, 1 для 08-04 actions)

## Task Commits

1. **Task 1: Prisma схема + миграция** — `7a96059` (feat)
2. **Task 2: WB Support API клиент + unit-тесты** — `9081237` (feat)
3. **Task 3: 6 test-stubs Wave 0** — `6748cd2` (test)

## Files Created/Modified

### Создано

- `lib/wb-support-api.ts` — клиент WB Feedbacks + Questions API с 429 retry, типы Feedback/Question/etc.
- `tests/wb-support-api.test.ts` — 10 unit-тестов (mock fetch)
- `tests/support-sync.test.ts` — Wave 0 stub для Plan 08-02 (integration-тесты sync)
- `tests/support-cron.test.ts` — Wave 0 stub для Plan 08-02 (cron auth)
- `tests/support-media-download.test.ts` — Wave 0 stub для Plan 08-02 (скачивание медиа)
- `tests/support-media-cleanup.test.ts` — Wave 0 stub для Plan 08-02 (cleanup cron)
- `tests/support-badge.test.ts` — Wave 0 stub для Plan 08-03 (badge счётчик NEW)
- `tests/support-actions.test.ts` — Wave 0 stub для Plan 08-04 (replyToTicket / assignTicket / updateTicketStatus)
- `prisma/migrations/20260417_support_mvp/migration.sql` — SQL миграция (CREATE TYPE × 5 + CREATE TABLE × 4 + индексы + FK)

### Изменено

- `prisma/schema.prisma` — +4 модели, +5 enum, +2 обратных relation в User

## Decisions Made

- **wbExternalId: String? (не Int):** WB возвращает 20-символьные Elasticsearch-подобные строки в `id` полях feedbacks/questions. Хранение как Int приводит к data loss.
- **Composite unique `[channel, wbExternalId]`:** поддерживает идемпотентный upsert и позволяет в будущем связать один и тот же `wbExternalId` с разными каналами (FEEDBACK vs CHAT).
- **Customer без записей в MVP:** WB Feedbacks/Questions API не даёт `wbUserId`. Модель создана заранее (чтобы не мигрировать в Phase 12), но записи не наполняются.
- **nmId без FK в SupportTicket:** паттерн проекта (CLAUDE.md §«Связи между таблицами БД» — WbCard связан с Product через nmId без FK). Избегаем Cascade-эффектов при удалении карточек WB.
- **Direction enum + authorId nullable:** различает INBOUND (покупатель) vs OUTBOUND (менеджер/WB-система). `authorId: null` в INBOUND = покупатель, в OUTBOUND = автоответ WB.
- **5 индексов на SupportTicket:** покрывают основные фильтры UI в Plan 08-03 (по статусу, каналу, артикулу товара, назначенному менеджеру, дате).

## Deviations from Plan

None — план выполнен как написан.

**Небольшое отклонение от workflow:** выполнение прошло inline (без спауна gsd-executor субагента) из-за того, что субагент ошибочно интерпретировал стандартный malware-warning системного reminder как директиву отказа. Оркестратор подтвердил, что код явно не малварь (стандартный ERP-клиент для публичного Wildberries API), и продолжил inline. На результат плана это не повлияло — все acceptance criteria выполнены.

## Issues Encountered

- `npx prisma validate` без `DATABASE_URL` падает на parse connection string. Решение: передали `DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"` для validate/generate. Локальной БД в проекте нет — миграция применится на VPS (паттерн Phase 1 decision «Migration marked pending (no local PostgreSQL)»).

## User Setup Required

**Для deploy на VPS (выполнит Plan 08-04):**

```bash
ssh root@85.198.97.89 "mkdir -p /var/www/zoiten-uploads/support/ && chown www-data:www-data /var/www/zoiten-uploads/support/"
```

**Применение миграции на VPS (выполнит Plan 08-04 в deploy.sh):**

```bash
cd /opt/zoiten-pro && npx prisma migrate deploy
```

## Next Phase Readiness

**Готово для Plan 08-02 (sync + cron):**
- Prisma модели SupportTicket/SupportMessage/SupportMedia с уникальным ключом `(channel, wbExternalId)` для идемпотентного upsert
- `lib/wb-support-api.ts` listFeedbacks / listQuestions готовы к вызову из sync-логики
- test-stubs `tests/support-sync.test.ts`, `tests/support-cron.test.ts`, `tests/support-media-*.test.ts` готовы к наполнению

**Готово для Plan 08-03 (UI лента + sidebar badge):**
- Индекс по `status` на SupportTicket → быстрый `count WHERE status = 'NEW'` для badge
- test-stub `tests/support-badge.test.ts` готов

**Готово для Plan 08-04 (диалог + server actions):**
- `replyFeedback` / `editFeedbackAnswer` / `replyQuestion` API вызовы готовы
- Direction enum + `assignedTo` / `author` relations позволяют фиксировать отправленные OUTBOUND сообщения
- test-stub `tests/support-actions.test.ts` готов

**Блокеров нет.**

---
*Phase: 08-support-mvp*
*Completed: 2026-04-17*
