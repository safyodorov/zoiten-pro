# Phase 10: Чат + Автоответы — Research

**Researched:** 2026-04-17
**Domain:** WB Buyer Chat API (`buyer-chat-api.wildberries.ru`), extension of Phase 8/9 модели SupportTicket/SupportMessage каналом CHAT, автоответ (локальная логика ERP без WB endpoint), multipart upload медиа, cron 5 мин
**Confidence:** HIGH (WB Chat API endpoints, bodies и rate limits верифицированы против официального Swagger WB и WBSeller SDK); **HIGH-CRITICAL (ключевое открытие)** — в WB Chat API **НЕТ dedicated auto-reply endpoint**, автоответ реализуется локально в ERP; MEDIUM (TLS fingerprint block на `buyer-chat-api` не подтверждён публичными источниками — HIGH-probability что fetch работает)

## Executive Summary

Phase 10 добавляет канал **CHAT** в существующую инфраструктуру Поддержки (Phase 8/9). Канал CHAT уже присутствует в enum `TicketChannel`; `SupportMessage.isAutoReply: Boolean @default(false)` уже есть в схеме (Plan 08-01 заложил). Требуется: (1) расширить `lib/wb-support-api.ts` 4-мя методами WB Chat API с третьим токеном `WB_CHAT_TOKEN` (scope bit 9), (2) новая функция `syncChats()` в `lib/support-sync.ts` + интеграция в отдельный cron каждые 5 мин, (3) новая Prisma модель `AutoReplyConfig` (singleton) + миграция (+1 поле для чата: `SupportTicket.chatReplySign`), (4) расширение `ReplyPanel` multipart upload (или новый `ChatReplyPanel`), (5) новая страница `/support/auto-reply` с формой настроек, (6) локальный cron автоответа (детектит inbound CHAT-сообщения вне рабочих часов и отвечает через `POST /api/v1/seller/message`).

**Критические открытия research:**

1. **❗ WB Chat API НЕ ИМЕЕТ endpoint для автоответов.** Официальный WB Swagger (`dev.wildberries.ru/en/swagger/communications`) и все известные SDK (WBSeller PHP, wildberries-sdk TS) подтверждают: API содержит ТОЛЬКО 4 метода — `ping`, `list chats`, `events`, `message` (send), плюс `download/{id}`. **Никакого `/auto-reply` POST не существует.** Следовательно SUP-24 («Синхронизировать с WB») должен быть переосмыслен: **автоответ — это ERP-local feature**, работает через cron, который отправляет `POST /api/v1/seller/message` от имени продавца вне рабочих часов. Кнопка «Синхронизировать с WB» становится симуляционной (просто сохраняет AutoReplyConfig в БД) ИЛИ переформулируется в «Сохранить настройки» — рекомендуем обсудить с пользователем в `/gsd:discuss-phase 10`.
2. **❗ Нет `chatID` как идемпотентный ключ в стиле Feedbacks.** В WB Chat API `chatID` — это **одна нить общения на покупателя**, где много сообщений (events). Для upsert мы **должны использовать `chatID` как `SupportTicket.wbExternalId`** (один ticket = один chat), и `eventID` как `SupportMessage.wbExternalId` (один event = одно сообщение). Текущая схема `SupportMessage` не имеет `wbExternalId` — **требуется миграция**.
3. **❗ `replySign` — обязательный параметр при отправке**, и его WB отдаёт в ответе `/chats` и в events. Это criptographic signature текущей сессии чата. Нужно сохранять `chatReplySign: String` на `SupportTicket` и обновлять при каждом sync (signature может ротироваться — документация не уточняет, TTL неизвестен).
4. **Scope bit = 9 (Buyers chat)**, подтверждено через dev.wildberries.ru. Это **отдельный bit от Feedbacks (bit 7)** и Returns (bit 11). На VPS в `/etc/zoiten.pro.env` текущий `WB_API_TOKEN` имеет bit 5 (Feedbacks — **NB:** CLAUDE.md говорит "Отзывы bit 5", но публичная таблица WB показывает **bit 7** для Feedbacks+Questions и **bit 5** для Statistics; это расхождение безопасно потому что Phase 8 работает — значит токен либо имеет оба bits, либо бит-нумерация в документации WB именно по категории а не по позиции). Для Phase 10 нужно **либо добавить bit 9 в существующий токен, либо завести WB_CHAT_TOKEN отдельно** (паттерн Phase 9 с WB_RETURNS_TOKEN) — **рекомендуем отдельный токен** для операционной изоляции.
5. **Multipart upload: POST /api/v1/seller/message с multipart/form-data.** Поля: `replySign` (≤255 chars), `message` (≤1000 chars), `file[]` (JPEG/PDF/PNG, **max 5 MB per file, 30 MB total**). **Ограничения по формату WB:** images — JPEG/PNG; документы — PDF. **Видео НЕ поддерживается при отправке продавцом** (пользователь отправить может, продавец через API — нет). ROADMAP SC#2 говорит «фото/видео multipart» — **видео исключаем из scope** или допускаем только JPEG/PNG, а видео только на приём.
6. **Pagination через `events` API — cursor `next`** (Unix timestamp в миллисекундах), НЕ offset. Отличается от Feedbacks/Returns. Это означает **инкрементальный sync** естественно реализуется: храним `AppSetting.key="support.chat.lastEventTs"` и при каждом cron вызове передаём его как `next`.
7. **Rate limit — 10 req / 10 sec + burst 10 req/sec.** Агрессивнее Returns (20 req/min) — нужна пауза ≥1000ms между batches. Cron раз в 5 минут × (1 list + 1 events + N downloads) ≈ 3-10 запросов за tick — укладываемся.
8. **TLS fingerprint блокировка — LOW probability для Chat API.** В отличие от `card.wb.ru/v4` (публичный storefront API, защищён от ботов → блокирует Node fetch), `buyer-chat-api.wildberries.ru` — seller API с токеновой авторизацией, паттерн как Feedbacks/Returns. Forum discussion `dev.wildberries.ru/forum/1407` показывает проблемы (503 ошибки и data quality), но **не показывает** 403/TLS block для Node fetch. **Рекомендация:** начинаем с Node fetch как в Phase 8/9; curl-fallback держим в backlog и добавляем **только если первый live call вернёт 403** (SUP-21 формулирует это как реактивный fallback, что корректно).
9. **`isAutoReply` detection.** API не даёт поле `isAutoReply` — это **ERP-local флаг**. Когда наш ERP-cron автоответчика отправляет сообщение, создаём `SupportMessage{ direction: OUTBOUND, authorId: null, isAutoReply: true }`. Когда менеджер отвечает через UI, `isAutoReply: false`. Это исключает возможность отображать автоответы от **другой системы** (если у продавца два инструмента автоответа) — но это приемлемо.
10. **Покупатель — не анонимный (в отличие от Feedbacks/Returns).** `GET /chats` возвращает `clientName` — это имя из WB. Линковка к `Customer` возможна: `wbUserId` отсутствует, но `clientName` + `chatID` можно использовать как идентификатор покупателя. **Решение:** Customer-линковку пока НЕ делаем (Phase 12), просто сохраняем `clientName` в `SupportTicket.customerNameSnapshot: String?` (новое поле) для отображения. Переменная `{имя_покупателя}` в шаблоне автоответа берётся отсюда.
11. **Переменная `{название_товара}`** в шаблоне — `goodCard.nmID` из `/chats` response. Join через `WbCard.nmId` → `WbCard.name` (существующий паттерн Phase 8).

**Primary recommendation:**

Разбить Phase 10 на **Wave 0 (infrastructure spike) + 4 плана** по аналогии с Phase 8/9.

- **Wave 0:** Live-проверка `buyer-chat-api.wildberries.ru/api/v1/seller/chats` с текущим токеном → **критический выбор**: расширить существующий токен bit 9 или ввести `WB_CHAT_TOKEN`. Подтвердить наличие/отсутствие TLS fingerprint блока (ожидается НЕТ).
- **Plan 10-01 Foundation:** Prisma миграция (AutoReplyConfig singleton + расширение SupportTicket двумя полями `chatReplySign`, `customerNameSnapshot` + расширение SupportMessage полем `wbEventId`), WB Chat API клиент (`getChatsToken` + 4 метода), unit-тесты.
- **Plan 10-02 Sync + Cron:** `syncChats()` в `lib/support-sync.ts`, новый `GET /api/cron/support-sync-chat` (5 мин), интеграция skачивания медиа через `downloadMediaBatch`, AutoReply cron-логика внутри того же route (детект inbound сообщений вне рабочих часов + отправка локального ответа с `isAutoReply=true`). Интеграция `syncChats()` в `POST /api/support-sync` (ручная кнопка).
- **Plan 10-03 UI Chat Messages:** Расширение `ReplyPanel` в `ChatReplyPanel` (multipart upload) + conditional rendering в `/support/[ticketId]`. Иконка 🤖 в SupportDialog и SupportTicketCard. Интеграция с существующей лентой (CHAT уже поддерживается в CHANNEL_OPTIONS).
- **Plan 10-04 Auto-Reply Settings + UAT:** Страница `/support/auto-reply`, форма (7 чекбоксов дней + 2 time inputs + textarea + toggle), server action `saveAutoReplyConfig`. Sidebar пункт «Автоответ» под «Служба поддержки». Human UAT на VPS.

## User Constraints (from CONTEXT.md)

> CONTEXT.md для Phase 10 не создавался (research спавнен без `/gsd:discuss-phase 10`). Ограничения выводятся из **ROADMAP.md Phase 10 goal + 5 SC**, **REQUIREMENTS.md SUP-07 addition + SUP-21..SUP-25**, и паттернов Phase 8/9.

### Locked Decisions (из ROADMAP + REQUIREMENTS — подтвердить в `/gsd:discuss-phase 10`)

- **Scope:** только WB Buyer Chat (канал CHAT). Ozon-чаты, мессенджеры — OUT OF SCOPE (Phase 12/v2).
- **Cron интервал чата:** 5 минут (SUP-07 addition) — отдельный endpoint `/api/cron/support-sync-chat`, **НЕ** в составе `support-sync-reviews` (который 15 мин).
- **WB Chat API методы в `lib/wb-support-api.ts`:** `listChats`, `getEvents(next?)` (== PRD `getMessages`), `sendMessage(replySign, text, files?)`, (+опционально `downloadFile(id)` для reuse через прокси). `getUnreadCount` в WB API не существует как отдельный метод — подсчёт делается локально по inbound SupportMessage без OUTBOUND после него.
- **curl-fallback реактивно при 403:** как описано в SUP-21 — **не пре-эмптивно**. Если первый реальный call вернёт 403, добавить execSync('curl -s ...') по паттерну `lib/wb-api.ts`.
- **Multipart upload (SUP-22):** текст + опциональные файлы (JPEG/PNG; PDF для документов; видео — на отправку НЕ поддерживается WB). Создаём `SupportMessage` с direction=OUTBOUND + `SupportMedia` per file. Локальные файлы → multipart form → WB, после успеха ответа — скачиваем свой же файл не нужно, просто сохраняем в `/var/www/zoiten-uploads/support/{ticketId}/{messageId}/` перед отправкой.
- **AutoReplyConfig (SUP-23) singleton:** `isEnabled`, `workdayStart/End` (строка `"HH:MM"`), `workDays` (Int[], где 1=Monday … 7=Sunday по ISO 8601), `messageText`, `timezone` (default `"Europe/Moscow"`), `updatedById`, `updatedAt`. Singleton — id хардкод `"singleton"` или default cuid с UNIQUE constraint на фиктивном поле (паттерн — id = `"singleton"`).
- **Кнопка «Синхронизировать с WB» на /support/auto-reply (SUP-24):** ❗ **WB API не имеет endpoint для отправки autoreply config в WB.** Значит кнопка либо (a) упразднена в пользу «Сохранить настройки» (кнопка просто сохраняет в БД), (b) симуляционная (пишет в лог/toast «Настройки обновлены локально — WB API не принимает шаблон автоответа»), (c) формулирует как «Применить настройки» (активирует cron). **Research recommendation: вариант (c)** — переформулировать UX: «Настройки применяются автоматически к входящим чатам в нерабочее время». Уточнить с пользователем в discuss-phase.
- **isAutoReply флаг (SUP-25):** новое поле уже есть в `SupportMessage` (добавлено в Phase 8 — Plan 08-01 проактивно заложил). Иконка 🤖 в UI — emoji прямо в тексте подписи или Lucide icon `Bot` или `Sparkles` (решение UI).
- **RBAC (CLAUDE.md + Phase 8):** read (рендер `/support/auto-reply`, чтение чатов) — `requireSection("SUPPORT")`; write (saveAutoReplyConfig, sendChatMessage, все cron/sync) — `requireSection("SUPPORT", "MANAGE")`.
- **Язык:** русский (CLAUDE.md).
- **Moscow timezone:** все даты в UI через `Intl.DateTimeFormat("ru-RU", {timeZone: "Europe/Moscow"})`; workday расчёт — **по timezone из AutoReplyConfig** (default Europe/Moscow, но конфигурируется).

### Claude's Discretion (research-based recommendations, подтвердить в discuss-phase)

- **Отдельный токен `WB_CHAT_TOKEN` vs добавление bit 9 в существующий `WB_API_TOKEN`** — рекомендую отдельный (паттерн Phase 9 `WB_RETURNS_TOKEN`). Плюсы: операционная изоляция, отзыв токена чата не ломает Feedbacks/Returns; минус: ещё одна переменная в `/etc/zoiten.pro.env`.
- **Отдельный cron endpoint `/api/cron/support-sync-chat` vs объединение с существующим 15-мин** — SUP-07 явно требует 5-мин для чата; разные интервалы → **обязательно отдельный endpoint** + отдельная crontab-строка на VPS.
- **Где хранить AutoReply cron логику** — внутри `syncChats()` после upsert, или отдельная функция `runAutoReplies()` вызываемая из того же route после `syncChats()`. Рекомендую: **отдельная функция** `runAutoReplies(syncResult)` в `lib/auto-reply.ts` — изолирует бизнес-логику «вне рабочих часов», легче тестировать.
- **Дедупликация автоответов:** один чат — **не более одного автоответа в сутки** (защита от спама при частых входящих). Флаг: проверить, есть ли в последние 24ч OUTBOUND message c `isAutoReply=true` → если есть, пропустить.
- **Переменная `{имя_покупателя}` fallback** — если clientName пустой (редко, но возможно), подставлять «покупатель» (строчная буква, без кавычек).
- **Компонент `ChatReplyPanel` vs расширение `ReplyPanel`** — рекомендую новый `ChatReplyPanel.tsx` (multipart + file picker + preview list) + conditional render в `/support/[ticketId]/page.tsx` (как сейчас с `ReturnActionsPanel`). Не трогаем `ReplyPanel` — он чистый textarea для Feedbacks/Questions.
- **Файл-пикер:** native `<input type="file" multiple accept=".jpg,.jpeg,.png,.pdf" />`, клиент-сайд валидация (суммарный ≤ 30 MB, каждый ≤ 5 MB, допустимые MIME).

### Deferred Ideas (OUT OF SCOPE Phase 10)

- Видео в OUTBOUND chat-сообщениях — WB API не поддерживает (только фото/PDF на отправку от продавца).
- Индикатор «печатает» в реальном времени — WB API не даёт этого события.
- Push-уведомления менеджеру о новом чат-сообщении — веб-приложение с sidebar badge достаточно для MVP.
- Merge чатов с тем же покупателем из разных каналов — Phase 12 (Customer-линковка).
- Read-receipts (галочки прочтено) — WB API не даёт.
- Редактирование/удаление отправленного сообщения — WB API не поддерживает.
- `downloadFile(id)` для прокси изображений через ERP — начинаем с прямой подстановки `wbUrl` (events возвращают публичные URL); если WB требует токен — проксируем через route handler (Phase 11+).
- AI-suggestion ответа покупателю — v2.
- Статистика автоответов — Phase 13.

## Project Constraints (from CLAUDE.md)

- **Язык:** русский в UI, комментариях, коммитах, планах.
- **Select:** native HTML `<select>`, **НЕ base-ui Select** (паттерн проекта).
- **Server Actions:** `"use server"` + `requireSection("SUPPORT", "MANAGE")` + try/catch + `revalidatePath`. Новая ручка `saveAutoReplyConfig` и `sendChatMessage` — следуют паттерну `app/actions/support.ts`.
- **Токены:** `/etc/zoiten.pro.env` → `WB_API_TOKEN` (Feedbacks+Questions) + `WB_RETURNS_TOKEN` (Returns) + **новый `WB_CHAT_TOKEN`** (Buyers chat bit 9). Systemd `EnvironmentFile` уже загружает всё из этого файла — достаточно добавить переменную.
- **Фото/PDF upload:** `/var/www/zoiten-uploads/support/{ticketId}/{messageId}/{filename}` через existing `downloadMediaBatch`-подобный патерн, только для OUTBOUND с исходящими файлами — сохраняем локально **перед** отправкой в WB (чтобы при сбое WB у нас остался файл), затем отправляем тот же файл. После успеха — `SupportMedia.localPath` уже заполнен, `wbUrl` = null или ссылка на download endpoint WB (если WB вернёт).
- **Cron secret:** `x-cron-secret` header + `process.env.CRON_SECRET` (паттерн `/api/cron/purge-deleted`).
- **Prisma singleton:** `import { prisma } from "@/lib/prisma"`.
- **vitest:** существующий `tests/` каталог (15 test files после Phase 9), паттерн `tests/wb-*-api.test.ts`.
- **GSD Workflow:** любой Edit/Write через `/gsd:execute-phase`.
- **WB v4 curl fallback pattern** (для справки, если понадобится): `lib/wb-api.ts` использует `execSync` с 20 nmIds / 3s паузой. Для Chat API такая агрессивная батчировка не нужна — 1 list запрос + 1 events запрос + send-запросы по одному.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **SUP-07 addition** | `GET /api/cron/support-sync-chat` каждые 5 мин с `CRON_SECRET`. | Новый route handler, паттерн `support-sync-reviews`; отдельный systemd timer или crontab строка на VPS. |
| **SUP-21** | WB Chat API методы `listChats`, `getMessages(chatId)`, `sendMessage(chatId, text, media)`, `getUnreadCount`. Auto-fallback на curl при 403. | [## WB Buyer Chat API](#wb-buyer-chat-api) — endpoint map. Поскольку WB даёт только `events` (global stream) а не per-chat `getMessages`, **в клиенте реализуем** `getEvents({next?, chatID?})` + локальный filter по chatID. `getUnreadCount` WB API не предоставляет — **реализуем локально** через `count({where: {direction: INBOUND, ticket: {status: NEW}}})`. curl-fallback реактивно. |
| **SUP-22** | Отправка текст + multipart медиа через UI, запись `SupportMessage` OUTBOUND + `SupportMedia`. | [## Multipart Upload](#multipart-upload) — `POST /api/v1/seller/message` с multipart/form-data; FormData native в Node 18+. |
| **SUP-23** | `AutoReplyConfig` singleton с 7 полями. | [## Data Model](#data-model) — Prisma модель с id = `"singleton"`. |
| **SUP-24** | `/support/auto-reply` форма + «Синхронизировать с WB». | [## UI Architecture](#ui-architecture) — ❗ **WB API не имеет auto-reply endpoint**, значит кнопка просто сохраняет + активирует cron. Требует обсуждения с пользователем. |
| **SUP-25** | `isAutoReply` флаг и иконка 🤖. | Поле уже есть в `SupportMessage`; UI — Lucide `Bot` icon + title tooltip «Автоответ вне рабочих часов». |

## WB Buyer Chat API

### 1. Base URL и авторизация (VERIFIED 2026-04-17)

```
Base URL:      https://buyer-chat-api.wildberries.ru
Auth header:   Authorization: <WB_CHAT_TOKEN>
Content-Type:  application/json (для GET/ping)
               multipart/form-data (для POST /message)
Token scope:   bit 9 "Buyers chat" — ⚠ ОТЛИЧАЕТСЯ от bit 5 (Statistics), bit 7 (Feedbacks+Questions), bit 11 (Buyers returns)
```

**⚠ БЛОКЕР Wave 0:** Текущие токены на VPS (`WB_API_TOKEN`, `WB_RETURNS_TOKEN`) **могут не включать bit 9**. Варианты:
1. Проверить через `seller.wildberries.ru/supplier-settings/access-to-api` — включён ли «Чат с покупателями» в одном из существующих токенов.
2. **Рекомендация:** выпустить отдельный **`WB_CHAT_TOKEN`** (scope: только Buyers chat), добавить в `/etc/zoiten.pro.env`, `systemctl restart zoiten-erp.service`.
3. Альтернатива: перегенерировать `WB_API_TOKEN` с расширенным scope (bits 1,2,3,5,7,11 + 9) — но это усложняет revocation.

Валидация scope — команда Wave 0 (на VPS):

```bash
curl -sI "https://buyer-chat-api.wildberries.ru/ping" \
  -H "Authorization: $WB_CHAT_TOKEN"
# 200 OK → scope есть; 401/403 → bit 9 не включён.
```

Источники: [Customer Communication API (dev.wildberries.ru)](https://dev.wildberries.ru/en/docs/openapi/user-communication), [WB API Swagger communications](https://dev.wildberries.ru/en/swagger/communications), [WB API token scopes (bit 9 = Buyers chat)](https://dev.wildberries.ru/en/openapi/api-information), [WBSeller/Chat.md SDK](https://github.com/Dakword/WBSeller/blob/master/docs/Chat.md).

### 2. Endpoints (полный публичный список — всего 5)

| Метод | Endpoint | Назначение |
|-------|----------|------------|
| GET | `/ping` | Health check, возвращает 200 если токен валиден |
| GET | `/api/v1/seller/chats` | Список всех чатов продавца (с `lastMessage` snapshot) |
| GET | `/api/v1/seller/events` | Глобальный stream событий (сообщений) — cursor pagination через `next` |
| POST | `/api/v1/seller/message` | **Отправить сообщение** — multipart/form-data с текстом и/или файлами |
| GET | `/api/v1/seller/download/{id}` | Скачать файл из события по `downloadID` |

❗ **НЕ СУЩЕСТВУЕТ:**
- `POST /api/v1/seller/auto-reply` — нет автоответа через API (подтверждено 3 независимыми источниками: Swagger, WBSeller SDK, forum).
- `GET /api/v1/seller/unread-count` — unread count не предоставляется.
- `GET /api/v1/seller/messages?chatID=X` — нет per-chat запроса; только global events stream с фильтрацией локально.
- `PATCH /api/v1/seller/message/{id}` — нельзя редактировать отправленные.
- `DELETE /api/v1/seller/message/{id}` — нельзя удалять.

### 3. `GET /api/v1/seller/chats` — response (VERIFIED)

```json
{
  "result": [
    {
      "chatID": "9e1b3f80-…uuid-string",
      "replySign": "base64signature==",
      "clientName": "Иван П.",
      "goodCard": {
        "nmID": 123456789,
        "price": 1990,
        "size": "M"
      },
      "lastMessage": {
        "text": "Здравствуйте, где инструкция?",
        "addTimestamp": 1713355200
      }
    }
  ],
  "errors": null
}
```

| Поле | Тип | Примечание |
|------|-----|------------|
| `chatID` | string UUID | Стабильный ID нити — **используем как `SupportTicket.wbExternalId` с channel=CHAT** |
| `replySign` | string | **Обязательный при sendMessage**; храним на тикете (`SupportTicket.chatReplySign`) |
| `clientName` | string | Имя покупателя — **единственная доступная customer info** (не wbUserId) |
| `goodCard.nmID` | int | Артикул — JOIN с `WbCard.nmId` |
| `lastMessage.text` | string | Текст последнего сообщения (превью для ленты) |
| `lastMessage.addTimestamp` | int Unix sec | `lastMessageAt` |

### 4. `GET /api/v1/seller/events` — response (VERIFIED)

```json
{
  "result": {
    "next": 1713355200123,
    "newestEventTime": "2026-04-17T12:00:00Z",
    "oldestEventTime": "2026-04-14T08:30:00Z",
    "totalEvents": 42,
    "events": [
      {
        "chatID": "9e1b3f80-…",
        "eventID": "evt-abc123",
        "eventType": "message",
        "isNewChat": false,
        "message": {
          "text": "Добрый день",
          "attachments": {
            "goodCard": { "nmID": 123456789, "price": 1990, "size": "M" },
            "files": [ { "downloadID": "file-xyz", "fileName": "doc.pdf", "fileSize": 12345 } ],
            "images": [ { "downloadID": "img-abc", "fileName": "photo.jpg", "width": 800, "height": 600 } ]
          }
        },
        "addTimestamp": 1713355123456,
        "sender": "client",
        "clientName": "Иван П."
      }
    ]
  },
  "errors": null
}
```

| Поле | Тип | Примечание |
|------|-----|------------|
| `next` | int (ms) | Cursor для следующего запроса. Храним в `AppSetting.key="support.chat.lastEventNext"` |
| `eventID` | string | Уникальный ID события — **используем как `SupportMessage.wbEventId` (новое поле)** для идемпотентного upsert |
| `sender` | `"client"` \| `"seller"` | `client` → direction=INBOUND, `seller` → direction=OUTBOUND |
| `isNewChat` | bool | true → создать новый SupportTicket если chatID не найден |
| `attachments.images[]` | array | `downloadID` → скачивание через `/api/v1/seller/download/{id}` (требует токен) |
| `attachments.files[]` | array | PDF и прочие документы |

### 5. `POST /api/v1/seller/message` — request (VERIFIED)

**Content-Type:** `multipart/form-data`

| Поле | Тип | Обязательно | Ограничения |
|------|-----|-------------|-------------|
| `replySign` | string | **да** | ≤255 символов (берём из SupportTicket.chatReplySign) |
| `message` | string | нет (если есть файлы) | ≤1000 символов |
| `file` | binary (array) | нет | JPEG/PNG/PDF, **≤5 MB each**, **≤30 MB total**, до ? файлов (лимит не документирован) |

❗ **Видео НЕ ПОДДЕРЖИВАЕТСЯ при отправке от продавца.** На приём (INBOUND) — только images и files в attachments.

**Response (200):**
```json
{
  "result": { "addTime": 1713355500, "chatID": "9e1b3f80-…" },
  "errors": []
}
```

Если `result` отсутствует и `errors` не пуст — обработать как 4xx/5xx.

### 6. Rate limits (VERIFIED, агрессивнее чем Returns)

| Period | Limit | Примечание |
|--------|-------|------------|
| 10 sec | 10 req | Базовый лимит |
| 1 sec | 10 req | Burst |

**Рекомендация:** пауза **≥1000 ms** между запросами (консервативно). Для Phase 10 cron 5-мин:
- 1 × `GET /chats` + 1 × `GET /events?next=X` + N × `GET /download/{id}` для новых media + K × `POST /message` (автоответы).
- Типичный tick: 5-15 запросов → пауза 1000ms → укладываемся в 10 sec лимит.
- 429 retry: читаем `X-Ratelimit-Retry` header (WB паттерн) → fallback sleep 10000 ms.

### 7. Error codes (из official examples)

| Code | Meaning |
|------|---------|
| 200 | OK |
| 401 | Invalid token |
| 403 | Scope bit 9 not granted |
| 202 | File under moderation (только `/download/{id}`) — обработать как «файл недоступен» |
| 451 | File moderation failed (только `/download/{id}`) — file removed by WB |
| 429 | Rate limit exceeded — retry через `X-Ratelimit-Retry` header |
| 503 | WB backend issue — retry с exponential backoff (forum 1407 подтверждает периодические 503) |

### 8. Incremental sync strategy

**Рекомендация — двухэтапная:**

1. **Phase A (каждый tick):** `GET /events?next={AppSetting.lastEventNext}` — инкрементальный pull новых событий (cursor advances). Upsert `SupportMessage` по `wbEventId`. Создать `SupportTicket` если `isNewChat=true` или chatID не найден.
2. **Phase B (каждый tick, после A):** `GET /chats` — обновить `replySign` и `lastMessage` snapshot для всех активных тикетов (replySign может ротироваться; документация TTL не упоминает, обновляем из предосторожности).

**Первый запуск** (нет `lastEventNext` в AppSetting): Phase B first → получаем все активные chats с `chatID` + `lastMessage`. Затем Phase A без `next` → получаем ВСЕ события (WB вернёт `oldestEventTime`-`newestEventTime` окно). Это разовая операция.

### 9. Pagination edge case

Если `totalEvents > limit_per_page` в ответе events, WB возвращает `next` для следующей страницы **в том же tick**. Рекомендация: цикл пока `events.length === batchSize` (как в Feedbacks), с паузой 1000ms между запросами.

### 10. `ping` endpoint — Wave 0 check

```bash
curl -sI "https://buyer-chat-api.wildberries.ru/ping" -H "Authorization: $WB_CHAT_TOKEN"
```

200 → scope OK; 401 → токен плох; 403 → нет bit 9; timeout → сеть/DNS.

## TLS Fingerprint & curl Fallback

### Риск: LOW, но возможен

**Что известно:**
- `card.wb.ru/v4/detail` (публичный storefront API) **блокирует Node.js fetch** по TLS fingerprint → ОБЯЗАТЕЛЬНО curl (документировано в `lib/wb-api.ts:319-421`, CLAUDE.md).
- `feedbacks-api.wildberries.ru`, `returns-api.wildberries.ru`, `discounts-prices-api.wildberries.ru`, `common-api.wildberries.ru`, `content-api.wildberries.ru`, `seller-analytics-api.wildberries.ru` — **работают через Node.js fetch без проблем** (Phase 7-9 verified).
- `buyer-chat-api.wildberries.ru` — seller API с токеновой авторизацией, паттерн идентичен Feedbacks/Returns → **ожидается работа Node fetch**.

**Forum evidence:** [forum/1407](https://dev.wildberries.ru/forum/1407) показывает проблемы с Chat API (503, data quality) но НЕ показывает TLS fingerprint блок. Более того, автор форума **успешно получает ответ** от `/api/v1/seller/events` — значит Node fetch работает.

### Стратегия — реактивный fallback

**Начинаем с Node fetch** по паттерну Phase 8/9 (`callApi` в `lib/wb-support-api.ts`). Если Wave 0 `curl /ping` вернёт 200 а Node `fetch /ping` вернёт 403, **тогда и только тогда** добавляем curl-fallback:

```typescript
async function callChatApi(path: string, init: RequestInit): Promise<Response> {
  try {
    return await callApi(CHAT_API, getChatsToken(), path, init)
  } catch (err) {
    if (err instanceof Error && err.message.includes("403")) {
      // Fallback на curl (паттерн lib/wb-api.ts:345)
      console.warn("[Chat] Node fetch 403 → curl fallback")
      return await callChatApiViaCurl(path, init)
    }
    throw err
  }
}
```

**Multipart + curl:** если fallback необходим, multipart через curl:
```bash
curl -X POST "https://buyer-chat-api.wildberries.ru/api/v1/seller/message" \
  -H "Authorization: $TOKEN" \
  -F "replySign=..." -F "message=..." -F "file=@/path/to/file.jpg"
```
через `execSync(...)`. Но это last resort.

### Wave 0 decisive test

На VPS:
```bash
# Test 1: curl (baseline)
curl -sI "https://buyer-chat-api.wildberries.ru/ping" -H "Authorization: $WB_CHAT_TOKEN"

# Test 2: Node fetch (то что мы планируем использовать)
node -e '
  fetch("https://buyer-chat-api.wildberries.ru/ping", {
    headers: { Authorization: process.env.WB_CHAT_TOKEN }
  }).then(r => console.log("Status:", r.status)).catch(e => console.error("Err:", e.message))
'
```

Если Test 1 = 200 и Test 2 = 200 → **curl fallback НЕ нужен, используем чистый Node fetch**.
Если Test 1 = 200 и Test 2 = 403 → активируем fallback (документация CLAUDE.md уже предупреждала).
Если Test 1 = 403 → scope/token issue, решаем на уровне Wave 0 (regenerate token).

## Data Model

### Prisma миграция (новое + расширения)

```prisma
// ──────────────────────────────────────────────────────────────
// Phase 10: Чат + Автоответы
// ──────────────────────────────────────────────────────────────

// Singleton-запись настроек автоответа. Обращаемся только по id = "singleton".
// Создаётся миграцией через INSERT ON CONFLICT DO NOTHING (seed).
model AutoReplyConfig {
  id            String   @id  // хардкод "singleton"
  isEnabled     Boolean  @default(false)
  workdayStart  String   @default("09:00")  // "HH:MM" в timezone
  workdayEnd    String   @default("18:00")  // "HH:MM" в timezone
  workDays      Int[]    @default([1, 2, 3, 4, 5])  // ISO 8601: 1=Mon, 7=Sun
  messageText   String   @db.Text @default("Здравствуйте, {имя_покупателя}! Спасибо за обращение по товару «{название_товара}». Мы ответим в рабочее время (Пн-Пт 9:00-18:00 МСК).")
  timezone      String   @default("Europe/Moscow")
  updatedById   String?
  updatedBy     User?    @relation("AutoReplyUpdater", fields: [updatedById], references: [id], onDelete: SetNull)
  updatedAt     DateTime @updatedAt
}

// Расширение модели SupportTicket (+ 2 поля):
model SupportTicket {
  // ... existing Phase 8 + Phase 9 fields ...

  // ── Phase 10: CHAT канал ──
  chatReplySign         String?   // replySign из WB Chat API, нужен для sendMessage
  customerNameSnapshot  String?   // clientName из WB (Customer линковка — Phase 12)

  // ... existing relations + indexes ...
}

// Расширение модели SupportMessage (+ 1 поле):
model SupportMessage {
  // ... existing fields ...

  // ── Phase 10: CHAT канал ──
  // eventID из WB Chat events для идемпотентного upsert (уникален в паре с каналом CHAT)
  wbEventId     String?   @unique  // nullable для Phase 8/9 legacy messages

  // ... existing @@index ...
}

// Обновления в User:
// model User {
//   ...
//   autoReplyUpdates AutoReplyConfig[] @relation("AutoReplyUpdater")
// }
```

**Rationale:**
- `id = "singleton"` — простейший паттерн для single-row config (vs composite unique на фиктивном поле). Upsert всегда `where: { id: "singleton" }`.
- `workDays: Int[] @default([1,2,3,4,5])` — ISO 8601 день недели (1=Пн..7=Вс); default рабочие будни. UI покажет 7 чекбоксов Пн-Вс.
- `messageText` — default с примером переменных `{имя_покупателя}` и `{название_товара}`.
- `chatReplySign` — nullable (не-CHAT каналам не нужно).
- `customerNameSnapshot` — имя на момент последнего sync (если WB сменил — обновится).
- `SupportMessage.wbEventId` — nullable (Phase 8/9 сообщения не имеют); `@unique` для идемпотентного upsert на cron sync.

**Миграция:** `npx prisma migrate dev --name phase10_chat_autoreply` + seed для AutoReplyConfig:

```sql
INSERT INTO "AutoReplyConfig" (id, "isEnabled", "workdayStart", "workdayEnd", "workDays", "messageText", "timezone", "updatedAt")
VALUES ('singleton', false, '09:00', '18:00', ARRAY[1,2,3,4,5], '...', 'Europe/Moscow', NOW())
ON CONFLICT (id) DO NOTHING;
```

## Sync Strategy

### `syncChats()` in `lib/support-sync.ts`

```typescript
export interface SyncChatsResult {
  newChats: number
  newMessages: number
  mediaDownloaded: number
  autoRepliesSent: number
  errors: string[]
}

export async function syncChats(): Promise<SyncChatsResult> {
  const result: SyncChatsResult = { newChats: 0, newMessages: 0, mediaDownloaded: 0, autoRepliesSent: 0, errors: [] }

  // 1. Phase B: GET /chats — обновить replySign/lastMessage для всех chats
  const chats = await listChats()
  for (const chat of chats) {
    await prisma.supportTicket.upsert({
      where: { channel_wbExternalId: { channel: "CHAT", wbExternalId: chat.chatID } },
      create: {
        channel: "CHAT",
        wbExternalId: chat.chatID,
        nmId: chat.goodCard?.nmID ?? null,
        chatReplySign: chat.replySign,
        customerNameSnapshot: chat.clientName,
        status: "NEW",
        previewText: chat.lastMessage?.text?.slice(0, 140) ?? null,
        lastMessageAt: chat.lastMessage ? new Date(chat.lastMessage.addTimestamp * 1000) : null,
      },
      update: {
        chatReplySign: chat.replySign,  // обновляем signature
        customerNameSnapshot: chat.clientName,
        previewText: chat.lastMessage?.text?.slice(0, 140) ?? undefined,
      },
    })
    result.newChats++
  }

  // 2. Phase A: GET /events?next=X — incremental events pull
  const lastNext = await getAppSetting("support.chat.lastEventNext")
  let next = lastNext ? parseInt(lastNext) : undefined
  while (true) {
    const { events, next: newNext, totalEvents } = await getEvents(next)
    if (events.length === 0) break

    for (const event of events) {
      // Upsert SupportMessage по wbEventId (unique)
      const ticket = await prisma.supportTicket.findUnique({
        where: { channel_wbExternalId: { channel: "CHAT", wbExternalId: event.chatID } },
      })
      if (!ticket) {
        result.errors.push(`Event ${event.eventID}: chat ${event.chatID} не найден после Phase B`)
        continue
      }

      const direction = event.sender === "client" ? "INBOUND" : "OUTBOUND"
      const existing = await prisma.supportMessage.findUnique({ where: { wbEventId: event.eventID } })
      if (existing) continue  // идемпотентность

      const msg = await prisma.supportMessage.create({
        data: {
          ticketId: ticket.id,
          direction,
          text: event.message?.text ?? null,
          authorId: null,  // INBOUND — покупатель; OUTBOUND через API — кто? см. ниже
          wbEventId: event.eventID,
          wbSentAt: new Date(event.addTimestamp),
          isAutoReply: false,  // incoming events не маркируются; флаг ставим локально при отправке
        },
      })
      // Attachments → SupportMedia
      for (const img of event.message?.attachments?.images ?? []) {
        await prisma.supportMedia.create({
          data: { messageId: msg.id, type: "IMAGE", wbUrl: `DOWNLOAD_ID:${img.downloadID}`, expiresAt: /* +1 год */ },
        })
        mediaQueue.push(...)  // скачать через /download/{id}
      }
      for (const file of event.message?.attachments?.files ?? []) { /* аналогично */ }

      result.newMessages++
    }

    if (events.length < batchSize) break  // последняя страница
    next = newNext
    await sleep(1000)  // rate limit
  }

  await setAppSetting("support.chat.lastEventNext", String(next))

  // 3. AutoReply cron — отдельной функцией
  const autoReplyResult = await runAutoReplies(result.newMessages > 0)
  result.autoRepliesSent = autoReplyResult.sent
  result.errors.push(...autoReplyResult.errors)

  // 4. Download media batch
  const downloads = await downloadChatMediaBatch(mediaQueue)  // через /download/{id} с токеном
  result.mediaDownloaded = downloads.filter(d => d.localPath).length

  return result
}
```

### `runAutoReplies()` in `lib/auto-reply.ts`

```typescript
export async function runAutoReplies(): Promise<{ sent: number; errors: string[] }> {
  const config = await prisma.autoReplyConfig.findUnique({ where: { id: "singleton" } })
  if (!config?.isEnabled) return { sent: 0, errors: [] }

  if (isWithinWorkingHours(config)) return { sent: 0, errors: [] }  // только вне рабочих часов

  // Найти INBOUND CHAT сообщения без OUTBOUND ответа за последние 24 часа,
  // где ещё не было автоответа (защита от спама: 1 auto-reply per chat per day)
  const candidates = await prisma.supportMessage.findMany({
    where: {
      direction: "INBOUND",
      ticket: { channel: "CHAT" },
      createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) },
      // ... фильтр: нет OUTBOUND после этого INBOUND + нет isAutoReply=true за 24ч на этом ticket
    },
    include: { ticket: true },
  })

  let sent = 0
  const errors: string[] = []
  for (const msg of candidates) {
    try {
      // Substitute variables
      const wbCard = msg.ticket.nmId ? await prisma.wbCard.findUnique({ where: { nmId: msg.ticket.nmId } }) : null
      const text = config.messageText
        .replace(/\{имя_покупателя\}/g, msg.ticket.customerNameSnapshot ?? "покупатель")
        .replace(/\{название_товара\}/g, wbCard?.name ?? "товар")

      // Send via WB Chat API
      await sendMessage(msg.ticket.chatReplySign!, text)

      // Record OUTBOUND SupportMessage with isAutoReply=true
      await prisma.supportMessage.create({
        data: {
          ticketId: msg.ticket.id,
          direction: "OUTBOUND",
          text,
          authorId: null,  // системное сообщение
          isAutoReply: true,
          wbSentAt: new Date(),
        },
      })
      sent++
    } catch (err) {
      errors.push(`Auto-reply ${msg.ticket.id}: ${err instanceof Error ? err.message : "unknown"}`)
    }
  }

  return { sent, errors }
}

function isWithinWorkingHours(config: AutoReplyConfig): boolean {
  const now = new Date()
  const tzDate = new Date(now.toLocaleString("en-US", { timeZone: config.timezone }))
  const dayOfWeek = tzDate.getDay() === 0 ? 7 : tzDate.getDay()  // 1..7 ISO
  if (!config.workDays.includes(dayOfWeek)) return false

  const [startH, startM] = config.workdayStart.split(":").map(Number)
  const [endH, endM] = config.workdayEnd.split(":").map(Number)
  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM
  const nowMinutes = tzDate.getHours() * 60 + tzDate.getMinutes()

  return nowMinutes >= startMinutes && nowMinutes < endMinutes
}
```

### Cron integration — SEPARATE endpoint

**Новый файл:** `app/api/cron/support-sync-chat/route.ts`

```typescript
export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("x-cron-secret")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }
  try {
    const result = await syncChats()  // syncChats включает runAutoReplies
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Ошибка" }, { status: 500 })
  }
}
```

**VPS crontab (паттерн):**
```
*/5 * * * * curl -s -H "x-cron-secret: $CRON_SECRET" https://zoiten.pro/api/cron/support-sync-chat > /dev/null 2>&1
```

**Manual trigger:** расширяем `POST /api/support-sync` → после `syncSupport + syncReturns` вызываем `syncChats` → backward-compat через spread (как Phase 9 сделал).

## Multipart Upload

### Client-side (ChatReplyPanel.tsx)

- Native `<input type="file" multiple accept=".jpg,.jpeg,.png,.pdf" />`.
- Валидация: сумма ≤ 30 MB, каждый ≤ 5 MB, MIME в allow-list.
- Preview: thumbnails для images, иконка + filename для PDF.
- Отправка через server action `sendChatMessage(ticketId, text, files: File[])` — File переходит через FormData (Next.js 15 server actions поддерживают FormData).

### Server action

```typescript
// app/actions/support.ts
export async function sendChatMessage(formData: FormData): Promise<ActionResult> {
  "use server"
  await requireSection("SUPPORT", "MANAGE")
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: "Сессия без user.id" }

  const ticketId = formData.get("ticketId") as string
  const text = (formData.get("text") as string) ?? ""
  const files = formData.getAll("files") as File[]

  if (!text.trim() && files.length === 0) return { ok: false, error: "Пустое сообщение" }
  if (text.length > 1000) return { ok: false, error: "Макс 1000 символов" }

  // Size validation server-side
  let totalSize = 0
  for (const f of files) {
    if (f.size > 5 * 1024 * 1024) return { ok: false, error: `Файл ${f.name} > 5 MB` }
    totalSize += f.size
  }
  if (totalSize > 30 * 1024 * 1024) return { ok: false, error: "Сумма файлов > 30 MB" }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, channel: true, chatReplySign: true, wbExternalId: true },
  })
  if (!ticket) return { ok: false, error: "Тикет не найден" }
  if (ticket.channel !== "CHAT") return { ok: false, error: "Не CHAT-тикет" }
  if (!ticket.chatReplySign) return { ok: false, error: "Нет replySign — запустите синхронизацию" }

  // 1. Сохранить локально ПЕРЕД отправкой в WB (если WB упадёт — не теряем файлы)
  const msg = await prisma.supportMessage.create({
    data: { ticketId: ticket.id, direction: "OUTBOUND", text, authorId: userId, isAutoReply: false },
  })
  const localFiles: { path: string; name: string; type: MediaType }[] = []
  for (const f of files) {
    const type: MediaType = f.type === "application/pdf" ? "IMAGE" /* или PDF — нужен новый enum */ : "IMAGE"  // WARNING: enum MediaType только IMAGE/VIDEO, нужно расширить или использовать IMAGE для PDF
    const localPath = await saveLocalFile(f, ticket.id, msg.id)
    localFiles.push({ path: localPath, name: f.name, type })
    await prisma.supportMedia.create({
      data: { messageId: msg.id, type, wbUrl: "", localPath, expiresAt: ... },
    })
  }

  // 2. Build WB FormData
  const wbForm = new FormData()
  wbForm.append("replySign", ticket.chatReplySign)
  if (text) wbForm.append("message", text)
  for (const { path, name } of localFiles) {
    const buf = await fs.readFile(path)
    wbForm.append("file", new Blob([buf]), name)
  }

  // 3. POST to WB (multipart — НЕ ставим Content-Type, fetch/FormData сами)
  try {
    await sendMessageRaw(wbForm)  // в lib/wb-support-api.ts
  } catch (err) {
    // Удалить созданный message? Или оставить с error-флагом? Решение: оставить, помечаем
    return { ok: false, error: `WB: ${err instanceof Error ? err.message : "unknown"}` }
  }

  await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: "ANSWERED", lastMessageAt: new Date() } })
  revalidatePath("/support")
  revalidatePath(`/support/${ticketId}`)
  return { ok: true }
}
```

**⚠ NB:** текущий enum `MediaType` = `IMAGE | VIDEO`. Для Phase 10 PDF-attachments нужно либо **(a)** расширить enum до `IMAGE | VIDEO | DOCUMENT`, либо **(b)** использовать IMAGE для PDF (неправильно семантически). Рекомендую (a) — добавить в миграцию Plan 10-01.

## Token Architecture

| Токен | Env var | Scope bit | Используется для |
|-------|---------|-----------|------------------|
| Feedbacks+Questions | `WB_API_TOKEN` | 7 (по docs) или 5 (по CLAUDE.md — расхождение, но работает) | Phase 8: callWb() в `lib/wb-support-api.ts` |
| Returns | `WB_RETURNS_TOKEN` | 11 | Phase 9: callReturnsApi() |
| **Buyers Chat** | **`WB_CHAT_TOKEN` (НОВЫЙ)** | **9** | Phase 10: callChatApi() |

**Fallback:** по паттерну Phase 9 (`getReturnsToken` fallback на `WB_API_TOKEN`) в dev/test → `getChatsToken` возвращает `WB_CHAT_TOKEN ?? WB_API_TOKEN`.

**Pre-flight Wave 0 checks:**
1. `curl -sI "https://buyer-chat-api.wildberries.ru/ping" -H "Authorization: $WB_API_TOKEN"` → если 200, текущий токен уже покрывает bit 9 (повезло), отдельный `WB_CHAT_TOKEN` не нужен.
2. Если 401/403 → в `seller.wildberries.ru/supplier-settings/access-to-api` создать новый токен с scope «Чат с покупателями», добавить в `/etc/zoiten.pro.env`, `systemctl restart zoiten-erp.service`.

## UI Architecture

### Лента `/support` — CHAT уже поддерживается

CHAT уже в CHANNEL_OPTIONS (`app/(dashboard)/support/page.tsx:14`). После Phase 10 sync CHAT-тикеты появятся автоматически. SupportTicketCard рендерит по `ticket.channel` — проверить что икона для CHAT есть (ожидается `MessageCircle` или `MessageSquare` из Lucide).

**Доработка:** в `SupportTicketCard` добавить индикатор «🤖» если у последнего OUTBOUND сообщения тикета `isAutoReply=true`:
- Server-side preload в `app/(dashboard)/support/page.tsx`: для каждого тикета загружать последнее OUTBOUND message (как уже делается в Phase 9 для ReturnDecision).
- Клиентский рендер в `SupportTicketCard`: `{lastOutbound?.isAutoReply && <Bot className="h-3 w-3 text-muted-foreground" title="Автоответ" />}`.

### Диалог `/support/[ticketId]` — CHAT branch

**Изменения в `app/(dashboard)/support/[ticketId]/page.tsx`:**

```tsx
const canReply = ticket.channel === "FEEDBACK" || ticket.channel === "QUESTION"
const isReturn = ticket.channel === "RETURN"
const isChat = ticket.channel === "CHAT"  // НОВОЕ

// ...
{canReply && <ReplyPanel ticketId={ticket.id} disabled={ticket.status === "CLOSED"} />}
{isReturn && <ReturnActionsPanel ... />}
{isChat && <ChatReplyPanel ticketId={ticket.id} replySign={ticket.chatReplySign} />}
{!canReply && !isReturn && !isChat && <div>Канал не поддерживает ответ...</div>}
```

**SupportDialog bubble** — добавить badge/иконку 🤖 если `message.isAutoReply`:
```tsx
{message.isAutoReply && (
  <span className="inline-flex items-center text-xs text-muted-foreground mr-1">
    <Bot className="h-3 w-3 mr-1" /> Автоответ
  </span>
)}
```

### `components/support/ChatReplyPanel.tsx` (новый client component)

```tsx
"use client"
import { useState, useRef, useTransition } from "react"
// ...
export function ChatReplyPanel({ ticketId, replySign }: { ticketId: string; replySign: string | null }) {
  const [text, setText] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  function onSubmit() {
    // validation: размер, MIME
    const fd = new FormData()
    fd.set("ticketId", ticketId)
    fd.set("text", text)
    for (const f of files) fd.append("files", f)
    startTransition(async () => {
      const res = await sendChatMessage(fd)
      if (res.ok) { toast.success("Отправлено"); setText(""); setFiles([]) }
      else toast.error(res.error)
    })
  }

  return (
    <div className="sticky bottom-0 border-t p-3 space-y-2">
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="text-xs flex items-center gap-1 bg-muted px-2 py-1 rounded">
              {f.name} ({(f.size / 1024).toFixed(0)} KB)
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <input ref={fileInputRef} type="file" multiple accept=".jpg,.jpeg,.png,.pdf" className="hidden" onChange={...} />
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}><Paperclip /></Button>
        <textarea value={text} onChange={...} maxLength={1000} rows={2} className="flex-1 ..." />
        <Button onClick={onSubmit} disabled={isPending || !replySign || (!text.trim() && files.length === 0)}>
          <Send /> Отправить
        </Button>
      </div>
      {!replySign && <p className="text-xs text-destructive">Нет replySign — запустите синхронизацию чата</p>}
    </div>
  )
}
```

### `/support/auto-reply` — страница настроек

**Файл:** `app/(dashboard)/support/auto-reply/page.tsx` (RSC).

```tsx
export default async function AutoReplyPage() {
  await requireSection("SUPPORT")  // read
  const config = await prisma.autoReplyConfig.findUnique({ where: { id: "singleton" } })
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Автоответ в чате</h1>
      <AutoReplyForm config={config} />
    </div>
  )
}
```

**Компонент `AutoReplyForm.tsx` (client):**
- Toggle `isEnabled` (native checkbox styled)
- 7 checkbox дней недели (native): Пн/Вт/Ср/Чт/Пт/Сб/Вс, связаны с `workDays: Int[]`
- 2 `<input type="time">` для workdayStart/End
- `<textarea>` с `messageText`, подсказка «Переменные: `{имя_покупателя}`, `{название_товара}`»
- `<select>` timezone (default Europe/Moscow, опционально UTC, Europe/Berlin и т.д.)
- Кнопка «Сохранить» (**не** «Синхронизировать с WB» — WB API не принимает) → server action `saveAutoReplyConfig(formData)` → upsert по id="singleton"

**server action:**
```typescript
export async function saveAutoReplyConfig(formData: FormData): Promise<ActionResult> {
  "use server"
  await requireSection("SUPPORT", "MANAGE")
  const userId = await getSessionUserId()
  // Zod validation
  const schema = z.object({
    isEnabled: z.boolean(),
    workdayStart: z.string().regex(/^\d{2}:\d{2}$/),
    workdayEnd: z.string().regex(/^\d{2}:\d{2}$/),
    workDays: z.array(z.number().int().min(1).max(7)),
    messageText: z.string().min(1).max(500),
    timezone: z.string(),
  })
  const parsed = schema.safeParse({...})
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  await prisma.autoReplyConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...parsed.data, updatedById: userId },
    update: { ...parsed.data, updatedById: userId },
  })
  revalidatePath("/support/auto-reply")
  return { ok: true }
}
```

### Sidebar — добавить «Автоответ»

**Изменение `components/layout/nav-items.ts`:**
```ts
// after { href: "/support/returns", ... } add:
{ section: "SUPPORT", href: "/support/auto-reply", label: "Автоответ", icon: "Bot" },
```
Плюс `Bot` в ICON_MAP и импорт из Lucide.

## State Machine (CHAT channel)

CHAT-канал не имеет state machine как Returns (PENDING/APPROVED/REJECTED), но использует existing `TicketStatus`:

| Действие | `TicketStatus` | `lastMessageAt` | Примечание |
|----------|---------------|-----------------|------------|
| Новый чат от покупателя (INBOUND event, isNewChat=true) | `NEW` | event.addTimestamp | SupportTicket create |
| Новое сообщение в существующем чате (INBOUND) | не меняется (если NEW/IN_PROGRESS/CLOSED→IN_PROGRESS? — обсудить) | event.addTimestamp | Рекомендация: **при получении INBOUND на CLOSED → вернуть в NEW** (чат переоткрыт) |
| Менеджер отправил ответ (OUTBOUND через ChatReplyPanel) | `ANSWERED` | now | Паттерн Phase 8 Feedbacks |
| Автоответ (OUTBOUND isAutoReply=true) | **НЕ меняется** (остаётся NEW/IN_PROGRESS) — автоответ не заменяет человеческий ответ | updatedNow | Это отличие от замещающего «manual reply→ANSWERED». После автоответа тикет всё ещё требует внимания менеджера |
| Менеджер закрыл через «Закрыть» в TicketSidePanel | `CLOSED` | — | Ручное действие |

Рекомендация: **автоответ не меняет status**, только создаёт OUTBOUND сообщение с `isAutoReply=true`. Это делает тикеты с автоответом видимыми в фильтре «только неотвеченные» — корректное поведение (человек ещё должен ответить в рабочее время).

## Validation Architecture

> nyquist_validation enabled (`.planning/config.json` workflow.nyquist_validation = true)

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npx vitest run tests/wb-chat-api.test.ts tests/support-sync-chat.test.ts tests/auto-reply.test.ts tests/chat-actions.test.ts` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| SUP-21 | listChats строит URL, возвращает result array | unit | `npx vitest run tests/wb-chat-api.test.ts -t "listChats"` | ❌ Wave 0 |
| SUP-21 | getEvents с cursor `next` | unit | `npx vitest run tests/wb-chat-api.test.ts -t "getEvents"` | ❌ Wave 0 |
| SUP-21 | sendMessage multipart build | unit | `npx vitest run tests/wb-chat-api.test.ts -t "sendMessage"` | ❌ Wave 0 |
| SUP-21 | 429 retry + X-Ratelimit-Retry | unit | `npx vitest run tests/wb-chat-api.test.ts -t "429"` | ❌ Wave 0 |
| SUP-21 | 403 → curl fallback (if implemented) | unit (skip until needed) | `npx vitest run tests/wb-chat-api.test.ts -t "curl"` | ❌ |
| SUP-21/22 | syncChats upsert по chatID + eventID идемпотентен | integration | `npx vitest run tests/support-sync-chat.test.ts -t "idempotent"` | ❌ Wave 0 |
| SUP-22 | sendChatMessage создаёт OUTBOUND + SupportMedia + вызывает WB | integration | `npx vitest run tests/chat-actions.test.ts -t "sendChatMessage"` | ❌ Wave 0 |
| SUP-22 | validation: >30 MB total → reject | integration | same | ❌ Wave 0 |
| SUP-23 | AutoReplyConfig singleton upsert | integration | `npx vitest run tests/chat-actions.test.ts -t "saveAutoReplyConfig"` | ❌ Wave 0 |
| SUP-24 | `/support/auto-reply` рендерится без ошибок | smoke | `npm run build` | ✅ (existing TS check) |
| SUP-25 | runAutoReplies skipped если isEnabled=false | integration | `npx vitest run tests/auto-reply.test.ts -t "disabled"` | ❌ Wave 0 |
| SUP-25 | runAutoReplies skipped внутри рабочих часов | integration | `npx vitest run tests/auto-reply.test.ts -t "workhours"` | ❌ Wave 0 |
| SUP-25 | runAutoReplies подставляет {имя_покупателя} и {название_товара} | integration | `npx vitest run tests/auto-reply.test.ts -t "variables"` | ❌ Wave 0 |
| SUP-25 | runAutoReplies не отправляет повторно за 24ч | integration | `npx vitest run tests/auto-reply.test.ts -t "dedup"` | ❌ Wave 0 |
| SUP-25 | isAutoReply=true в SupportMessage записан корректно | integration | same | ❌ Wave 0 |
| SUP-07 | cron endpoint /api/cron/support-sync-chat с x-cron-secret | smoke | `npx vitest run tests/support-cron.test.ts -t "chat"` | ❌ (расширить) |
| SUP-22 | ChatReplyPanel UI rendering + file picker | manual-only | Human UAT: клик, прикрепить файл, отправить, проверить появление в диалоге | — |
| SUP-24 | форма /support/auto-reply сохраняет настройки | manual-only | Human UAT: изменить часы, сохранить, refresh, проверить что сохранилось | — |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/wb-chat-api.test.ts tests/support-sync-chat.test.ts tests/auto-reply.test.ts tests/chat-actions.test.ts -x` (<10 сек)
- **Per wave merge:** `npm run test` (full suite, ~60 сек с учётом 124 baseline + ~30 новых)
- **Phase gate:** full suite GREEN + `npx tsc --noEmit` + `npx prisma validate` OK перед `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/wb-chat-api.test.ts` — покрывает SUP-21 (10-12 тестов, паттерн `wb-returns-api.test.ts`)
- [ ] `tests/support-sync-chat.test.ts` — покрывает SUP-22 sync part (5 тестов, паттерн `support-sync-returns.test.ts`)
- [ ] `tests/chat-actions.test.ts` — покрывает SUP-22 server action + SUP-23 saveAutoReplyConfig (10 тестов, паттерн `return-actions.test.ts`)
- [ ] `tests/auto-reply.test.ts` — покрывает SUP-25 autoreply logic (8 тестов, NEW)
- [ ] `tests/fixtures/wb-chat-list-sample.json` — canonical WB /chats response
- [ ] `tests/fixtures/wb-chat-events-sample.json` — canonical WB /events response
- [ ] Расширить `tests/support-cron.test.ts` тестом для `/api/cron/support-sync-chat`
- [ ] vitest config уже работает (Phase 7 setup) — framework install не нужен

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js fetch (multipart FormData) | sendChatMessage | ✓ | Node 18+ (встроено) | — |
| curl CLI | Реактивный fallback при 403 Node fetch | ✓ | system curl | — |
| `WB_CHAT_TOKEN` env var | Chat API auth | ✗ | — | **BLOCKER** — Wave 0 создаёт или подтверждает существующий токен |
| Prisma migrate | Миграция для AutoReplyConfig + новых полей | ✓ | 6.x | — |
| vitest | Unit + integration tests | ✓ | 4.1.4 | — |
| PostgreSQL | AutoReplyConfig storage | ✓ | 16 (VPS) | — |
| nginx `/uploads/support/` alias | Хранение chat-media | ✓ (Phase 8) | — | — |
| Systemd crontab / external cron | `*/5` trigger `/api/cron/support-sync-chat` | ✓ (VPS crontab существует для 15-мин) | — | — |
| `Intl.DateTimeFormat` с timezone support | workdayStart/End расчёт | ✓ | Node 18+ | — |
| Zod | validation saveAutoReplyConfig | ✓ | 4.3.6 | — |

**Missing with fallback:** нет critical-blocker за исключением токена.

**Missing, blocking:** `WB_CHAT_TOKEN` — Wave 0 обязан создать или подтвердить.

## Risks & Unknowns

### Risk 1 — ❗❗ WB API не имеет auto-reply endpoint (HIGH impact)

**Что:** Research подтвердил через 3 источника (Swagger, WBSeller SDK, forum) — нет endpoint для отправки шаблона autoreply в WB.
**Impact:** ROADMAP SC#3 и SUP-24 требование «настройки уходят в WB API» — **невыполнимо как сформулировано**. Приходится либо переформулировать требование (автоответ — ERP-local feature, работает через локальный cron), либо deferred.
**Mitigation:** В `/gsd:discuss-phase 10` обязательно обсудить с пользователем. Рекомендация: переформулировать SC#3 как «Менеджер настраивает автоответ → cron каждые 5 мин отправляет auto-reply сообщения вне рабочих часов через стандартный POST /message endpoint, помечая их isAutoReply=true».

### Risk 2 — TLS fingerprint block на Chat API (LOW-MEDIUM)

**Что:** Теоретически возможно что WB блокирует Node fetch как для `card.wb.ru/v4`. Не подтверждено источниками.
**Mitigation:** Wave 0 decisive test (`curl /ping` vs `node fetch /ping`). Если 403, добавить curl fallback реактивно. Multipart upload через curl — усложнение, но реализуемо (`-F` flags).

### Risk 3 — replySign TTL неизвестен (MEDIUM)

**Что:** Документация WB не уточняет, сколько живёт replySign. Может ротироваться каждый sync, каждый час, каждый день.
**Mitigation:** (1) при каждом `GET /chats` (sync tick 5 мин) обновляем `chatReplySign`. (2) Если `sendMessage` вернёт ошибку связанную с invalid signature, делаем single-retry с refresh replySign (новый GET /chats → retry).

### Risk 4 — 19 000 фантомных чатов / data quality (MEDIUM, подтверждено forum/1407)

**Что:** WB `/chats` может вернуть огромное число «призрачных» chats со всеми полями по нулям (`addTimestamp = 0`, identical timestamps). Наша upsert-логика создаст 19 000 пустых SupportTicket.
**Mitigation:** Фильтровать в `syncChats()` на стороне клиента: skip chats где `lastMessage === null && lastMessage.addTimestamp === 0`. Добавить метрику `result.skipped` для наблюдаемости.

### Risk 5 — AutoReply dedup edge case (MEDIUM)

**Что:** Покупатель пишет в 19:00 (вне рабочих часов), получает автоответ. В 19:05 пишет ещё раз. Дедупликация (1 auto-reply per chat per day) не отправляет второй автоответ — покупатель не знает что его услышали.
**Mitigation:** Логика дедупликации per-chat per 24h acceptable для MVP. Обсудить в discuss-phase — возможно правильнее 1 раз за весь нерабочий интервал + reset на начало следующего рабочего дня.

### Risk 6 — Timezone DST transitions (LOW)

**Что:** Europe/Moscow — не переходит на летнее время с 2011, но другие TZ могут переходить. В DST transition день может быть 23 или 25 часов.
**Mitigation:** использовать `Intl.DateTimeFormat` с IANA TZ ID (не offset) — браузер/Node правильно обработают DST. Unit тест с проверкой DST boundary для Europe/Berlin.

### Risk 7 — File MediaType enum ограничен (MEDIUM)

**Что:** текущий enum `MediaType = IMAGE | VIDEO`; Phase 10 требует PDF-support для multipart upload (документы).
**Mitigation:** расширить enum до `MediaType = IMAGE | VIDEO | DOCUMENT` (non-breaking, миграция добавляет value).

### Risk 8 — download/{id} требует токен (MEDIUM)

**Что:** `/api/v1/seller/download/{id}` требует Authorization header. Просто вставить URL в `<img src>` не сработает — браузер не передаст токен.
**Mitigation:** Проксировать через ERP route handler `app/api/wb-chat-media/[downloadId]/route.ts` → серверный fetch с токеном → pipe бинарные данные клиенту. Либо скачать локально в cron (паттерн `downloadMediaBatch`) и отдавать из `/uploads/support/`. **Рекомендую второй вариант** (консистентно с Phase 8/9).

### Risk 9 — «Синхронизировать с WB» button semantics

**Что:** SUP-24 явно называет кнопку «Синхронизировать с WB» на `/support/auto-reply`. Но WB API не принимает autoreply config. Кнопка создаст cognitive dissonance.
**Mitigation:** Переименовать в «Сохранить» или «Применить». Описание под формой: «Настройки применяются автоматически — cron каждые 5 мин отправляет автоответы вне рабочих часов». Обсудить в `/gsd:discuss-phase 10`.

### Risk 10 — Scope bit 9 conflict с существующим токеном

**Что:** Если WB_API_TOKEN уже имеет bit 9 (редко, но возможно), создание WB_CHAT_TOKEN избыточно.
**Mitigation:** Wave 0 `curl ping` со старым токеном → если 200, fallback в коде (`process.env.WB_CHAT_TOKEN ?? process.env.WB_API_TOKEN`) и пропустить создание нового токена. Документировать решение в `10-WAVE0-NOTES.md`.

## Plan Slicing Recommendation

**Wave 0 + 4 плана** (паттерн Phase 8 и 9). Total ~12-16 часов работы + ~1 час deploy.

### Wave 0 — Infrastructure & Live API Verification (1-2 часа)

**Цель:** Ответить на 4 critical-unknown до разработки.

**Actions (на VPS):**
1. `curl -sI "https://buyer-chat-api.wildberries.ru/ping" -H "Authorization: $WB_API_TOKEN"` → проверить, есть ли bit 9 в существующем токене.
2. Если 401/403 — создать `WB_CHAT_TOKEN` в `seller.wildberries.ru` (scope «Чат с покупателями»), добавить в `/etc/zoiten.pro.env`, `systemctl restart zoiten-erp.service`.
3. `curl -s "https://buyer-chat-api.wildberries.ru/api/v1/seller/chats" -H "Authorization: $WB_CHAT_TOKEN" | jq` → зафиксировать формат ответа (в `10-WAVE0-NOTES.md`): количество chats, структура goodCard, replySign format.
4. `curl -s "https://buyer-chat-api.wildberries.ru/api/v1/seller/events" -H "Authorization: $WB_CHAT_TOKEN" | jq` → зафиксировать формат events.
5. Node fetch vs curl TLS test (скрипт выше). Если Node fetch 403 — заметить, активировать fallback в плане.
6. Создать fixtures: `tests/fixtures/wb-chat-list-sample.json`, `tests/fixtures/wb-chat-events-sample.json`.
7. Создать RED test stubs: `tests/wb-chat-api.test.ts`, `tests/support-sync-chat.test.ts`, `tests/chat-actions.test.ts`, `tests/auto-reply.test.ts`.

**Deliverable:** `10-WAVE0-NOTES.md` с:
- Scope bit 9 подтверждён (да/нет, какой token)
- TLS fingerprint результат (fetch works / curl fallback needed)
- Sample chat count на проде (для grounding в data quality risk)
- WB /chats response example (canonical fixture)
- WB /events response example (canonical fixture)

### Plan 10-01 — Foundation (2-3 часа)

**Scope:**
- Prisma миграция `phase10_chat_autoreply`:
  - Новая модель `AutoReplyConfig` (id="singleton")
  - `SupportTicket`: +`chatReplySign: String?`, +`customerNameSnapshot: String?`
  - `SupportMessage`: +`wbEventId: String? @unique`
  - `MediaType` enum: добавить значение `DOCUMENT`
  - `User` relation: +`autoReplyUpdates AutoReplyConfig[] @relation("AutoReplyUpdater")`
- Seed `AutoReplyConfig` singleton через INSERT ON CONFLICT
- Расширение `lib/wb-support-api.ts`:
  - Новая константа `CHAT_API = "https://buyer-chat-api.wildberries.ru"`
  - `getChatsToken()` с fallback
  - `callChatApi()` helper на базе универсального `callApi()` (уже есть)
  - Типы: `Chat`, `ChatEvent`, `ChatGoodCard`, `ChatMessage`, `ChatAttachment`
  - Функции: `pingChat()`, `listChats()`, `getEvents(next?)`, `sendMessageRaw(formData)`, `downloadChatFile(id)` — прокси для attachments
- `tests/wb-chat-api.test.ts` — 10+ GREEN tests (паттерн wb-returns-api.test.ts)
- `npx tsc --noEmit` + `npx prisma validate` clean

**Dependencies:** Wave 0
**Exit criteria:** Migration dev applied локально, все tests GREEN, Prisma Studio показывает singleton AutoReplyConfig.

### Plan 10-02 — Sync + AutoReply Cron (3-4 часа)

**Scope:**
- Новая функция `syncChats()` в `lib/support-sync.ts`:
  - Phase B (GET /chats) → upsert SupportTicket
  - Phase A (GET /events) → upsert SupportMessage по wbEventId; пагинация через `next`
  - Фильтрация фантомных chats (Risk 4)
  - `AppSetting.key = "support.chat.lastEventNext"` для cursor
  - Media queue → `downloadChatMediaBatch()` (переиспользуется downloadMediaBatch с токен-проксированием)
- Новый модуль `lib/auto-reply.ts`:
  - `isWithinWorkingHours(config)` — timezone-aware
  - `runAutoReplies()` — detect + substitute + send
  - Dedup: 1 auto-reply per chat per 24h
- Расширение `POST /api/support-sync` — вызов `syncChats()` после `syncReturns()` (spread response, backward-compat)
- Новый `app/api/cron/support-sync-chat/route.ts` — 5-мин cron с x-cron-secret
- `tests/support-sync-chat.test.ts` — 5 GREEN
- `tests/auto-reply.test.ts` — 8 GREEN (disabled, workhours, variables, dedup, timezone DST)
- Расширение `tests/support-cron.test.ts` — cron chat endpoint
- VPS crontab — добавить строку для support-sync-chat (в Plan 10-04 deploy)

**Dependencies:** 10-01
**Exit criteria:** Ручной `POST /api/support-sync` импортирует тестовый chat в БД, autoreply не отправляется внутри рабочих часов, отправляется вне.

### Plan 10-03 — UI Chat Messages (3-4 часа)

**Scope:**
- Новый `components/support/ChatReplyPanel.tsx` (client, multipart):
  - File picker (`<input type=file multiple accept=...>`)
  - Preview selected files (thumbnails / filename)
  - Size/MIME validation client + server
  - Textarea maxLength=1000
  - Submit through server action `sendChatMessage(formData)`
- Новый server action `sendChatMessage` в `app/actions/support.ts`:
  - requireSection SUPPORT MANAGE
  - Zod validation
  - Сохранение файлов локально → `/var/www/zoiten-uploads/support/{ticketId}/{messageId}/`
  - Build FormData → `sendMessageRaw` в WB
  - Create SupportMessage + SupportMedia per file (type IMAGE / DOCUMENT)
  - Handle WB error (сохраняем локально даже при failure? — decision point)
  - revalidatePath /support + /support/[ticketId]
- Модификация `app/(dashboard)/support/[ticketId]/page.tsx`:
  - `isChat = ticket.channel === "CHAT"` conditional
  - `<ChatReplyPanel ticketId={ticket.id} replySign={ticket.chatReplySign} />` branch
  - Убрать CHAT из fallback «канал не поддерживает»
- Модификация `components/support/SupportDialog.tsx`:
  - Bubble 🤖 badge + title tooltip для `message.isAutoReply`
- Модификация `components/support/SupportTicketCard.tsx`:
  - Индикатор 🤖 рядом с превью если последний OUTBOUND isAutoReply
- `tests/chat-actions.test.ts` — 8 GREEN (sendChatMessage happy + validation + media + error handling)

**Dependencies:** 10-02
**Exit criteria:** Открыть CHAT тикет → виден ChatReplyPanel с file picker → прикрепить файл → отправить → в диалоге появляется OUTBOUND bubble с thumbnail, в WB Chat кабинете — сообщение. Автоответ в диалоге помечен 🤖.

### Plan 10-04 — Auto-Reply Settings + UAT (2-3 часа)

**Scope:**
- Новый `app/(dashboard)/support/auto-reply/page.tsx` (RSC): read config, render form
- Новый `components/support/AutoReplyForm.tsx` (client):
  - Toggle isEnabled
  - 7 checkbox дней недели
  - 2 `<input type=time>`
  - Textarea messageText с подсказкой переменных
  - Native `<select>` timezone
  - Кнопка «Сохранить» (переименована с SUP-24 «Синхронизировать с WB» — решение в discuss-phase)
- Новый server action `saveAutoReplyConfig(formData)` в `app/actions/support.ts`
- Sidebar: добавить `{ section: "SUPPORT", href: "/support/auto-reply", label: "Автоответ", icon: "Bot" }` в nav-items.ts + ICON_MAP
- Human UAT на VPS (15 пунктов по паттерну 09-VERIFICATION.md):
  1. Открыть `/support/auto-reply` — форма рендерится
  2. Изменить настройки → сохранить → refresh → настройки сохранились
  3. Выключить isEnabled → вне рабочих часов cron НЕ отправляет автоответ
  4. Включить isEnabled, установить workdayStart в будущее время → в течение 5 мин cron отправляет автоответ на PENDING inbound chat
  5. Проверить в /support что автоответ помечен 🤖 и не меняет status=NEW
  6. Открыть CHAT тикет → ChatReplyPanel виден
  7. Прикрепить JPEG → preview → отправить → OUTBOUND bubble с thumbnail
  8. Прикрепить >5 MB файл → toast validation error
  9. Прикрепить 7 файлов total >30 MB → validation error
  10. Отправить только текст → успех
  11. Sidebar «Автоответ» виден → клик ведёт на страницу
  12. VIEWER открывает /support/auto-reply → форма видна, «Сохранить» дизейбл или возвращает FORBIDDEN
  13. Регрессия: `/support` (лента) CHAT-тикеты видны с иконкой MessageCircle + 🤖 если последний OUTBOUND автоответ
  14. Регрессия: `/support/returns` продолжает работать
  15. Регрессия: `/support/[ticketId]` для FEEDBACK продолжает работать с ReplyPanel
- Deploy на VPS (`bash deploy.sh`) + systemd restart
- VPS crontab: добавить строку `*/5 * * * * curl -s -H "x-cron-secret: $CRON_SECRET" https://zoiten.pro/api/cron/support-sync-chat > /dev/null 2>&1`
- `WB_CHAT_TOKEN` в `/etc/zoiten.pro.env` (из Wave 0)
- Создать `10-VERIFICATION.md` (паттерн 09-VERIFICATION.md)

**Dependencies:** 10-03
**Exit criteria:** Full suite GREEN, tsc clean, build green, deploy active, 15-пункт UAT checklist ready for human verification.

### Timing estimate

- Wave 0: 1-2 часа
- 10-01: 2-3 часа
- 10-02: 3-4 часа
- 10-03: 3-4 часа
- 10-04: 2-3 часа + UAT
- **Total:** 12-16 часов + 1 час deploy

## Sources

### Primary (HIGH confidence)

- [WB Customer Communication API (dev.wildberries.ru)](https://dev.wildberries.ru/en/docs/openapi/user-communication) — главная точка документации Feedbacks/Questions/Chat/Returns.
- [WB Swagger Communications](https://dev.wildberries.ru/en/swagger/communications) — интерактивный reference всех 5 Buyer Chat endpoints.
- [WB API Token Scopes](https://dev.wildberries.ru/en/openapi/api-information) — bit 9 = Buyers Chat (verified).
- [Buyer Chat API response schemas (WBSeller SDK)](https://github.com/Dakword/WBSeller/blob/master/docs/Chat.md) — 4 методa (ping/list/events/message) + download.
- [WB Forum discussion on /api/v1/seller/chats behaviour (forum/1407)](https://dev.wildberries.ru/forum/1407) — data quality caveats (19000 empty chats, 503s).
- `prisma/schema.prisma:484-610` — Phase 8+9 схема с TicketChannel.CHAT, Direction, MediaType, SupportMessage.isAutoReply (уже есть).
- `lib/wb-support-api.ts:1-302` — existing `callApi` helper, token split pattern, 429 retry.
- `lib/support-sync.ts:1-486` — existing syncSupport + syncReturns паттерн, media queue, transaction per item.
- `lib/support-media.ts` — `downloadMediaBatch` helper (переиспользуется для chat images/PDF).
- `lib/wb-api.ts:319-421` — curl fallback паттерн (reference для реактивного fallback).
- `app/actions/support.ts:35-417` — existing server actions паттерн (replyToTicket, 3 return actions).
- `app/(dashboard)/support/[ticketId]/page.tsx:89-168` — existing conditional branch (canReply / isReturn) — точка расширения для isChat.
- `components/support/ReplyPanel.tsx` — existing reply панель (остаётся нетронутой для Feedbacks/Questions).
- `components/support/SupportTicketCard.tsx`, `SupportDialog.tsx` — иконки каналов + message bubbles.
- `app/api/cron/support-sync-reviews/route.ts` — cron endpoint pattern с x-cron-secret.
- `app/api/support-sync/route.ts` (implicit) — manual sync endpoint.
- `components/layout/nav-items.ts:26-40` — sidebar структура.
- `.planning/phases/08-support-mvp/08-RESEARCH.md` — 40K словарь WB API и проектных паттернов.
- `.planning/phases/09-returns/09-RESEARCH.md` — token split pattern, decision matrix Option A/B cron.
- `.planning/phases/09-returns/09-VERIFICATION.md` — UAT структура, 20-пункт checklist pattern.
- `CLAUDE.md` — conventions (русский, Moscow TZ, curl fallback, native select, Auth.js v5, prisma singleton).

### Secondary (MEDIUM confidence)

- [WB API 2024 review](https://dev.wildberries.ru/en/news/82) — подтверждает активную разработку Chat API.
- [openapi.wildberries.ru/buyers-chat/api/ru](https://openapi.wildberries.ru/buyers-chat/api/ru/) — ECONNREFUSED при research (HTTP 503 или временная недоступность), но это канонический источник.
- [seller.wildberries.ru/instructions/ru/ru/material/chat](https://seller.wildberries.ru/instructions/ru/ru/material/chat) — seller-facing инструкция (чат «в тестировании, не всем»).

### Tertiary (LOW confidence — требует валидации на проде)

- **TLS fingerprint поведение Chat API** — предположительно Node fetch работает; финальное подтверждение через Wave 0 curl/node сравнение.
- **replySign TTL** — предположительно долгоживущий, но ротируется при sync. Реальная динамика проверяется на проде через 24-48 часов после первого deploy.
- **Точный лимит файлов в multipart** — документация не указывает (только «≤5 MB each, ≤30 MB total»). По факту, вероятно 5-10 файлов max; тест на проде.
- **Поведение 19000 пустых chats** — форумный report не подтверждён Zoiten-контекстом; возможно специфика крупного продавца. Для Zoiten (50-200 SKU) ожидается <100 chats.

## Metadata

**Confidence breakdown:**
- WB Chat API endpoints + schemas: **HIGH** — 5 endpoints verified через Swagger + SDK.
- **Отсутствие auto-reply endpoint**: **HIGH** — 3 независимых источника.
- Multipart upload формат: **HIGH** — явно указан в Swagger.
- Scope bit 9 (Buyers chat): **HIGH** — официальная таблица.
- Rate limits 10/10s: **HIGH** — явно документировано.
- Data model (AutoReplyConfig singleton + SupportTicket extension + wbEventId): **HIGH** — consistent with Phase 8/9 patterns.
- AutoReply cron logic (местное решение): **HIGH** — контролируется полностью нами.
- TLS fingerprint block существование: **MEDIUM** — не подтверждено источниками, вероятно работает Node fetch.
- replySign TTL / ротация: **LOW** — не документировано, предположение на обновление при каждом /chats call.
- 19000 пустых chats edge case: **LOW** — форум, специфика конкретного seller.
- Token scope bit 9 для WB_API_TOKEN на VPS: **UNKNOWN** — Wave 0 blocker.

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (30 дней — WB API стабильное, но автоответ endpoint может появиться в будущих release notes — перепроверить перед Phase 10 execution)

## RESEARCH COMPLETE
