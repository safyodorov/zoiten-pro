---
phase: 10-chat-autoreply
plan: 02
subsystem: api
tags: [sync, chat, auto-reply, cron, prisma, wb-api, vitest, typescript]

requires:
  - phase: 10-01
    provides: WB Chat API client (listChats/getChatEvents/sendChatMessage/downloadChatAttachment), AutoReplyConfig singleton, SupportTicket.chatReplySign + customerNameSnapshot, SupportMessage.wbEventId @unique, MediaType.DOCUMENT
  - phase: 08-support-mvp
    provides: syncSupport + supportTicket/supportMessage/supportMedia base models, downloadMediaBatch
  - phase: 09-returns
    provides: syncReturns + dual-API pattern, backward-compat spread shape
provides:
  - lib/support-sync.ts syncChats — Phase B listChats upsert + Phase A cursor events + download queue
  - lib/auto-reply.ts runAutoReplies + isWithinWorkingHours helper (Europe/Moscow, ISO 8601 weekdays 1..7)
  - app/api/cron/support-sync-chat GET endpoint (5 мин, x-cron-secret)
  - app/api/support-sync POST backward-compat shape расширен chat + autoReply полями
  - AppSetting cursor "support.chat.lastEventNext" для идемпотентного инкрементального pull
affects:
  - Plan 10-03 — ChatReplyPanel будет читать SupportMessage уже идемпотентно синхронизированные
  - Plan 10-04 — deploy.sh должен: (1) применить миграцию Phase 10-01, (2) добавить systemd timer 5 мин для /api/cron/support-sync-chat

tech-stack:
  added: []
  patterns:
    - "AppSetting KV для cursor persistence (support.chat.lastEventNext — number в миллисекундах)"
    - "Идемпотентный upsert events через supportMessage.findUnique({where:{wbEventId}}) → continue"
    - "Phase B (chats) + Phase A (events) последовательный pull — chat metadata перед событиями, иначе isNewChat race"
    - "DOWNLOAD_ID:{id} placeholder в supportMedia.wbUrl до скачивания; updateMany after download → localPath"
    - "Партийное падение в POST /api/support-sync: try/catch per-phase → graceful fallback {errors: [...]}"
    - "Timezone-aware isWithinWorkingHours через toLocaleString({timeZone}) + getDay/getHours в локальной дате"
    - "Dedup chat 24h: findMany recent messages → skip если был OUTBOUND isAutoReply=true ИЛИ manual OUTBOUND после INBOUND"

key-files:
  created:
    - lib/auto-reply.ts
    - app/api/cron/support-sync-chat/route.ts
  modified:
    - lib/support-sync.ts
    - app/api/support-sync/route.ts
    - tests/support-sync-chats.test.ts
    - tests/auto-reply-cron.test.ts

key-decisions:
  - "AppSetting ключ 'support.chat.lastEventNext' (не новая таблица) — cursor paginаcии WB Chat events хранится как string number в KV store Phase 7"
  - "CHAT_MAX_PAGES=20 guard против infinite loop при баге WB API (не уменьшение events.length с each page)"
  - "Инициализация cursor = undefined при первом запуске (не 0) — WB API интерпретирует отсутствие next как from-beginning"
  - "Fallback 'покупатель'/'товар' при null customerNameSnapshot/nmId — никогда не отправлять {имя_покупателя} буквально покупателю"
  - "sentAt > lastInbound.sentAt сравнение через getTime() — Date объекты из Prisma сравниваются корректно, но явный getTime() защищает от потенциальных edge cases string vs Date"
  - "Партийное падение в POST /api/support-sync — try/catch per-phase обязателен: WB 403 (scope bit 9 не выдан на проде) не должен ломать feedbacks sync"
  - "vi.resetModules() перед doMock('@/lib/support-sync') в cron тесте — без этого syncChats import захвачен первым вызовом"

requirements-completed: [SUP-07, SUP-25]

duration: 20min
completed: 2026-04-18
---

# Phase 10 Plan 02: Sync + AutoReply Cron Summary

**WB Chat sync (Phase B listChats upsert + Phase A cursor events) + локальный auto-reply cron с Moscow-TZ working hours + 24h dedup + backward-compat расширение POST /api/support-sync**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3
- **Files modified:** 4
- **Files created:** 2

## Accomplishments

- **syncChats()** в `lib/support-sync.ts` — полный цикл синхронизации Buyer Chat:
  - Phase B: `listChats()` → upsert SupportTicket channel=CHAT по composite unique с обновлением `chatReplySign`/`customerNameSnapshot`/`previewText`/`lastMessageAt`/`nmId`
  - Phase A: `while` loop с cursor (`getLastEventNext` из AppSetting) → `getChatEvents(cursor)` → идемпотентный create SupportMessage по `wbEventId @unique`, sender→direction mapping (client→INBOUND, seller→OUTBOUND)
  - Attachments: `images[]` → SupportMedia IMAGE, `files[]` → SupportMedia DOCUMENT с placeholder `wbUrl = "DOWNLOAD_ID:{id}"`
  - Download queue после Phase A: `downloadChatAttachment(id)` → `fs.writeFile(/var/www/zoiten-uploads/support/{ticketId}/{messageId}/{filename})` → `updateMany localPath + sizeBytes`
  - Rate-limit safety: `sleep(1000)` между страницами и downloads (WB лимит 10/10sec)
  - Guards: `CHAT_MAX_PAGES=20`, `events.length < 100 → break`, errors.push вместо throw (cron-safe)
- **runAutoReplies()** в новом `lib/auto-reply.ts`:
  - `isWithinWorkingHours(config, now)` — чистый timezone-aware helper через `toLocaleString({timeZone})`
  - ISO 8601 weekdays: JS `getDay()` (0=Sun..6=Sat) → `isoDay = jsDay === 0 ? 7 : jsDay`
  - Guards: `!isEnabled` → skip, внутри рабочих часов → skip, `!config` → error
  - Dedup 24h per ticket: `findMany({sentAt: {gte: cutoff}})` → skip если any `isAutoReply=true` или any OUTBOUND после последнего INBOUND
  - Substitution: `{имя_покупателя}` ← `customerNameSnapshot ?? "покупатель"`, `{название_товара}` ← `WbCard.name ?? "товар"`
  - Send: `sendChatMessage({replySign, message})` + `supportMessage.create({direction: "OUTBOUND", isAutoReply: true})`
- **GET /api/cron/support-sync-chat** — новый cron endpoint (5 мин, расписание добавит Plan 10-04 в `deploy.sh`):
  - `x-cron-secret` header auth (паттерн Phase 8/9)
  - Последовательный вызов `syncChats()` → `runAutoReplies()`
  - JSON response `{ok, chat, autoReply}`; 500 при неожиданном throw
- **POST /api/support-sync** — расширен:
  - После `syncSupport + syncReturns` вызваны `syncChats` + `runAutoReplies` последовательно
  - Try/catch per-phase → партийное падение не ломает 200
  - Backward compat: spread `...supportResult` ПЕРВЫМ → Phase 8 `SupportSyncButton.tsx` читает `feedbacksSynced/questionsSynced/mediaSaved` без изменений
  - Расширенные поля: `chat`, `autoReply`, объединённый `errors`, `synced` включает chat counts
- **Integration тесты**:
  - `tests/support-sync-chats.test.ts` — 7 GREEN (in-memory Prisma + mock wb-support-api + node:fs): Phase B create ticket, update chatReplySign, direction mapping, идемпотентность wbEventId, isNewChat autocreate, IMAGE/DOCUMENT media, AppSetting cursor persist
  - `tests/auto-reply-cron.test.ts` — 9 GREEN: isEnabled=false / workhours / config missing guards, happy path + substitution, fallback покупатель/товар, dedup 24h isAutoReply=true, skip при manual reply, cron 401 без secret, cron 200 с валидным secret

## Task Commits

1. **Task 1 — syncChats + 7 integration tests**: `3159179` (feat)
2. **Task 2 — runAutoReplies + cron endpoint + 9 tests**: `642eb73` (feat)
3. **Task 3 — POST /api/support-sync расширение**: `b08b94a` (feat)

## Files Created/Modified

### Created

- `lib/auto-reply.ts` — новый модуль (~145 строк): `runAutoReplies()` + `isWithinWorkingHours()` helper + `AutoReplyResult` тип.
- `app/api/cron/support-sync-chat/route.ts` — GET endpoint (~25 строк): `x-cron-secret` auth + syncChats + runAutoReplies sequential вызов.

### Modified

- `lib/support-sync.ts` — +`syncChats()` (~200 строк): Phase B + Phase A + download queue + `getLastEventNext/setLastEventNext` через AppSetting. Добавлены импорты `node:fs/path`, `listChats/getChatEvents/downloadChatAttachment` из wb-support-api. Существующие `syncSupport`/`syncReturns` не тронуты.
- `app/api/support-sync/route.ts` — +импорты syncChats/runAutoReplies, +try/catch per-phase, +`chat`/`autoReply` поля, обновлён `synced` подсчёт, расширен `errors` union. Backward compat spread `...supportResult` первым сохранён.
- `tests/support-sync-chats.test.ts` — заменён Wave 0 stub (6 it.skip) → 7 integration GREEN.
- `tests/auto-reply-cron.test.ts` — заменён Wave 0 stub (7 it.skip) → 9 integration GREEN.

## Decisions Made

- **AppSetting ключ `support.chat.lastEventNext`** — не отдельная таблица cursor'а. Cursor — это WB API `next` timestamp (ms). Сохраняется как строка в `AppSetting.value`. Генерический KV store Phase 7 используется повторно.
- **Phase B + Phase A в одном syncChats()** — последовательно, не параллельно. Phase B обновляет ticket metadata (chatReplySign ротируется WB) перед Phase A event ingestion, чтобы новые OUTBOUND могли сразу использовать актуальный sign.
- **Партийное падение в POST /api/support-sync** — обязательный паттерн: WB Chat API requires scope bit 9, который НЕ выдан на проде (blocker Plan 10-04 user setup). Try/catch per-phase возвращает graceful `chatResult.errors` без 500, сохраняя feedbacks/questions/returns результаты.
- **Dedup per ticket через `recent.some(isAutoReply === true)`** — простая JS-фильтрация findMany результата. Альтернатива (raw SQL с DISTINCT ON) не нужна — количество CHAT тикетов с lastMessageAt ≥ 24ч ограничено (десятки-сотни), а не десятки тысяч.
- **Fallback строки 'покупатель'/'товар'** — не переводимые сейчас (русский русскому), но вынесены в одну точку (`??` expression) — будущая i18n сможет подставить `config.fallbackName`/`config.fallbackProduct`.
- **vi.resetModules() перед cron 200 тестом** — важно для `doMock("@/lib/support-sync")`: первый `import("@/lib/auto-reply")` в предыдущих тестах захватывает реальный support-sync в module cache. Reset решает.

## Deviations from Plan

None — plan executed exactly as written.

Small enhancements:
- Тесты увеличены: 7 GREEN (план ≥6) для syncChats, 9 GREEN (план ≥7) для auto-reply — добавлены тесты fallback 'покупатель'/'товар' и manual reply skip, которые усиливают контракт.

## Issues Encountered

- **`npm run test` локально падает** — known issue (std-env 4.x ESM vs vitest 4.x cjs require) из Plan 10-01. Проверено: `npx tsc --noEmit` clean, `npm run build` clean. Тесты прогонятся на VPS в Plan 10-04 deploy.
- **Prisma миграция** — применяется на VPS в Plan 10-04 (Phase 10 паттерн). Локально БД нет, все unit-тесты используют in-memory mock state.

## Deferred Issues

None.

## Cron Schedule (для Plan 10-04 deploy.sh)

```cron
*/5 * * * * curl -s -H "x-cron-secret: $CRON_SECRET" http://localhost:3001/api/cron/support-sync-chat > /var/log/zoiten-chat-sync.log 2>&1
```

Либо systemd timer в паттерне Phase 8 `zoiten-support-sync.timer`:

```ini
# /etc/systemd/system/zoiten-chat-sync.timer
[Unit]
Description=Zoiten Chat Sync (5 min)

[Timer]
OnCalendar=*:0/5
Persistent=true

[Install]
WantedBy=timers.target
```

## User Setup Required

**Для Plan 10-04 deploy (унаследовано из Plan 10-01):**

- `WB_CHAT_TOKEN` в `/etc/zoiten.pro.env` — scope bit 9 «Чат с покупателями». **BLOCKER**: без этого токена `syncChats()` вернёт `errors: [...]`, но 200 ответа не сломает. `runAutoReplies()` пропустит все тикеты (chatReplySign null).
- `CRON_SECRET` в `/etc/zoiten.pro.env` — уже есть из Phase 8/9.
- Миграция `20260418_phase10_chat_autoreply/migration.sql` применится через `prisma migrate deploy` в `deploy.sh`.

## Next Phase Readiness

- **Plan 10-03 (ChatReplyPanel UI)** — может стартовать немедленно. SupportMessage уже идемпотентно синхронизируется, `isAutoReply=true` badge может отображаться в UI.
- **Plan 10-04 (settings UI + deploy)** — cron endpoint готов, нужно только systemd timer в `deploy.sh` + live UAT на VPS.

## Self-Check: PASSED

Verified:
- `lib/support-sync.ts` exports: `syncChats` ✅, использует `channel: "CHAT"` ✅, `chatReplySign` ✅, `wbEventId` ✅, `support.chat.lastEventNext` ✅, `DOCUMENT` ✅, `downloadChatAttachment` ✅, `isNewChat` ✅.
- `lib/auto-reply.ts` exports: `runAutoReplies` ✅, `isWithinWorkingHours` ✅, `AutoReplyConfig` import ✅, `{имя_покупателя}` substitution ✅, `{название_товара}` substitution ✅, `isAutoReply: true` ✅, `id: "default"` ✅.
- `app/api/cron/support-sync-chat/route.ts` exists ✅, `x-cron-secret` ✅, `syncChats` ✅, `runAutoReplies` ✅.
- `app/api/support-sync/route.ts`: `syncChats` ✅, `runAutoReplies` ✅, `chat:` ✅, `autoReply:` ✅, `requireSection("SUPPORT", "MANAGE")` ✅, `...supportResult` ✅.
- `grep -c "it(" tests/support-sync-chats.test.ts` = 7 ✅ (план ≥6).
- `grep -c "it(" tests/auto-reply-cron.test.ts` = 9 ✅ (план ≥7).
- `npx tsc --noEmit` clean ✅.
- `npm run build` clean ✅.
- Commits exist: `3159179` ✅, `642eb73` ✅, `b08b94a` ✅.

---
*Phase: 10-chat-autoreply*
*Completed: 2026-04-18*
